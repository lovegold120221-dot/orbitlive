'use client';

import * as React from 'react';
import { Track, type RemoteAudioTrack, type Room, type TrackPublication } from 'livekit-client';
import { useRoomContext, useSpeakingParticipants, useTracks } from '@livekit/components-react';

export type OrbitTranslatorStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'translating'
  | 'playing'
  | 'error';

/**
 * Target languages for Orbit Live Translator (Gemini Live Translate).
 * Codes are BCP-47 and passed straight through as
 * translationConfig.targetLanguageCode — one per listener, never global.
 */
// The target-language list lives in lib/orbit-languages.ts (247 targets).
import { languageLabel } from '@/lib/orbit-languages';
export { ORBIT_LANGUAGES, languageLabel } from '@/lib/orbit-languages';

/**
 * How loud incoming remote audio plays while the translator is running.
 * Ducked well below the translated playback (which stays at full gain) so the
 * translation is intelligible without muting the speaker.
 */
export const DEFAULT_INCOMING_VOLUME = 0.15;

/** Every remote audio publication currently in the room (mics + screen audio). */
function collectRemoteAudioTracks(room: Room) {
  const out: Array<{ publication: TrackPublication; track: RemoteAudioTrack }> = [];
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.audioTrackPublications.values()) {
      const track = pub.track;
      if (track && track.kind === Track.Kind.Audio) {
        out.push({ publication: pub, track: track as RemoteAudioTrack });
      }
    }
  }
  return out;
}

type MaybeLocalSource = { source: Track.Source; participant: { isLocal: boolean } };

/**
 * Whether an audio source may be translated.
 *
 * The local device MICROPHONE is the one source that never is. It is the user's
 * own voice, and their speakers sit right beside it: playing a translated copy
 * back out of `ctx.destination` would be re-captured by that open microphone and
 * fed straight back into the translator as a feedback loop.
 *
 * The local SCREEN-SHARE audio *is* eligible. Its audio is captured from a tab /
 * window / display, not from the microphone, so the user is hearing a
 * translation of what they are presenting rather than a translation of
 * themselves — and it is the only way they hear that content translated at all,
 * since LiveKit never renders a local track back to its own publisher.
 */
function isTranslatableSource(ref: MaybeLocalSource): boolean {
  return !(ref.participant.isLocal && ref.source === Track.Source.Microphone);
}

/** Display name for a source, disambiguating the local participant as "You". */
function sourceNameOf(p: {
  isLocal: boolean;
  name?: string | null;
  identity?: string | null;
}): string {
  if (p.isLocal) return 'You';
  return p.name || p.identity || 'participant';
}

interface OrbitTranslatorCtx {
  targetLang: string;
  setTargetLang: (c: string) => void;
  status: OrbitTranslatorStatus;
  statusDetail: string;
  isActive: boolean;
  start: () => void;
  stop: () => void;
  original: string;
  translated: string;
  sourceCount: number;
  micCount: number;
  screenAudioCount: number;
  activeSpeakerName: string | null;
  audioLevel: number;
  /** 0–1 level of the translated-audio playback, for the panel visualizer. */
  playbackLevel: number;
  /** True while a translated chunk is actually sounding. */
  isPlayingTranslation: boolean;
  /** The local user is publishing a screen share. */
  isLocalSharingScreen: boolean;
  /** ...and that share carries an audio track the translator can use. */
  hasLocalScreenAudio: boolean;
  lastError: string | null;
  sourceLabels: string[];
  backendReady: boolean | null;
  /** Gain for incoming remote audio while translating (0–1). */
  incomingVolume: number;
  setIncomingVolume: (v: number) => void;
}

const Ctx = React.createContext<OrbitTranslatorCtx | null>(null);

export function useOrbitTranslator() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error('useOrbitTranslator must be used inside OrbitTranslatorProvider');
  return v;
}

const WS_PATH = '/orbit-translator/';
const SAMPLE_RATE = 16000;
// const CHUNK_SAMPLES = 1600; // ~100 ms at 16 kHz (enforced by the worklet block size)
// Energy gate so silence is never streamed to Gemini: peak amplitude above
// this opens the gate, and audio keeps flowing for the hangover window after
// speech so utterance tails are never clipped.
const SPEECH_GATE_THRESHOLD = 0.02;
const SPEECH_HANGOVER_MS = 800;

function resolveWsUrl(): string {
  const env = process.env.NEXT_PUBLIC_ORBIT_TRANSLATOR_WS;
  if (env) return env;
  if (typeof window === 'undefined') return '';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${WS_PATH}`;
}

function floatTo16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    out[i] = v < 0 ? Math.round(v * 32768) : Math.round(v * 32767);
  }
  return out;
}

function parsePcmRate(mimeType: string | undefined, fallback: number): number {
  const m = /rate=(\d+)/.exec(String(mimeType || ''));
  const r = m ? parseInt(m[1], 10) : NaN;
  return Number.isFinite(r) && r > 0 ? r : fallback;
}

interface SessionState {
  ws: WebSocket | null;
  ctx: AudioContext | null;
  mixer: GainNode | null;
  tap: AudioWorkletNode | null;
  keepalive: GainNode | null;
  /** trackKey -> graph nodes for one eligible remote source */
  sources: Map<string, { src: MediaStreamAudioSourceNode; gain: GainNode; stream: MediaStream }>;
  /** sequential translated-audio playback */
  queue: Array<{ seq: number; chunk: string; mimeType: string }>;
  playing: boolean;
  pumpScheduled: boolean;
  stopPlayback: boolean;
  currentSource: AudioBufferSourceNode | null;
  translatedGain: GainNode | null;
  /** Tap on the translated output, for the playback visualizer. */
  translatedAnalyser: AnalyserNode | null;
  levelRaf: number | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  retried: boolean;
  disposed: boolean;
  /** performance.now() of the last above-threshold block (energy gate). */
  lastSpeechAt: number;
  /** cumulative count of PCM frames sent (operator diagnostics). */
  framesSent: number;
}

function emptySession(): SessionState {
  return {
    ws: null,
    ctx: null,
    mixer: null,
    tap: null,
    keepalive: null,
    sources: new Map(),
    queue: [],
    playing: false,
    pumpScheduled: false,
    stopPlayback: false,
    currentSource: null,
    translatedGain: null,
    translatedAnalyser: null,
    levelRaf: null,
    retryTimer: null,
    retried: false,
    disposed: false,
    lastSpeechAt: 0,
    framesSent: 0,
  };
}

/**
 * Orbit Live Translator — personal realtime translation layer.
 *
 * Architecture:
 *   LiveKit Room (real conference/media transport)
 *     → remote microphone + screen-share audio publications/tracks
 *     → incoming translation audio bus (Web Audio mixer, remote only)
 *     → AudioWorklet PCM pipeline (16 kHz mono, ~100 ms chunks)
 *     → Orbit translator service WebSocket (server holds GEMINI_API_KEY,
 *        runs models/gemini-3.5-live-translate-preview, never exposes the key)
 *     → Gemini 3.5 Live Translate (speech translation)
 *     → translation store (status + Original + Translation)
 *     → translated-audio player (sequential queue → local speakers)
 *     → Translator panel (controls + visual feedback; view only)
 *
 * Critical routing rules (enforced, not just documented):
 * - The local device MICROPHONE is never a translation source. Playing a
 *   translated version of your own voice would send it out of the speakers,
 *   straight back into the open microphone, and re-enter the translator as a
 *   feedback loop. The local SCREEN SHARE *is* a source — that audio is
 *   captured from a tab / display, not the mic, and the local user needs to
 *   hear what they are presenting. See `isTranslatableSource`.
 * - Nothing is scraped from <audio>/<video> DOM elements. The bus is built
 *   from LiveKit track publications (publication.track.mediaStreamTrack).
 * - RoomAudioRenderer and subscriptions are untouched: sources are observed
 *   via additional MediaStreamSource nodes, never muted or unsubscribed.
 * - The session lives in this provider (meeting level). Hiding the panel only
 *   unmounts the view; translation continues until Stop / leave / failure.
 */
export function OrbitTranslatorProvider({ children }: { children: React.ReactNode }) {
  const room = useRoomContext();
  const [targetLang, setTargetLangState] = React.useState('en');
  const [status, setStatus] = React.useState<OrbitTranslatorStatus>('idle');
  const [statusDetail, setStatusDetail] = React.useState('Translator idle');
  const [isActive, setIsActive] = React.useState(false);
  const [original, setOriginal] = React.useState('');
  const [translated, setTranslated] = React.useState('');
  const [lastError, setLastError] = React.useState<string | null>(null);
  const [audioLevel, setAudioLevel] = React.useState(0);
  const [backendReady, setBackendReady] = React.useState<boolean | null>(null);
  // Gain applied to *incoming* (remote) audio while translating, so the
  // translated speech is easier to follow. 0 = muted, 1 = untouched.
  const [incomingVolume, setIncomingVolumeState] = React.useState(DEFAULT_INCOMING_VOLUME);
  // Output level of the translated-audio playback, 0–1, sampled from an
  // AnalyserNode on the translated gain. Drives the panel's visualizer so the
  // bars track what is actually coming out of the speakers.
  const [playbackLevel, setPlaybackLevel] = React.useState(0);
  const [isPlayingTranslation, setIsPlayingTranslation] = React.useState(false);

  const sessRef = React.useRef<SessionState>(emptySession());
  const activeRef = React.useRef(false);
  const targetRef = React.useRef(targetLang);
  const statusRef = React.useRef(status);
  // A target change awaiting backend acknowledgement, so it can be rolled
  // back if the model rejects the language code.
  const pendingTargetRef = React.useRef<{ code: string; previous: string } | null>(null);
  targetRef.current = targetLang;
  statusRef.current = status;

  // Transcript histories (refs) mirrored to state for rendering.
  const origHistRef = React.useRef<string[]>([]);
  const transHistRef = React.useRef<string[]>([]);
  const origLiveRef = React.useRef('');
  const transLiveRef = React.useRef('');
  const lastLevelPushRef = React.useRef(0);

  // Eligible translation sources: remote mics, remote screen-share audio, AND
  // the local screen share. Only the local device microphone is excluded — see
  // `isTranslatableSource`.
  // NOTE: queried WITHOUT onlySubscribed and filtered to live MediaStreamTracks
  // below. onlySubscribed:true proved unreliable in this tree (returned [] while
  // remote subscribed tracks existed); liveness of the actual MediaStreamTrack
  // is the ground truth the audio bus needs anyway.
  const incomingMic = useTracks([Track.Source.Microphone]);
  const incomingScreenAudio = useTracks([Track.Source.ScreenShareAudio]);
  // The local user is sharing their screen (video published), which is what
  // lets us warn when the share came with no audio track to translate.
  const localScreenShareVideo = useTracks([Track.Source.ScreenShare]);
  const isLocalSharingScreen = React.useMemo(
    () => localScreenShareVideo.some((r) => r.participant.isLocal),
    [localScreenShareVideo],
  );

  const trackKeyOf = React.useCallback((ref: (typeof incomingRefs)[number]) => {
    const sid = (ref.publication as unknown as { trackSid?: string } | undefined)?.trackSid;
    return sid || `${ref.participant.identity}:${ref.source}`;
  }, []);

  const mediaStreamTrackOf = React.useCallback((ref: (typeof incomingRefs)[number]) => {
    const t = (ref.publication as unknown as { track?: unknown } | undefined)?.track as
      | { mediaStreamTrack?: MediaStreamTrack }
      | undefined;
    const mst = t?.mediaStreamTrack;
    return mst && mst.readyState === 'live' ? mst : null;
  }, []);

  const incomingRefs = React.useMemo(() => {
    const all = [...incomingMic, ...incomingScreenAudio];
    return all.filter((ref) => {
      // Drops the local microphone; keeps the local screen share.
      if (!isTranslatableSource(ref)) return false;
      // Only tracks with a live MediaStreamTrack can feed the bus.
      const t = (ref.publication as unknown as { track?: unknown } | undefined)?.track as
        | { mediaStreamTrack?: MediaStreamTrack }
        | undefined;
      const mst = t?.mediaStreamTrack;
      return !!mst && mst.readyState === 'live';
    });
  }, [incomingMic, incomingScreenAudio]);

  const micCount = React.useMemo(
    () => incomingRefs.filter((r) => r.source === Track.Source.Microphone).length,
    [incomingRefs],
  );
  const screenAudioCount = React.useMemo(
    () => incomingRefs.filter((r) => r.source === Track.Source.ScreenShareAudio).length,
    [incomingRefs],
  );

  /** True when the local user is sharing with audio, so their own share translates. */
  const localScreenAudioCount = React.useMemo(
    () =>
      incomingRefs.filter(
        (r) => r.participant.isLocal && r.source === Track.Source.ScreenShareAudio,
      ).length,
    [incomingRefs],
  );

  /* ---------------- duck incoming remote audio while translating ---------------- */

  /**
   * Collects every remote audio publication. Deliberately NOT memoised: a
   * publication can appear or disappear without changing `incomingRefs.length`
   * (that list only keeps tracks whose MediaStreamTrack is live), so keying a
   * memo off that count left this list stale and newly-joined audio unducked.
   */
  const remoteAudioTracks = collectRemoteAudioTracks(room);
  // Stable identity for "the set of remote audio tracks changed".
  const remoteAudioKey = remoteAudioTracks.map((t) => t.publication.trackSid).join('|');

  const applyIncomingVolume = React.useCallback(
    (v: number) => {
      // Primary path: the LiveKit API. Applies to every attached <audio> and
      // is re-applied by the SDK when a new element attaches.
      for (const { track } of collectRemoteAudioTracks(room)) {
        try {
          track.setVolume(v);
        } catch (err) {
          console.warn('could not set incoming audio volume', err);
        }
      }
      // Second, independent pass directly over the rendered elements. The SDK
      // only re-applies a stored volume on attach when that value is truthy,
      // and only for elements attached at that moment; this covers the gaps.
      // LiveKit tags each element with data-lk-source and
      // data-lk-local-participant, so our own playback is never touched.
      for (const el of Array.from(document.querySelectorAll('audio[data-lk-source]'))) {
        if (el.getAttribute('data-lk-local-participant') === 'true') continue;
        (el as HTMLAudioElement).volume = v;
      }
    },
    [room],
  );

  React.useEffect(() => {
    if (!isActive) return;
    applyIncomingVolume(incomingVolume);
  }, [isActive, incomingVolume, remoteAudioKey, applyIncomingVolume]);

  // Restore full volume the moment translation stops, so the meeting is never
  // left quiet behind our back.
  const wasActive = React.useRef(false);
  React.useEffect(() => {
    if (isActive) {
      wasActive.current = true;
      return;
    }
    if (!wasActive.current) return;
    wasActive.current = false;
    applyIncomingVolume(1);
  }, [isActive, remoteAudioKey, applyIncomingVolume]);

  const setIncomingVolume = React.useCallback(
    (v: number) => {
      const clamped = Math.min(1, Math.max(0, v));
      setIncomingVolumeState(clamped);
      // Apply immediately so dragging the slider is audible, including when the
      // translator has not been started yet.
      if (activeRef.current) applyIncomingVolume(clamped);
    },
    [applyIncomingVolume],
  );

  const sourceLabels = React.useMemo(
    () =>
      incomingRefs.map((r) => {
        const kind = r.source === Track.Source.ScreenShareAudio ? 'screen audio' : 'microphone';
        return `${sourceNameOf(r.participant)} · ${kind}`;
      }),
    [incomingRefs],
  );

  const speaking = useSpeakingParticipants();
  // Who the live transcript is attributed to. Remote speakers win; when the
  // only thing being translated is the local user's own screen share, that is
  // still worth naming rather than showing a blank speaker.
  const activeSpeakerName = React.useMemo(() => {
    const remote = speaking.find((p) => !p.isLocal);
    if (remote) return sourceNameOf(remote);
    if (localScreenAudioCount > 0) return 'You';
    return null;
  }, [speaking, localScreenAudioCount]);

  const renderOriginal = React.useCallback(() => {
    const parts = [...origHistRef.current];
    if (origLiveRef.current.trim()) parts.push(`…${origLiveRef.current.trim()}`);
    setOriginal(parts.join('\n').slice(-8000));
  }, []);

  const renderTranslated = React.useCallback(() => {
    const parts = [...transHistRef.current];
    if (transLiveRef.current.trim()) parts.push(`…${transLiveRef.current.trim()}`);
    setTranslated(parts.join('\n').slice(-8000));
  }, []);

  const pushLevel = React.useCallback((level: number) => {
    const now = Date.now();
    if (now - lastLevelPushRef.current < 700) return;
    lastLevelPushRef.current = now;
    setAudioLevel((prev) => {
      const next = Math.round(Math.min(1, Math.max(0, level)) * 100);
      return prev === next ? prev : next;
    });
  }, []);

  /**
   * Samples the translated output once per animation frame and publishes a
   * smoothed 0–1 level for the panel visualizer.
   *
   * Reads the analyser's time-domain buffer, which reflects what the speakers
   * are actually emitting — so the bars are driven by real playback, not by
   * the transcript or the play/pause status. When nothing is playing the buffer
   * decays to zero and the bars fall on their own.
   */
  const runPlaybackLevelLoop = React.useCallback(() => {
    const S = sessRef.current;
    if (S.disposed) return;
    const analyser = S.translatedAnalyser;
    if (!analyser) return;

    const buf = new Float32Array(analyser.fftSize);
    let last = 0;

    const tick = (now: number) => {
      const cur = sessRef.current;
      if (cur.disposed) return;
      if (cur.translatedAnalyser !== analyser) return; // graph was rebuilt
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      // Perceptual-ish curve: speech RMS sits low, so a linear bar barely
      // moves. Then decay hard when idle so silence reads as silence.
      const shaped = Math.min(1, Math.pow(rms * 3.2, 0.6));
      // ~30 fps is plenty for bars and keeps React renders bounded.
      if (now - last > 33) {
        last = now;
        setPlaybackLevel(shaped);
        setIsPlayingTranslation(cur.playing);
      }
      cur.levelRaf = requestAnimationFrame(tick);
    };
    S.levelRaf = requestAnimationFrame(tick);
  }, []);

  /* ---------------- translated-audio playback (sequential queue) ---------------- */

  const decodePcmChunk = React.useCallback(
    (base64: string, mimeType: string, ctx: AudioContext): AudioBuffer | null => {
      try {
        // Trust the reported rate, not a constant (model reports
        // audio/pcm;rate=24000 today; a constant would play everything at the
        // wrong speed if that ever changes).
        const rate = parsePcmRate(mimeType, 24000);
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const frames = Math.floor(bytes.length / 2);
        if (!frames) return null;
        const buffer = ctx.createBuffer(1, frames, rate);
        const out = buffer.getChannelData(0);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
        for (let i = 0; i < frames; i++) out[i] = view.getInt16(i * 2, true) / 32768;
        return buffer;
      } catch {
        return null;
      }
    },
    [],
  );

  const pumpPlayback = React.useCallback(() => {
    const S = sessRef.current;
    if (S.pumpScheduled || S.playing || S.disposed) return;
    const item = S.queue.shift();
    if (!item || !S.ctx || !S.translatedGain) {
      if (activeRef.current && statusRef.current === 'playing') {
        setStatus('listening');
        setStatusDetail('Listening for incoming speech…');
      }
      return;
    }
    const buffer = decodePcmChunk(item.chunk, item.mimeType, S.ctx);
    if (!buffer) {
      S.pumpScheduled = false;
      // Use a microtask loop rather than recursion for decode failures.
      setTimeout(() => {
        S.pumpScheduled = false;
        (sessRef.current as SessionState | null) && pumpPlaybackRef.current();
      }, 0);
      return;
    }
    S.pumpScheduled = true;
    S.playing = true;
    setStatus('playing');
    setStatusDetail('Playing translated speech…');
    try {
      const src = S.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(S.translatedGain);
      S.currentSource = src;
      src.onended = () => {
        const cur = sessRef.current;
        cur.playing = false;
        cur.pumpScheduled = false;
        cur.currentSource = null;
        if (cur.stopPlayback) {
          cur.queue.length = 0;
          cur.stopPlayback = false;
        }
        if (cur.queue.length > 0 && !cur.disposed) {
          pumpPlaybackRef.current();
        } else if (activeRef.current) {
          setStatus('listening');
          setStatusDetail('Listening for incoming speech…');
        }
      };
      src.start();
    } catch {
      S.playing = false;
      S.pumpScheduled = false;
    }
  }, [decodePcmChunk]);

  const pumpPlaybackRef = React.useRef(pumpPlayback);
  pumpPlaybackRef.current = pumpPlayback;

  /* ---------------- incoming audio bus (remote mics + screen-share audio) ---------------- */

  /** Reconcile the Web Audio bus with the current eligible track set. */
  const reconcileBus = React.useCallback(() => {
    const S = sessRef.current;
    if (!S.ctx || !S.mixer || !activeRef.current || S.disposed) return;
    const wanted = new Map<string, (typeof incomingRefs)[number]>();
    for (const ref of incomingRefs) {
      // Belt and suspenders: re-derive the same rule the ref list used, so the
      // bus can never pick up a source the list rejected.
      if (!isTranslatableSource(ref)) continue;
      const mst = mediaStreamTrackOf(ref);
      if (!mst) continue;
      wanted.set(trackKeyOf(ref), ref);
    }
    // Remove departed / replaced tracks.
    for (const [key, nodes] of S.sources) {
      const ref = wanted.get(key);
      const mst = ref ? mediaStreamTrackOf(ref) : null;
      let current: MediaStreamTrack | null = null;
      try {
        // @ts-ignore - internal stream inspection for replacement detection
        current = nodes.stream?.getAudioTracks?.()[0] ?? null;
      } catch {
        current = null;
      }
      if (!ref || !mst || mst !== current) {
        try {
          nodes.src.disconnect();
        } catch {
          // ignore
        }
        try {
          nodes.gain.disconnect();
        } catch {
          // ignore
        }
        S.sources.delete(key);
      } else {
        wanted.delete(key);
      }
    }
    // Add new tracks. All sources sum into the single mixer GainNode in native
    // code — that summed bus is what the Gemini session consumes.
    for (const [key, ref] of wanted) {
      const mst = mediaStreamTrackOf(ref);
      if (!mst || !S.ctx || !S.mixer) continue;
      try {
        const stream = new MediaStream([mst]);
        const src = S.ctx.createMediaStreamSource(stream);
        const gain = S.ctx.createGain();
        gain.gain.value = 1;
        src.connect(gain);
        gain.connect(S.mixer);
        S.sources.set(key, { src, gain, stream });
      } catch {
        // per-track failures must not break the rest of the bus
      }
    }
  }, [incomingRefs, mediaStreamTrackOf, trackKeyOf]);

  // Keep the bus in sync as participants join/leave/mute/publish/republish —
  // without restarting the meeting or the translation session.
  React.useEffect(() => {
    reconcileBus();
  }, [reconcileBus]);

  /* ---------------- Gemini session over the translator service ---------------- */

  const teardownGraph = React.useCallback(() => {
    const S = sessRef.current;
    if (S.retryTimer) {
      clearTimeout(S.retryTimer);
      S.retryTimer = null;
    }
    // The visualizer reads an analyser owned by this graph, so it must stop
    // before the graph goes away or it would sample a torn-down node.
    if (S.levelRaf !== null) {
      cancelAnimationFrame(S.levelRaf);
      S.levelRaf = null;
    }
    setPlaybackLevel(0);
    setIsPlayingTranslation(false);
    for (const [, nodes] of S.sources) {
      try {
        nodes.src.disconnect();
      } catch {
        // ignore
      }
      try {
        nodes.gain.disconnect();
      } catch {
        // ignore
      }
    }
    S.sources.clear();
    try {
      S.tap?.port.postMessage({ type: 'stop' });
    } catch {
      // ignore
    }
    try {
      S.tap?.disconnect();
    } catch {
      // ignore
    }
    try {
      S.keepalive?.disconnect();
    } catch {
      // ignore
    }
    try {
      S.mixer?.disconnect();
    } catch {
      // ignore
    }
    S.tap = null;
    S.keepalive = null;
    S.mixer = null;
    // Stop translated playback immediately.
    S.stopPlayback = true;
    S.queue.length = 0;
    try {
      S.currentSource?.stop();
    } catch {
      // ignore
    }
    S.currentSource = null;
    S.playing = false;
    S.pumpScheduled = false;
    if (S.ctx) {
      const ctx = S.ctx;
      S.ctx = null;
      S.translatedGain = null;
      S.translatedAnalyser = null;
      void ctx.close().catch(() => {});
    }
  }, []);

  const closeSocket = React.useCallback(() => {
    const S = sessRef.current;
    if (S.retryTimer) {
      clearTimeout(S.retryTimer);
      S.retryTimer = null;
    }
    const ws = S.ws;
    S.ws = null;
    if (ws) {
      try {
        // Tell the backend to dispose the Gemini session.
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'stop' }));
      } catch {
        // ignore
      }
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
  }, []);

  const handleServerMessage = React.useCallback(
    (msg: Record<string, unknown>) => {
      const S = sessRef.current;
      if (S.disposed || !activeRef.current) return;
      const t = msg.t;
      if (t === 'source' && typeof msg.text === 'string' && msg.text.trim()) {
        // Original: realtime transcription of the incoming speaker.
        origLiveRef.current += (origLiveRef.current ? ' ' : '') + msg.text.trim();
        renderOriginal();
        if (statusRef.current === 'listening') {
          setStatus('translating');
          setStatusDetail('Translating incoming speech…');
        }
      } else if (t === 'translation' && typeof msg.text === 'string' && msg.text.trim()) {
        // Translation: realtime translated text from Gemini.
        transLiveRef.current += (transLiveRef.current ? ' ' : '') + msg.text.trim();
        renderTranslated();
        if (statusRef.current === 'listening') {
          setStatus('translating');
          setStatusDetail('Translating incoming speech…');
        }
      } else if (t === 'beta-turn') {
        // Turn boundary: commit the provisional lines to history.
        if (origLiveRef.current.trim()) {
          origHistRef.current.push(origLiveRef.current.trim());
          if (origHistRef.current.length > 60) origHistRef.current.shift();
          origLiveRef.current = '';
          renderOriginal();
        }
        if (transLiveRef.current.trim()) {
          transHistRef.current.push(transLiveRef.current.trim());
          if (transHistRef.current.length > 60) transHistRef.current.shift();
          transLiveRef.current = '';
          renderTranslated();
        }
        if (!S.playing && S.queue.length === 0 && statusRef.current !== 'playing') {
          setStatus('listening');
          setStatusDetail('Listening for incoming speech…');
        }
      } else if (t === 'audio' && typeof msg.chunk === 'string') {
        // Translated speech: sequential queue, never overlapping.
        const seq = typeof msg.seq === 'number' ? msg.seq : Date.now();
        S.queue.push({
          seq,
          chunk: msg.chunk,
          mimeType: typeof msg.mimeType === 'string' ? msg.mimeType : 'audio/pcm',
        });
        // Bound the backlog so a stall cannot grow memory without limit.
        if (S.queue.length > 40) S.queue.splice(0, S.queue.length - 40);
        pumpPlaybackRef.current();
      } else if (t === 'state') {
        const state = String(msg.state ?? '');
        if (state === 'session-open') {
          setStatusDetail('Session open — connecting translation…');
        } else if (state === 'live-connecting') {
          setStatus('connecting');
          setStatusDetail('Connecting to Gemini Live Translate…');
        } else if (state === 'live-open') {
          S.retried = false;
          setStatus('listening');
          const n = S.sources.size;
          setStatusDetail(
            n > 0
              ? `Listening to ${n} incoming audio track(s)…`
              : 'Listening — waiting for remote participants to speak…',
          );
        } else if (state === 'live-closed' || state === 'live-error') {
          setStatus('error');
          setLastError('Translation session closed unexpectedly');
          setStatusDetail('Translation session closed — press Stop then Start to resume');
        } else if (state === 'target') {
          // Backend accepted the retarget: stop expecting a rollback.
          pendingTargetRef.current = null;
          setStatusDetail(
            `Target language: ${languageLabel(String(msg.code ?? targetRef.current))}`,
          );
        } else if (state === 'stopped') {
          // Backend acknowledged our stop; local stop() already updated UI.
        }
      } else if (t === 'target') {
        pendingTargetRef.current = null;
        setStatusDetail(`Target language: ${languageLabel(String(msg.code ?? targetRef.current))}`);
      } else if (t === 'error') {
        const message = typeof msg.message === 'string' ? msg.message : 'Translation error';
        // If the backend could not apply the language we just asked for, roll
        // the selector back to the last target the model accepted so the
        // session keeps working instead of sitting on a broken target.
        const pending = pendingTargetRef.current;
        if (pending && /language|target|locale|code/i.test(message)) {
          pendingTargetRef.current = null;
          setTargetLangState(pending.previous);
          targetRef.current = pending.previous;
          setLastError(`${pending.code} is not supported by the translation service.`);
          setStatus('listening');
          setStatusDetail(`Target language: ${languageLabel(pending.previous)}`);
          return;
        }
        setLastError(message);
        setStatus('error');
        setStatusDetail('Translation error — will keep listening');
        setTimeout(() => {
          if (activeRef.current && !sessRef.current.disposed) {
            setStatus('listening');
            setStatusDetail('Listening for incoming speech…');
          }
        }, 3000);
      }
    },
    [renderOriginal, renderTranslated],
  );

  const handleServerMessageRef = React.useRef(handleServerMessage);
  handleServerMessageRef.current = handleServerMessage;

  const openSession = React.useCallback(() => {
    const S = sessRef.current;
    if (typeof window === 'undefined' || S.disposed) return;
    const url = resolveWsUrl();
    if (!url) {
      setStatus('error');
      setLastError('Translator service URL is not configured');
      setStatusDetail('Translator backend is not configured');
      return;
    }
    setStatus('connecting');
    setStatusDetail('Opening translation session…');
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e: unknown) {
      setStatus('error');
      setLastError(e instanceof Error ? e.message : 'Could not open translator socket');
      setStatusDetail('Could not reach the translation backend');
      return;
    }
    S.ws = ws;
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      if (sessRef.current.ws !== ws || !activeRef.current) return;
      try {
        // One session per listener; target language is personal, never global.
        ws.send(
          JSON.stringify({
            t: 'start',
            target: targetRef.current,
            engine: 'beta',
            sampleRate: SAMPLE_RATE,
          }),
        );
      } catch {
        // send failure surfaces via onerror/onclose
      }
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data) as Record<string, unknown>;
      } catch {
        return;
      }
      handleServerMessageRef.current(msg);
    };
    const onDown = () => {
      if (sessRef.current.ws !== ws) return;
      sessRef.current.ws = null;
      if (!activeRef.current || sessRef.current.disposed) return;
      // Single auto-retry so a transient drop does not kill the session.
      if (!sessRef.current.retried) {
        sessRef.current.retried = true;
        setStatus('connecting');
        setStatusDetail('Reconnecting translation session…');
        sessRef.current.retryTimer = setTimeout(() => {
          if (activeRef.current && !sessRef.current.disposed) openSessionRef.current();
        }, 2000);
      } else {
        setStatus('error');
        setLastError('Lost connection to the translation backend');
        setStatusDetail('Connection lost — press Stop then Start to resume');
      }
    };
    ws.onerror = () => {
      // onerror is always followed by onclose; handle once there.
    };
    ws.onclose = onDown;
  }, []);

  const openSessionRef = React.useRef(openSession);
  openSessionRef.current = openSession;

  const buildAudioGraph = React.useCallback(async (): Promise<boolean> => {
    const S = sessRef.current;
    if (typeof window === 'undefined') return false;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) throw new Error('Web Audio is not supported in this browser');
      // 16 kHz context: the browser resamples each source in native code, so
      // the worklet always observes 16 kHz mono and 1600-sample blocks are
      // exactly ~100 ms. Nothing is sent per render quantum.
      const ctx = new AC({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
      S.ctx = ctx;
      if (ctx.state === 'suspended') {
        // Browsers start suspended until a user gesture; Start is the gesture.
        await ctx.resume().catch(() => {});
      }
      await ctx.audioWorklet.addModule('/worklets/orbit-pcm-tap.js');

      // The incoming translation bus: sums every eligible source (remote mics,
      // remote screen audio, and the local screen share — but never the local
      // device microphone). Deliberately never connected to ctx.destination, so
      // untranslated source audio is never played back and cannot leak into the
      // room; only the translated result reaches the speakers.
      const mixer = ctx.createGain();
      mixer.gain.value = 1;
      S.mixer = mixer;

      const tap = new AudioWorkletNode(ctx, 'orbit-pcm-tap', {
        processorOptions: { targetRate: SAMPLE_RATE, blockMs: 100 },
      });
      S.tap = tap;
      mixer.connect(tap);
      // A worklet with no downstream can be optimized away; a zero-gain sink
      // keeps it running without producing any audible output.
      const keepalive = ctx.createGain();
      keepalive.gain.value = 0;
      tap.connect(keepalive);
      keepalive.connect(ctx.destination);
      S.keepalive = keepalive;

      // Separate gain chain for translated playback → local speakers only.
      // Never routed into any capture graph, so translated speech can never
      // feed back into the conference or the translator input.
      const translatedGain = ctx.createGain();
      translatedGain.gain.value = 1;
      translatedGain.connect(ctx.destination);
      S.translatedGain = translatedGain;

      // Tap the translated output for the panel's playback visualizer. An
      // AnalyserNode is a pass-through: it is deliberately left unconnected
      // downstream, since translatedGain already reaches the speakers, and it
      // must not be routed back into any capture path.
      const translatedAnalyser = ctx.createAnalyser();
      translatedAnalyser.fftSize = 1024;
      translatedAnalyser.smoothingTimeConstant = 0.6;
      translatedGain.connect(translatedAnalyser);
      S.translatedAnalyser = translatedAnalyser;

      tap.port.onmessage = (e: MessageEvent) => {
        const cur = sessRef.current;
        const data = e.data as { type?: string; samples?: ArrayLike<number> } | undefined;
        if (!data || data.type !== 'pcm' || !data.samples) return;
        if (!activeRef.current || cur.disposed) return;
        const ws = cur.ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const floatArr =
          data.samples instanceof Float32Array ? data.samples : Float32Array.from(data.samples);
        if (floatArr.length === 0) return;
        // Live level meter (throttled upstream).
        let peak = 0;
        for (let i = 0; i < floatArr.length; i += 8) {
          const a = Math.abs(floatArr[i]);
          if (a > peak) peak = a;
        }
        pushLevel(peak);
        // Energy gate: never stream silence to Gemini. It wastes quota and —
        // worse — invites the model to hallucinate speech from nothing. Speech
        // opens the gate; a hangover window carries utterance tails.
        const now = performance.now();
        if (peak > SPEECH_GATE_THRESHOLD) {
          cur.lastSpeechAt = now;
        }
        if (now - cur.lastSpeechAt > SPEECH_HANGOVER_MS && cur.lastSpeechAt !== 0) {
          return;
        }
        if (cur.lastSpeechAt === 0 && peak <= SPEECH_GATE_THRESHOLD) {
          return;
        }
        // One packed binary frame per ~100 ms block:
        // [8-byte header: type=1, uint32LE sourceIndex=0][Int16 LE PCM].
        const pcm = floatTo16(floatArr);
        const frame = new ArrayBuffer(8 + pcm.byteLength);
        const view = new DataView(frame);
        view.setUint8(0, 1);
        view.setUint32(4, 0, true);
        new Int16Array(frame, 8).set(pcm);
        try {
          ws.send(frame);
          cur.framesSent += 1;
        } catch {
          // a failed send surfaces via the socket lifecycle
        }
      };

      reconcileBus();
      runPlaybackLevelLoop();
      return true;
    } catch (e: unknown) {
      setStatus('error');
      setLastError(e instanceof Error ? e.message : 'Audio setup failed');
      setStatusDetail('Could not set up translation audio — check permissions');
      teardownGraph();
      return false;
    }
  }, [pushLevel, reconcileBus, runPlaybackLevelLoop, teardownGraph]);

  const start = React.useCallback(() => {
    if (activeRef.current) return;
    setLastError(null);
    origHistRef.current = [];
    transHistRef.current = [];
    origLiveRef.current = '';
    transLiveRef.current = '';
    setOriginal('');
    setTranslated('');
    sessRef.current.disposed = false;
    sessRef.current.retried = false;
    activeRef.current = true;
    setIsActive(true);
    setStatus('connecting');
    setStatusDetail('Starting translator…');
    void buildAudioGraph().then((ok) => {
      if (!ok || !activeRef.current) return;
      openSessionRef.current();
    });
  }, [buildAudioGraph]);

  const stop = React.useCallback(() => {
    activeRef.current = false;
    setIsActive(false);
    closeSocket();
    teardownGraph();
    origLiveRef.current = '';
    transLiveRef.current = '';
    setStatus('idle');
    setStatusDetail('Translator idle');
    setAudioLevel(0);
  }, [closeSocket, teardownGraph]);

  const setTargetLang = React.useCallback((code: string) => {
    const previous = targetRef.current;
    setTargetLangState(code);
    targetRef.current = code;
    // Reconfigure the live session in place (no reconnect needed): the
    // backend applies translationConfig.targetLanguageCode to this
    // listener's session only. Other participants are unaffected.
    const ws = sessRef.current.ws;
    if (activeRef.current && ws && ws.readyState === WebSocket.OPEN) {
      // Remembered so a rejected code can be rolled back — the backend does
      // not validate language codes, it forwards them to the model, and some
      // of the long-tail codes may not be recognised.
      pendingTargetRef.current = { code, previous };
      try {
        ws.send(JSON.stringify({ t: 'target', code }));
        setStatusDetail(`Switching translation target to ${languageLabel(code)}…`);
      } catch {
        // ignore; the session continues with the previous target
      }
    }
  }, []);

  // Operator diagnostics (mirrors LiveKit's window.__lk_room pattern):
  // read-only snapshot of the translation session for field debugging.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as unknown as Record<string, unknown>).__orbitTranslator = {
      snapshot: () => {
        const S = sessRef.current;
        return {
          status: statusRef.current,
          active: activeRef.current,
          target: targetRef.current,
          eligibleRefs: incomingRefs.length,
          busSources: [...S.sources.keys()],
          wsState: S.ws ? S.ws.readyState : null,
          queue: S.queue.length,
          playing: S.playing,
          framesSent: S.framesSent,
          hasAudioContext: !!S.ctx,
        };
      },
    };
    return () => {
      try {
        delete (window as unknown as Record<string, unknown>).__orbitTranslator;
      } catch {
        // ignore
      }
    };
  }, [incomingRefs.length]);

  // Backend readiness probe (server-side model check; the API key never
  // leaves the server — this route only returns {ok, model}).
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/orbit-translator-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled) setBackendReady(j?.ok === true);
      })
      .catch(() => {
        if (!cancelled) setBackendReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the status line honest about the bus while listening.
  React.useEffect(() => {
    if (!isActive || status !== 'listening') return;
    const n = incomingRefs.length;
    setStatusDetail(
      n > 0
        ? `Listening to ${n} incoming audio track(s)…`
        : 'Listening — waiting for remote participants to speak…',
    );
  }, [incomingRefs.length, isActive, status]);

  // Full cleanup on meeting unmount (leaving also disposes the Gemini
  // session, AudioContext, worklet, buffers and listeners). Closing the
  // Translator *panel* does not unmount this provider, so hiding the panel
  // never stops translation.
  React.useEffect(() => {
    const S = sessRef.current;
    return () => {
      S.disposed = true;
      activeRef.current = false;
      try {
        if (S.ws && S.ws.readyState === WebSocket.OPEN) S.ws.send(JSON.stringify({ t: 'stop' }));
      } catch {
        // ignore
      }
      try {
        S.ws?.close();
      } catch {
        // ignore
      }
      S.ws = null;
      if (S.retryTimer) clearTimeout(S.retryTimer);
      for (const [, nodes] of S.sources) {
        try {
          nodes.src.disconnect();
        } catch {
          // ignore
        }
        try {
          nodes.gain.disconnect();
        } catch {
          // ignore
        }
      }
      S.sources.clear();
      try {
        S.currentSource?.stop();
      } catch {
        // ignore
      }
      if (S.ctx) void S.ctx.close().catch(() => {});
      // Room reference is unused after unmount; keep linters quiet.
      void room;
    };
  }, [room]);

  const value: OrbitTranslatorCtx = {
    targetLang,
    setTargetLang,
    status,
    statusDetail,
    isActive,
    start,
    stop,
    original,
    translated,
    sourceCount: incomingRefs.length,
    micCount,
    screenAudioCount,
    activeSpeakerName,
    audioLevel,
    playbackLevel,
    isPlayingTranslation,
    isLocalSharingScreen,
    hasLocalScreenAudio: localScreenAudioCount > 0,
    lastError,
    sourceLabels,
    backendReady,
    incomingVolume,
    setIncomingVolume,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
