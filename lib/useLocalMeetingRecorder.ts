'use client';
import * as React from 'react';
import {
  LocalVideoTrack,
  RemoteVideoTrack,
  Track,
  type Room,
  type VideoTrack,
} from 'livekit-client';

export type RecorderStatus = 'idle' | 'starting' | 'recording' | 'saving' | 'error';

interface RecorderApi {
  status: RecorderStatus;
  /** Seconds elapsed while recording, or null when not recording. */
  elapsed: number | null;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

/** Composite canvas size. 16:9, and a size every browser can encode cheaply. */
const OUT_W = 1280;
const OUT_H = 720;
const FPS = 25;
const MAX_CAMERAS = 6;

/**
 * Picks a container/codec pair the browser will actually record, best first.
 *
 * `MediaRecorder` throws NotSupportedError on an unlisted mimeType, so this has
 * to be probed rather than assumed — Safari in particular only offers MP4.
 */
function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      // keep probing
    }
  }
  return '';
}

function extensionFor(mime: string): string {
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('webm')) return 'webm';
  return 'bin';
}

/** Every video track currently visible to this client, camera + screen share. */
function collectVideoTracks(room: Room): VideoTrack[] {
  const out: VideoTrack[] = [];
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.videoTrackPublications.values()) {
      const t = pub.track;
      if (t && t.kind === Track.Kind.Video) out.push(t as VideoTrack);
    }
  }
  for (const pub of room.localParticipant.videoTrackPublications.values()) {
    const t = pub.track;
    if (t && t.kind === Track.Kind.Video) out.push(t as LocalVideoTrack);
  }
  return out;
}

function elementOf(track: VideoTrack): HTMLVideoElement | null {
  if (track.attachedElements.length > 0) {
    const el = track.attachedElements[0];
    if (el instanceof HTMLVideoElement) return el;
  }
  return null;
}

function labelFor(room: Room, track: VideoTrack): string {
  if (track instanceof LocalVideoTrack) return 'You';
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.videoTrackPublications.values()) {
      if (pub.track === track) return p.name || p.identity || 'Participant';
    }
  }
  return 'Participant';
}

/**
 * Draws one source into a rect, preserving aspect ratio and letterboxing rather
 * than stretching, so nobody's face ends up squashed.
 */
function drawContained(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  sw: number,
  sh: number,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (!sw || !sh) return;
  const scale = Math.min(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Records the meeting **locally**, in the browser, and downloads the file to
 * the user's own device. Nothing is uploaded and no recording server is
 * involved.
 *
 * How it works, and what that means:
 *
 *  - Audio is a true mixdown. Every remote audio track plus the local
 *    microphone is summed through a Web Audio `MediaStreamAudioDestinationNode`,
 *    so the recording contains everyone mixed together rather than one track
 *    at a time.
 *  - Video is composited by hand onto a 1280x720 canvas, because
 *    `MediaRecorder` cannot handle several video tracks in one stream — it
 *    silently keeps only the first. The canvas becomes the single video track.
 *  - The layout mirrors what the user is looking at: a screen share fills the
 *    frame when one is live, otherwise cameras sit in a grid.
 *
 * The honest limitation: this records *this participant's view* of the meeting.
 * It is a client-side recording, not an authoritative composite, so it is only
 * as good as the subscriptions this client holds. Server-side egress recording
 * (/api/record) is the separate, room-wide path.
 */
export function useLocalMeetingRecorder(room: Room): RecorderApi {
  const [status, setStatus] = React.useState<RecorderStatus>('idle');
  const [elapsed, setElapsed] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const teardownRef = React.useRef<(() => void) | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const startedAtRef = React.useRef(0);
  const tickRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const startingRef = React.useRef(false);

  const cleanup = React.useCallback(() => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    teardownRef.current?.();
    teardownRef.current = null;
    recorderRef.current = null;
    setElapsed(null);
  }, []);

  // Never leave a capture graph, a canvas, or a timer running on unmount.
  React.useEffect(() => cleanup, [cleanup]);

  const stop = React.useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    setStatus('saving');
    try {
      rec.stop();
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Could not stop the recording');
      cleanup();
    }
  }, [cleanup]);

  const startInner = React.useCallback(async () => {
    setError(null);

    if (typeof MediaRecorder === 'undefined') {
      setStatus('error');
      setError('This browser cannot record (MediaRecorder unavailable).');
      return;
    }

    setStatus('starting');

    let canvas: HTMLCanvasElement;
    let audioCtx: AudioContext;
    try {
      canvas = document.createElement('canvas');
      canvas.width = OUT_W;
      canvas.height = OUT_H;
      const ctx2d = canvas.getContext('2d', { alpha: false });
      if (!ctx2d) throw new Error('Could not create the recording canvas');

      // ---- audio: mix every audio track this client can hear -------------
      const AC: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AC();
      if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});

      const dest = audioCtx.createMediaStreamDestination();
      const audioNodes: Array<{ node: AudioNode; stream: MediaStream }> = [];
      const attach = (mst: MediaStreamTrack) => {
        try {
          const stream = new MediaStream([mst]);
          const node = audioCtx.createMediaStreamSource(stream);
          // A little headroom: summing N sources at unity gain clips as soon
          // as two people talk at once, which sounds like distortion.
          node.connect(dest);
          audioNodes.push({ node, stream });
        } catch {
          // a track we cannot tap is simply omitted
        }
      };

      for (const p of room.remoteParticipants.values()) {
        for (const pub of p.audioTrackPublications.values()) {
          const t = pub.track as unknown as { mediaStreamTrack?: MediaStreamTrack } | undefined;
          if (t?.mediaStreamTrack && t.mediaStreamTrack.readyState === 'live') {
            attach(t.mediaStreamTrack);
          }
        }
      }
      for (const pub of room.localParticipant.audioTrackPublications.values()) {
        const t = pub.track as unknown as { mediaStreamTrack?: MediaStreamTrack } | undefined;
        if (t?.mediaStreamTrack && t.mediaStreamTrack.readyState === 'live') {
          attach(t.mediaStreamTrack);
        }
      }

      // ---- video: composite onto the canvas ------------------------------
      const stream = canvas.captureStream(FPS);
      const videoTrack = stream.getVideoTracks()[0];

      /**
       * Only include the mixed audio track when something is actually mixed
       * into it.
       *
       * A `MediaStreamAudioDestinationNode` with no connected sources still
       * exposes an audio track, and handing that dead track to MediaRecorder
       * makes the muxer emit **zero bytes** for the whole recording — no
       * error, no `onerror`, just an empty file. Measured across vp9, vp8 and
       * the browser default: with the dead audio track, 0 chunks; without it,
       * 4 chunks and hundreds of kilobytes.
       *
       * This is not an edge case. Being alone with the microphone muted is the
       * default state after the pre-join screen, so "record with no audio
       * source" is the most likely thing a user does first.
       */
      const hasAudio = audioNodes.length > 0;
      const outStream = hasAudio
        ? new MediaStream([videoTrack, ...dest.stream.getAudioTracks()])
        : new MediaStream([videoTrack]);
      if (!hasAudio) {
        // Video-only is a perfectly good recording; say so rather than leaving
        // the user wondering why their file has no sound.
        setError(null);
        console.info(
          'Recording video only: no microphone or other participant audio is available to mix.',
        );
      }

      const mimeType = pickMimeType();
      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(outStream, mimeType ? { mimeType } : undefined);
      } catch {
        // No candidate worked; let the browser choose rather than fail outright.
        rec = new MediaRecorder(outStream);
      }
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onerror = (ev) => {
        setStatus('error');
        setError(
          (ev as unknown as { error?: Error }).error?.message ??
            'The browser stopped the recording unexpectedly',
        );
        cleanup();
      };
      rec.onstop = () => {
        const type = rec.mimeType || mimeType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type });
        const bytes = blob.size;
        chunksRef.current = [];
        if (bytes === 0) {
          setStatus('error');
          setError(
            hasAudio
              ? 'The recording produced no data. This browser could not encode the audio and video mix — try again with the microphone on, or record video only.'
              : 'The recording produced no data. Keep the meeting tab visible while recording — browsers stop producing video frames in a background tab.',
          );
          console.error('recorder produced an empty file', { hasAudio, mime: type });
          cleanup();
          return;
        }
        // Hand the file to the user's device.
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url;
        a.download = `orbit-meeting-${room.name || 'recording'}-${stamp}.${extensionFor(type)}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Give the download a moment to start before revoking.
        setTimeout(() => URL.revokeObjectURL(url), 30_000);

        setStatus('idle');
        cleanup();
      };

      // ---- draw loop ----------------------------------------------------
      let raf = 0;
      const draw = () => {
        raf = requestAnimationFrame(draw);
        const tracks = collectVideoTracks(room);
        const screen = tracks.find((t) => t.source === Track.Source.ScreenShare);
        const cams = tracks
          .filter((t) => t.source !== Track.Source.ScreenShare)
          .filter((t) => elementOf(t))
          .slice(0, MAX_CAMERAS);

        ctx2d.fillStyle = '#111318';
        ctx2d.fillRect(0, 0, OUT_W, OUT_H);

        const drawTile = (t: VideoTrack, x: number, y: number, w: number, h: number) => {
          const el = elementOf(t);
          if (el) {
            drawContained(ctx2d, el, el.videoWidth, el.videoHeight, x, y, w, h);
          } else {
            ctx2d.fillStyle = '#1c1f27';
            ctx2d.fillRect(x, y, w, h);
          }
          ctx2d.fillStyle = 'rgba(0,0,0,0.55)';
          roundRect(ctx2d, x + 12, y + h - 44, 20 + labelFor(room, t).length * 9, 28, 6);
          ctx2d.fill();
          ctx2d.fillStyle = '#fff';
          ctx2d.font = '16px system-ui, sans-serif';
          ctx2d.textBaseline = 'middle';
          ctx2d.fillText(labelFor(room, t), x + 22, y + h - 30);
        };

        if (screen) {
          // A live screen share owns the frame; cameras strip along the bottom.
          const stripH = cams.length > 0 ? 150 : 0;
          const bigH = OUT_H - stripH;
          drawTile(screen, 0, 0, OUT_W, bigH);
          if (cams.length > 0) {
            const w = OUT_W / cams.length;
            cams.forEach((t, i) => drawTile(t, i * w, bigH, w, stripH));
          }
        } else if (cams.length > 0) {
          // Grid that keeps tiles near 16:9 whatever the count.
          const cols = Math.ceil(Math.sqrt(cams.length));
          const rows = Math.ceil(cams.length / cols);
          const w = OUT_W / cols;
          const h = OUT_H / rows;
          cams.forEach((t, i) => {
            const c = i % cols;
            const r = Math.floor(i / cols);
            drawTile(t, c * w, r * h, w, h);
          });
        } else {
          ctx2d.fillStyle = '#8b90a0';
          ctx2d.font = '22px system-ui, sans-serif';
          ctx2d.textAlign = 'center';
          ctx2d.fillText('Recording — no camera or screen share is active', OUT_W / 2, OUT_H / 2);
          ctx2d.textAlign = 'left';
        }
      };
      raf = requestAnimationFrame(draw);

      teardownRef.current = () => {
        cancelAnimationFrame(raf);
        for (const n of audioNodes) {
          try {
            n.node.disconnect();
          } catch {
            // ignore
          }
        }
        for (const t of stream.getTracks()) {
          try {
            t.stop();
          } catch {
            // ignore
          }
        }
        for (const t of dest.stream.getTracks()) {
          try {
            t.stop();
          } catch {
            // ignore
          }
        }
        void audioCtx.close().catch(() => {});
      };

      rec.start(1000);
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      setStatus('recording');
      tickRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 1000);
    } catch (e) {
      cleanup();
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Could not start recording');
    }
  }, [cleanup, room]);

  /**
   * Re-entrancy guard. `recorderRef` is only assigned near the very end of
   * startInner, after an await, so checking it cannot see a second call already
   * in flight. Two overlapping starts used to create two canvases and two
   * MediaRecorders, and the second overwrote the teardown handle — so the first
   * leaked its capture graph, rAF loop and AudioContext for the life of the
   * page, and never produced a download.
   */
  const start = React.useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      await startInner();
    } finally {
      startingRef.current = false;
    }
  }, [startInner]);

  return { status, elapsed, error, start, stop };
}

export function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
