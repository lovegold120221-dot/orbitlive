'use client';
import * as React from 'react';
import toast from 'react-hot-toast';
import { useLocalParticipant, useRoomContext } from '@livekit/components-react';
import { isLocalTrack } from 'livekit-client';
import { BackgroundBlur } from '@livekit/track-processors';
import { avatarStyle, initialsOf } from './ParticipantTile';
import { useMeetingPrefs } from '@/lib/meeting-prefs';
import { pickLocalAvatar, setLocalAvatar, useLocalAvatar } from '@/lib/local-avatar';
import { formatElapsed } from '@/lib/useLocalMeetingRecorder';
import { useOrbitRecorder } from './OrbitRecorderProvider';
import { SettingsIcon } from './icons';

type Tab = 'settings' | 'profile' | 'more' | 'moderator';
type Backdrop = 'none' | 'blur' | 'pending';

/**
 * Moderator controls that exist in Jitsi but cannot be implemented in this
 * build. Shown with the reason instead of as dead switches, because a toggle
 * that silently does nothing is worse than an honest list.
 */
const PERMISSIONS: Array<{ label: string; why: string }> = [
  {
    label: 'Require a password to join',
    why: 'The passphrase has to be checked by the token endpoint.',
  },
  {
    label: 'Lobby, and knock before joining',
    why: 'Admitting a participant is a server-side room operation.',
  },
  {
    label: 'Mute participants on entry',
    why: 'The browser SDK can only publish or unpublish its own tracks.',
  },
  {
    label: 'Moderators only can unmute or share',
    why: 'Needs per-role track permissions on the token.',
  },
  {
    label: 'Remove or mute an individual participant',
    why: 'Server-side, for the same reason.',
  },
];

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="orbit-set-toggle">
      <div className="orbit-set-toggle-text">
        <span className="orbit-set-toggle-label">{label}</span>
        {hint && <span className="orbit-set-hint">{hint}</span>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
    </div>
  );
}

/**
 * The LiveKit browser SDK does not expose a moderator flag, so the role is read
 * from participant metadata, which the token endpoint controls. Every token
 * issued today grants the same permissions, so this is false for all users
 * until the endpoint stamps a role.
 */
function useIsModerator(metadata: string | undefined) {
  return React.useMemo(() => {
    if (!metadata) return false;
    try {
      const parsed = JSON.parse(metadata) as { role?: string };
      return parsed?.role === 'moderator';
    } catch {
      return false;
    }
  }, [metadata]);
}

function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="orbit-set-section">
      <label className="orbit-set-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="orbit-set-hint">{hint}</p>}
    </div>
  );
}

/**
 * Jitsi-style settings dialog: Settings / Profile tabs, a live camera
 * preview rendered from the real published track (so it reflects any
 * background processor), and a live microphone input-level meter.
 */
export function OrbitSettingsModal({ onClose }: { onClose: () => void }) {
  const room = useRoomContext();
  const { localParticipant, cameraTrack } = useLocalParticipant();

  const [tab, setTab] = React.useState<Tab>('settings');
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [camId, setCamId] = React.useState('');
  const [micId, setMicId] = React.useState('');
  const [displayName, setDisplayName] = React.useState(localParticipant.name ?? '');
  const [level, setLevel] = React.useState(0);
  const [backdrop, setBackdrop] = React.useState<Backdrop>('none');
  const [prefs, setPrefs] = useMeetingPrefs();
  // Remembered from the last meeting so the picker opens on the device in use.
  const [speakerId, setSpeakerId] = React.useState(prefs.speakerId);
  const isModerator = useIsModerator(localParticipant.metadata);
  const avatar = useLocalAvatar();
  const recorder = useOrbitRecorder();

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const meterCtx = React.useRef<AudioContext | null>(null);
  const meterStream = React.useRef<MediaStream | null>(null);
  const meterRaf = React.useRef(0);

  // useMeetingPrefs seeds from a post-mount read, so the initial state above
  // always saw the default. Adopt the stored speaker once it arrives — but
  // only if the user has not already chosen one in this dialog session.
  const speakerTouched = React.useRef(false);
  React.useEffect(() => {
    if (speakerTouched.current) return;
    if (prefs.speakerId) setSpeakerId(prefs.speakerId);
  }, [prefs.speakerId]);

  // Device labels are only exposed after permission is granted, so ask once.
  React.useEffect(() => {
    let cancelled = false;
    const load = async (needPermission: boolean) => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      let list: MediaDeviceInfo[];
      try {
        list = await navigator.mediaDevices.enumerateDevices();
      } catch (err) {
        console.warn('could not enumerate devices', err);
        return;
      }
      if (needPermission && !list.some((d) => d.label)) {
        try {
          const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          probe.getTracks().forEach((t) => t.stop());
          list = await navigator.mediaDevices.enumerateDevices();
        } catch {
          return;
        }
      }
      if (!cancelled) setDevices(list);
    };
    void load(false)
      .then(() => load(true))
      .catch((err: unknown) => console.warn('device load failed', err));
    return () => {
      cancelled = true;
    };
  }, []);

  /* Preview the selected camera locally. Uses a dedicated short-lived
     capture so we never disturb the track LiveKit is publishing. */
  React.useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    const video = videoRef.current;

    const stop = () => {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      if (video) video.srcObject = null;
    };

    const run = async () => {
      if (!navigator.mediaDevices?.getUserMedia) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: camId ? { deviceId: { exact: camId } } : true,
        });
        if (cancelled || !video) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      } catch {
        stop();
      }
    };

    void run();
    return () => {
      cancelled = true;
      stop();
    };
    // `tab` is a dependency because the <video> element only exists inside the
    // Devices tab. Switching to Profile and back mounts a brand-new element
    // while a [camId]-only effect never re-runs, leaving the preview black and
    // the browser's camera light on, streaming into a detached node.
  }, [camId, tab]);

  /* Live input-level meter, the way Jitsi shows mic feedback. */
  React.useEffect(() => {
    let cancelled = false;

    const cleanup = () => {
      cancelAnimationFrame(meterRaf.current);
      meterStream.current?.getTracks().forEach((t) => t.stop());
      meterStream.current = null;
      void meterCtx.current?.close().catch(() => undefined);
      meterCtx.current = null;
      setLevel(0);
    };

    const run = async () => {
      if (!navigator.mediaDevices?.getUserMedia) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: micId ? { deviceId: { exact: micId } } : true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        meterStream.current = stream;
        const ctx = new AudioContext();
        meterCtx.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);

        const tick = () => {
          if (cancelled) return;
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          // Scaled so normal speech fills a useful portion of the bar.
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3.5));
          meterRaf.current = requestAnimationFrame(tick);
        };
        meterRaf.current = requestAnimationFrame(tick);
      } catch {
        // Mic denied or unavailable: the bar simply stays empty.
        setLevel(0);
      }
    };

    cleanup();
    void run();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [micId]);

  // Reflect the processor already applied to the published track.
  React.useEffect(() => {
    const name = isLocalTrack(cameraTrack?.track)
      ? cameraTrack.track.getProcessor()?.name
      : undefined;
    if (name === 'background-blur') setBackdrop('blur');
  }, [cameraTrack]);

  const cameras = devices.filter((d) => d.kind === 'videoinput');
  const mics = devices.filter((d) => d.kind === 'audioinput');
  const speakers = devices.filter((d) => d.kind === 'audiooutput');

  /**
   * Plays a short two-tone chime through the *selected* output device, the way
   * Jitsi's "Test sound" button does.
   *
   * `setSinkId` redirects the whole AudioContext, so the tone really comes out
   * of the device the user picked rather than the system default — which is
   * the entire point of testing one. Browsers without sink selection fall back
   * to the default output.
   */
  const testTone = React.useCallback(async () => {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) {
      toast.error('This browser cannot play a test sound.');
      return;
    }
    // Constructing the context can itself throw, and the `void testTone()`
    // call sites have no catch of their own, so it belongs inside the try.
    let ctx: AudioContext;
    try {
      ctx = new AC();
    } catch {
      toast.error('Could not play a test sound on this device');
      return;
    }
    try {
      if (speakerId && 'setSinkId' in ctx) {
        try {
          await (ctx as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId(
            speakerId,
          );
        } catch {
          // Some browsers reject an unknown sink id; the default output is
          // still a meaningful test.
        }
      }
      if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);

      // A gentle two-note chime, not a full-scale sine: loud test tones startle.
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
      for (const [freq, at] of [
        [523.25, 0],
        [783.99, 0.28],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        osc.start(now + at);
        osc.stop(now + 0.85);
      }
      // Leave the context alive long enough for the tail, then release it.
      window.setTimeout(() => void ctx.close().catch(() => undefined), 1200);
    } catch {
      void ctx.close().catch(() => undefined);
      toast.error('Could not play a test sound on this device');
    }
  }, [speakerId]);

  const applyBackdrop = React.useCallback(
    (next: Backdrop) => {
      if (!isLocalTrack(cameraTrack?.track)) {
        setBackdrop(next);
        return;
      }
      // setProcessor/stopProcessor return promises and reject on failure (a
      // failed model init, a WGL context error, a track being replaced). A
      // try/catch around the *call* cannot see that, so the old code left the
      // Blur button highlighted with no effect applied and an unhandled
      // rejection. Await it and roll the UI back on failure.
      setBackdrop('pending');
      const work =
        next === 'blur'
          ? cameraTrack.track.setProcessor(BackgroundBlur())
          : cameraTrack.track.stopProcessor();
      void work
        .then(() => setBackdrop(next))
        .catch((err: unknown) => {
          console.error('background effect failed', err);
          setBackdrop('none');
          toast.error('Could not change the background effect');
        });
    },
    [cameraTrack],
  );

  const apply = async () => {
    if (speakerId) {
      // Only persist here. Actually routing audio is done by an effect in
      // OrbitMeeting, because an observer owned by this dialog dies the moment
      // apply() calls onClose() — it was disconnected microseconds after being
      // registered, so it caught no elements at all.
      setPrefs({ ...prefs, speakerId });
    }
    if (camId) {
      await localParticipant
        .setCameraEnabled(true, { deviceId: camId })
        .catch((e) => console.error('camera switch failed', e));
    }
    if (micId) {
      await localParticipant
        .setMicrophoneEnabled(true, { deviceId: micId })
        .catch((e) => console.error('mic switch failed', e));
    }
    if (displayName.trim() && displayName.trim() !== localParticipant.name) {
      await localParticipant
        .setName(displayName.trim())
        .catch((e) => console.error('rename failed', e));
    }
    onClose();
  };

  return (
    <div
      className="orbit-dlg-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="orbit-set"
        role="dialog"
        aria-modal="true"
        aria-labelledby="orbit-settings-title"
      >
        <div className="orbit-set-head">
          <h3 className="orbit-set-title" id="orbit-settings-title">
            <SettingsIcon />
            Settings
          </h3>
          <button
            type="button"
            className="orbit-dlg-x"
            onClick={onClose}
            aria-label="Close settings"
          >
            &times;
          </button>
        </div>

        <div className="orbit-set-tabs" role="tablist" aria-label="Settings sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'settings'}
            className={`orbit-set-tab${tab === 'settings' ? ' is-active' : ''}`}
            onClick={() => setTab('settings')}
          >
            Settings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'profile'}
            className={`orbit-set-tab${tab === 'profile' ? ' is-active' : ''}`}
            onClick={() => setTab('profile')}
          >
            Profile
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'more'}
            className={`orbit-set-tab${tab === 'more' ? ' is-active' : ''}`}
            onClick={() => setTab('more')}
          >
            More
          </button>
          {/* Only rendered when the room actually granted a moderator role. */}
          {isModerator && (
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'moderator'}
              className={`orbit-set-tab${tab === 'moderator' ? ' is-active' : ''}`}
              onClick={() => setTab('moderator')}
            >
              Moderator
            </button>
          )}
        </div>

        <div className="orbit-set-body">
          {tab === 'settings' ? (
            <>
              <Field label="Camera" htmlFor="orbit-set-cam">
                <select
                  id="orbit-set-cam"
                  className="orbit-set-select"
                  value={camId}
                  onChange={(e) => setCamId(e.target.value)}
                >
                  <option value="">Browser default</option>
                  {cameras.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || 'Camera'}
                    </option>
                  ))}
                </select>
                <div className="orbit-set-preview">
                  <video
                    ref={videoRef}
                    className="orbit-set-preview-el"
                    autoPlay
                    playsInline
                    muted
                  />
                </div>
              </Field>

              <Field label="Microphone" htmlFor="orbit-set-mic">
                <select
                  id="orbit-set-mic"
                  className="orbit-set-select"
                  value={micId}
                  onChange={(e) => setMicId(e.target.value)}
                >
                  <option value="">Browser default</option>
                  {mics.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || 'Microphone'}
                    </option>
                  ))}
                </select>
                <div
                  className="orbit-set-meter"
                  role="meter"
                  aria-label="Microphone input level"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(level * 100)}
                >
                  <div
                    className="orbit-set-meter-fill"
                    data-hot={level > 0.85 ? 'true' : 'false'}
                    style={{ width: `${Math.round(level * 100)}%` }}
                  />
                </div>
                <p className="orbit-set-hint">
                  Speak to check the level. The bar turns red when the input is close to clipping.
                </p>
                <button
                  type="button"
                  className="orbit-mbtn secondary"
                  onClick={() => void testTone()}
                >
                  Test sound
                </button>
              </Field>

              <Field label="Speaker" htmlFor="orbit-set-speaker">
                <select
                  id="orbit-set-speaker"
                  className="orbit-set-select"
                  value={speakerId}
                  onChange={(e) => {
                    speakerTouched.current = true;
                    setSpeakerId(e.target.value);
                  }}
                >
                  <option value="">Browser default</option>
                  {speakers.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || 'Speaker'}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="orbit-mbtn secondary"
                  onClick={() => void testTone()}
                >
                  Test sound
                </button>
              </Field>

              <div className="orbit-set-section">
                <span className="orbit-set-label">Backgrounds</span>
                <div className="orbit-set-bgs">
                  <button
                    type="button"
                    className={`orbit-set-bg${backdrop === 'none' ? ' is-active' : ''}${backdrop === 'pending' ? ' is-pending' : ''}`}
                    onClick={() => applyBackdrop('none')}
                    aria-pressed={backdrop === 'none'}
                  >
                    <span className="orbit-set-bg-thumb is-plain" />
                    <span className="orbit-set-bg-name">None</span>
                  </button>
                  <button
                    type="button"
                    className={`orbit-set-bg${backdrop === 'blur' ? ' is-active' : ''}${backdrop === 'pending' ? ' is-pending' : ''}`}
                    onClick={() => applyBackdrop('blur')}
                    aria-pressed={backdrop === 'blur'}
                  >
                    <span className="orbit-set-bg-thumb is-blur" />
                    <span className="orbit-set-bg-name">Blur</span>
                  </button>
                </div>
              </div>
            </>
          ) : tab === 'profile' ? (
            <div className="orbit-set-profile">
              <div className="orbit-set-avatar" style={avatarStyle(displayName || 'You')}>
                {avatar ? (
                  <img className="orbit-set-avatar-img" src={avatar} alt="" />
                ) : (
                  initialsOf(displayName)
                )}
              </div>
              <div className="orbit-set-avatarrow">
                <label className="orbit-mbtn secondary" htmlFor="orbit-set-avatar">
                  Choose picture
                </label>
                <input
                  id="orbit-set-avatar"
                  type="file"
                  accept="image/*"
                  className="orbit-set-file"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                      await pickLocalAvatar(file);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Could not use that image');
                    }
                  }}
                />
                {avatar && (
                  <button
                    type="button"
                    className="orbit-mbtn secondary"
                    onClick={() => setLocalAvatar(null)}
                  >
                    Remove
                  </button>
                )}
              </div>
              <Field label="Your name" htmlFor="orbit-set-name">
                <input
                  id="orbit-set-name"
                  className="orbit-set-select"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your display name"
                  spellCheck={false}
                />
              </Field>
              <p className="orbit-set-hint">
                Everyone in <strong>{room.name}</strong> sees this name. Your picture stays in this
                browser — there are no accounts in this build, so it is not uploaded.
              </p>
              <Toggle
                label="Remember my settings"
                hint="Keep these preferences, device choices and your picture between visits. Turn off and everything reverts to defaults on reload."
                checked={prefs.rememberSettings}
                onChange={(v) => setPrefs({ ...prefs, rememberSettings: v })}
              />
            </div>
          ) : tab === 'more' ? (
            <>
              <div className="orbit-set-section">
                <span className="orbit-set-label">Sounds</span>
                <Toggle
                  label="Mute all sounds"
                  hint="Silence every other participant. You still hear the translated audio."
                  checked={prefs.muteAllSounds}
                  onChange={(v) => setPrefs({ ...prefs, muteAllSounds: v })}
                />
                <Toggle
                  label="Follow the active speaker"
                  hint="Leave tile view automatically while somebody is speaking."
                  checked={prefs.followActiveSpeaker}
                  onChange={(v) => setPrefs({ ...prefs, followActiveSpeaker: v })}
                />
                <Toggle
                  label="Show participant names"
                  hint="Display name labels on video tiles."
                  checked={prefs.showNames}
                  onChange={(v) => setPrefs({ ...prefs, showNames: v })}
                />
              </div>

              <div className="orbit-set-section">
                <span className="orbit-set-label">Notifications</span>
                <Toggle
                  label="Chat notifications"
                  hint="Notify me about new messages while the chat drawer is closed."
                  checked={prefs.chatNotifications}
                  onChange={(v) => setPrefs({ ...prefs, chatNotifications: v })}
                />
                <Toggle
                  label="Raise hand notifications"
                  hint="Tell me when somebody raises a hand."
                  checked={prefs.raiseHandNotifications}
                  onChange={(v) => setPrefs({ ...prefs, raiseHandNotifications: v })}
                />
                <Toggle
                  label="Join and leave notifications"
                  hint="Show a notice when someone joins or leaves this meeting."
                  checked={prefs.joinLeaveNotifications}
                  onChange={(v) => setPrefs({ ...prefs, joinLeaveNotifications: v })}
                />
              </div>

              <div className="orbit-set-section">
                <span className="orbit-set-label">Recording</span>
                <p className="orbit-set-hint">
                  Recording runs entirely in this browser and the file downloads straight to your
                  device — nothing is uploaded. The file contains this participant&rsquo;s view of
                  the meeting.
                </p>
                {recorder.isRecording ? (
                  <button type="button" className="orbit-mbtn danger" onClick={recorder.stop}>
                    Stop recording
                    {recorder.elapsed !== null && ` · ${formatElapsed(recorder.elapsed)}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="orbit-mbtn secondary"
                    onClick={() => void recorder.start()}
                  >
                    Start local recording
                  </button>
                )}
                {recorder.error && <p className="orbit-set-hint is-error">{recorder.error}</p>}
              </div>

              <div className="orbit-set-section">
                <span className="orbit-set-label">Connection</span>
                <Toggle
                  label="Start muted"
                  hint="Microphone off when the pre-join screen opens."
                  checked={prefs.startMuted}
                  onChange={(v) => setPrefs({ ...prefs, startMuted: v })}
                />
                <Toggle
                  label="Start with camera off"
                  hint="Camera off when the pre-join screen opens."
                  checked={prefs.startVideoOff}
                  onChange={(v) => setPrefs({ ...prefs, startVideoOff: v })}
                />
                <Toggle
                  label="Low bandwidth mode"
                  hint="Turn the camera off by itself if the connection turns poor. It never switches back on — that stays yours to do."
                  checked={prefs.lowBandwidthMode}
                  onChange={(v) => setPrefs({ ...prefs, lowBandwidthMode: v })}
                />
              </div>

              <div className="orbit-set-section">
                <span className="orbit-set-label">Interface</span>
                <Toggle
                  label="Always show the toolbar"
                  hint="Stops the bottom toolbar auto-hiding after 5 seconds of inactivity."
                  checked={prefs.alwaysShowToolbar}
                  onChange={(v) => setPrefs({ ...prefs, alwaysShowToolbar: v })}
                />
              </div>

              <div className="orbit-set-section">
                <span className="orbit-set-label">Language</span>
                <button
                  type="button"
                  className="orbit-mbtn secondary"
                  onClick={() => {
                    onClose();
                    toast('Open the Live Translator panel to choose the translation language.');
                  }}
                >
                  Translation language…
                </button>
                <p className="orbit-set-hint">
                  The translation target is set in the Live Translator panel, where it is verified
                  against the model before being applied. This app translates speech; it does not
                  translate its own interface.
                </p>
              </div>

              <div className="orbit-set-section">
                <span className="orbit-set-label">Keyboard shortcuts</span>
                <ul className="orbit-set-keys">
                  <li>
                    <kbd>Ctrl</kbd> <span>+</span> <kbd>Shift</kbd> <span>+</span> <kbd>A</kbd>{' '}
                    <em>Toggle microphone</em>
                  </li>
                  <li>
                    <kbd>Ctrl</kbd> <span>+</span> <kbd>Shift</kbd> <span>+</span> <kbd>V</kbd>{' '}
                    <em>Toggle camera</em>
                  </li>
                </ul>
                <p className="orbit-set-hint">
                  On macOS use <kbd>⌘</kbd> in place of <kbd>Ctrl</kbd>. Both shortcuts are ignored
                  while you are typing in a text field, so pasting into chat still works.
                </p>
              </div>
            </>
          ) : (
            <div className="orbit-set-profile">
              <p className="orbit-set-hint">
                You are a <strong>moderator</strong> in <strong>{room.name}</strong>.
              </p>

              <div className="orbit-set-section">
                <span className="orbit-set-label">Meeting</span>
                <button
                  type="button"
                  className="orbit-mbtn danger"
                  onClick={() => {
                    onClose();
                    toast(
                      'Ending a room for everyone needs a server-side endpoint — not available in this build.',
                    );
                  }}
                >
                  End call for all
                </button>
                <p className="orbit-set-hint">
                  Disconnects every participant and terminates the session. This needs a server-side
                  room-management endpoint; the LiveKit browser SDK can only disconnect you.
                </p>
              </div>

              <div className="orbit-set-section">
                <span className="orbit-set-label">Participant permissions</span>
                {PERMISSIONS.map((p) => (
                  <div key={p.label} className="orbit-set-locked">
                    <span className="orbit-set-locked-label">{p.label}</span>
                    <span className="orbit-set-locked-why">{p.why}</span>
                  </div>
                ))}
                <p className="orbit-set-hint">
                  These are listed rather than shown as switches on purpose. Every one of them needs
                  the server to issue a different LiveKit token per role and to enforce the rule —
                  the token endpoint currently hands every participant identical permissions, so a
                  switch here would be a control that does nothing.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="orbit-set-foot">
          <button type="button" className="orbit-mbtn primary" onClick={() => void apply()}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
