'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import toast from 'react-hot-toast';
import type { LocalUserChoices } from '@livekit/components-react';
import {
  CamIcon,
  CamOffIcon,
  ChevronDownIcon,
  SettingsIcon,
  HangupIcon,
  ImageIcon,
  MicIcon,
  MicOffIcon,
  UserPlusIcon,
} from './icons';
import { useMeetingPrefs } from '@/lib/meeting-prefs';

function initialsOf(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** LocalUserChoices carries no speaker id, so it rides alongside it. */
export type OrbitPreJoinChoices = LocalUserChoices & { audioOutputDeviceId: string };

type Devices = { cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] };

const EMPTY_DEVICES: Devices = { cameras: [], mics: [], speakers: [] };

export function OrbitPreJoin({
  roomName,
  defaults,
  onSubmit,
}: {
  roomName: string;
  defaults: {
    username: string;
    videoDeviceId: string;
    micDeviceId: string;
  };
  onSubmit: (values: OrbitPreJoinChoices) => Promise<void> | void;
}) {
  const router = useRouter();

  const [username, setUsername] = React.useState(defaults.username);
  // Start from the "Start muted" / "Start video off" settings, which default
  // to both-off so nothing is published until the participant opts in.
  //
  // Gated on `prefsLoaded`, not on a "have I run once" latch. useMeetingPrefs
  // registers its read effect first, so on the first commit this effect still
  // sees DEFAULT_MEETING_PREFS; a latch would burn itself on those defaults
  // and the re-render carrying the real stored values would be ignored, leaving
  // the setting looking broken.
  const [prefs, , prefsLoaded] = useMeetingPrefs();
  const [micOn, setMicOn] = React.useState(false);
  const [camOn, setCamOn] = React.useState(false);
  const appliedDefaults = React.useRef(false);
  React.useEffect(() => {
    if (!prefsLoaded || appliedDefaults.current) return;
    appliedDefaults.current = true;
    setMicOn(!prefs.startMuted);
    setCamOn(!prefs.startVideoOff);
  }, [prefsLoaded, prefs.startMuted, prefs.startVideoOff]);
  const [cameraId, setCameraId] = React.useState(defaults.videoDeviceId);
  const [micId, setMicId] = React.useState(defaults.micDeviceId);
  const [speakerId, setSpeakerId] = React.useState('');
  const [devices, setDevices] = React.useState<Devices>(EMPTY_DEVICES);
  const devicesLiveRef = React.useRef(true);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [joinMenuOpen, setJoinMenuOpen] = React.useState(false);
  const [joining, setJoining] = React.useState(false);

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const stopPreview = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startPreview = React.useCallback(
    async (deviceId: string) => {
      stopPreview();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : true,
          audio: false,
        });
        if (!videoRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      } catch {
        // No camera, or permission denied — fall back to the avatar.
        setCamOn(false);
        stopPreview();
      }
    },
    [stopPreview],
  );

  const toggleCam = React.useCallback(() => {
    setCamOn((on) => {
      const next = !on;
      if (next) void startPreview(cameraId);
      else stopPreview();
      return next;
    });
  }, [cameraId, startPreview, stopPreview]);

  // Restart the preview when a different camera is picked while it is running.
  React.useEffect(() => {
    if (camOn) void startPreview(cameraId);
  }, [cameraId]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => stopPreview, [stopPreview]);

  const loadDevices = React.useCallback(async (requestPermission: boolean) => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    let list: MediaDeviceInfo[];
    try {
      // Rejects outright when a Permissions-Policy blocks device access; left
      // floating this was an unhandled rejection and the pickers stayed empty.
      list = await navigator.mediaDevices.enumerateDevices();
    } catch (err) {
      console.warn('could not enumerate devices', err);
      return;
    }
    const labelled = list.some((d) => d.label);
    if (requestPermission && !labelled) {
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        probe.getTracks().forEach((t) => t.stop());
      } catch {
        return; // keep whatever labels we already had
      }
    }
    let all: MediaDeviceInfo[];
    try {
      all = await navigator.mediaDevices.enumerateDevices();
    } catch {
      return;
    }
    if (!devicesLiveRef.current) return;
    setDevices({
      cameras: all.filter((d) => d.kind === 'videoinput'),
      mics: all.filter((d) => d.kind === 'audioinput'),
      speakers: all.filter((d) => d.kind === 'audiooutput'),
    });
  }, []);

  React.useEffect(() => {
    devicesLiveRef.current = true;
    void loadDevices(false).catch((err: unknown) => console.warn('device load failed', err));
    return () => {
      // Stop an in-flight enumerate from setting state after unmount.
      devicesLiveRef.current = false;
    };
  }, [loadDevices]);

  const openDevices = () => {
    setModalOpen(true);
    void loadDevices(true).catch((err: unknown) => console.warn('device load failed', err));
  };

  React.useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  React.useEffect(() => {
    if (!joinMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setJoinMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [joinMenuOpen]);

  // The preview stream must be released before LiveKit opens its own capture.
  const join = React.useCallback(
    async (opts?: { cam?: boolean; mic?: boolean }) => {
      if (joining) return;
      setJoining(true);
      setJoinMenuOpen(false);
      stopPreview();
      try {
        await onSubmit({
          username: username.trim() || 'Guest',
          videoEnabled: opts?.cam ?? camOn,
          audioEnabled: opts?.mic ?? micOn,
          videoDeviceId: cameraId,
          audioDeviceId: micId,
          audioOutputDeviceId: speakerId,
        });
      } catch (error) {
        setJoining(false);
        toast.error(
          `Could not join the room: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    },
    [joining, username, camOn, micOn, cameraId, micId, speakerId, onSubmit, stopPreview],
  );

  const invite = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Meeting link copied');
    } catch {
      toast.error('Could not copy the meeting link');
    }
  };

  return (
    <div className="orbit-pj">
      <aside className="orbit-pj-side">
        <header>
          <Link href="/" className="orbit-brand" title="Orbit Meeting">
            <svg className="orbit-brand-icon" viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="12" r="3.5" fill="currentColor" />
              <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-25 12 12)" />
            </svg>
            <span>orbit</span>
          </Link>
        </header>

        <main className="orbit-pj-center">
          <h1 className="orbit-pj-title">Join meeting</h1>
          <p className="orbit-pj-room" title={roomName}>
            {roomName}
          </p>

          <div className="orbit-pj-name-wrap">
            <input
              className="orbit-pj-name"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter your display name"
              aria-label="Display name"
              spellCheck={false}
              autoComplete="name"
            />
          </div>

          <div className="orbit-pj-join-group">
            <button
              type="button"
              className="orbit-pj-join"
              onClick={() => void join()}
              disabled={joining}
            >
              {joining ? 'Joining…' : 'Join meeting'}
            </button>
            <button
              type="button"
              className="orbit-pj-join-more"
              title="More join options"
              aria-label="More join options"
              aria-expanded={joinMenuOpen}
              onClick={() => setJoinMenuOpen((v) => !v)}
            >
              <ChevronDownIcon />
            </button>
            {joinMenuOpen && (
              <div className="orbit-pj-join-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void join({ cam: false, mic: micOn })}
                >
                  Join with camera off
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void join({ cam: false, mic: false })}
                >
                  Join in silent mode
                </button>
              </div>
            )}
          </div>

          <div className="orbit-pj-controls">
            <div className="orbit-pj-control">
              <button
                type="button"
                className="orbit-pj-badge"
                title="Choose microphone"
                aria-label="Choose microphone"
                onClick={openDevices}
              >
                <ChevronDownIcon />
              </button>
              <button
                type="button"
                className={`orbit-pj-icon-btn${micOn ? '' : ' is-off'}`}
                title={micOn ? 'Mute microphone' : 'Unmute microphone'}
                aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
                aria-pressed={micOn}
                onClick={() => setMicOn((v) => !v)}
              >
                {micOn ? <MicIcon /> : <MicOffIcon />}
              </button>
            </div>

            <div className="orbit-pj-control">
              <button
                type="button"
                className="orbit-pj-badge"
                title="Choose camera"
                aria-label="Choose camera"
                onClick={openDevices}
              >
                <ChevronDownIcon />
              </button>
              <button
                type="button"
                className={`orbit-pj-icon-btn${camOn ? '' : ' is-off'}`}
                title={camOn ? 'Turn camera off' : 'Turn camera on'}
                aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
                aria-pressed={camOn}
                onClick={toggleCam}
              >
                {camOn ? <CamIcon /> : <CamOffIcon />}
              </button>
            </div>

            <div className="orbit-pj-control">
              <button
                type="button"
                className="orbit-pj-icon-btn"
                title="Invite people"
                aria-label="Invite people"
                onClick={() => void invite()}
              >
                <UserPlusIcon />
              </button>
            </div>

            <div className="orbit-pj-control">
              <button
                type="button"
                className="orbit-pj-icon-btn"
                title="Select background"
                aria-label="Select background"
                onClick={() => toast('Backgrounds are not available in this build yet.')}
              >
                <ImageIcon />
              </button>
            </div>

            <div className="orbit-pj-control">
              <button
                type="button"
                className="orbit-pj-icon-btn"
                title="Settings"
                aria-label="Settings"
                onClick={openDevices}
              >
                <SettingsIcon />
              </button>
            </div>

            <div className="orbit-pj-control">
              <button
                type="button"
                className="orbit-pj-icon-btn is-hangup"
                title="Leave room"
                aria-label="Leave room"
                onClick={() => router.push('/')}
              >
                <HangupIcon />
              </button>
            </div>
          </div>
        </main>

        <div className="orbit-pj-foot" />
      </aside>

      <section className="orbit-pj-stage">
        {/* Always mounted so the ref is ready the moment the camera turns on. */}
        <video
          ref={videoRef}
          className={`orbit-pj-video${camOn ? '' : ' is-hidden'}`}
          autoPlay
          playsInline
          muted
        />
        {!camOn && (
          <div className="orbit-pj-avatar" aria-hidden>
            {initialsOf(username)}
          </div>
        )}
      </section>

      {modalOpen && (
        <div
          className="orbit-pj-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) setModalOpen(false);
          }}
        >
          <div
            className="orbit-pj-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="orbit-pj-devices-title"
          >
            <div className="orbit-pj-modal-head">
              <h3 className="orbit-pj-modal-title" id="orbit-pj-devices-title">
                Devices &amp; Settings
              </h3>
              <button
                type="button"
                className="orbit-pj-modal-close"
                onClick={() => setModalOpen(false)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="orbit-pj-modal-body">
              <div className="orbit-pj-field">
                <label htmlFor="pjCamera">Camera</label>
                <select
                  id="pjCamera"
                  value={cameraId}
                  onChange={(event) => setCameraId(event.target.value)}
                >
                  <option value="">Browser default</option>
                  {devices.cameras.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || 'Camera'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="orbit-pj-field">
                <label htmlFor="pjMic">Microphone</label>
                <select id="pjMic" value={micId} onChange={(event) => setMicId(event.target.value)}>
                  <option value="">Browser default</option>
                  {devices.mics.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || 'Microphone'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="orbit-pj-field">
                <label htmlFor="pjSpeaker">Audio Output</label>
                <select
                  id="pjSpeaker"
                  value={speakerId}
                  onChange={(event) => setSpeakerId(event.target.value)}
                >
                  <option value="">Browser default</option>
                  {devices.speakers.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || 'Speaker'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
