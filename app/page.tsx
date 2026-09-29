'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as React from 'react';
import toast from 'react-hot-toast';
import { encodePassphrase, randomString } from '@/lib/client-utils';
import {
  CalendarGlyphIcon,
  CalendarIcon,
  ClockIcon,
  LockIcon,
  SettingsIcon,
  TrashIcon,
} from '@/components/orbit/icons';

const RECENTS_KEY = 'orbit.recentMeetings';
const SETTINGS_KEY = 'orbit.settings';
const MAX_RECENTS = 8;

const ROOM_WORDS_1 = ['Coastal', 'Lunar', 'Cosmic', 'Solar', 'Starlight', 'Hyper', 'Swift'];
const ROOM_WORDS_2 = ['Careers', 'Voyager', 'Pioneer', 'Horizon', 'Orbit', 'Pulse'];
const ROOM_WORDS_3 = ['Coach', 'Beacon', 'Nexus', 'Pilot', 'Compass', 'Spark'];
const ROOM_WORDS_4 = ['Swift', 'Bright', 'Worst', 'Brave', 'Steady', 'Prime'];

type Tab = 'upcoming' | 'recent';
type ServerMode = 'default' | 'custom';

type Settings = {
  displayName: string;
  server: ServerMode;
  serverUrl: string;
  token: string;
  cameraId: string;
  micId: string;
  e2ee: boolean;
  passphrase: string;
};

const DEFAULT_SETTINGS: Settings = {
  displayName: '',
  server: 'default',
  serverUrl: '',
  token: '',
  cameraId: '',
  micId: '',
  e2ee: false,
  passphrase: '',
};

type RecentMeeting = { name: string; ts: number };

function getRandomRoomName() {
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  return `${pick(ROOM_WORDS_1)}${pick(ROOM_WORDS_2)}${pick(ROOM_WORDS_3)}${pick(ROOM_WORDS_4)}`;
}

/* localStorage throws in private mode and when the quota is full, so every
   access is guarded. Nothing here is important enough to break the page over. */
function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* best-effort only */
  }
}

function readSettings(): Settings {
  const stored = readJson<Partial<Settings>>(SETTINGS_KEY, {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

function readRecents(): RecentMeeting[] {
  const parsed = readJson<unknown>(RECENTS_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (r): r is RecentMeeting =>
        !!r &&
        typeof (r as RecentMeeting).name === 'string' &&
        typeof (r as RecentMeeting).ts === 'number',
    )
    .slice(0, MAX_RECENTS);
}

function relativeTime(ts: number, now: number) {
  const secs = Math.max(0, Math.floor((now - ts) / 1000));
  if (secs < 60) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Page() {
  const router = useRouter();

  const [roomName, setRoomName] = React.useState('');
  const [tab, setTab] = React.useState<Tab>('upcoming');
  const [modalOpen, setModalOpen] = React.useState(false);
  const [settings, setSettings] = React.useState<Settings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = React.useState<Settings>(DEFAULT_SETTINGS);
  const [recents, setRecents] = React.useState<RecentMeeting[]>([]);
  const [now, setNow] = React.useState(0);
  const [cameras, setCameras] = React.useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = React.useState<MediaDeviceInfo[]>([]);
  const [devicesRequested, setDevicesRequested] = React.useState(false);

  // Prefill the room name and hydrate from localStorage after mount, so the
  // server and client render the same markup on the first pass.
  React.useEffect(() => {
    setRoomName(getRandomRoomName());
    setRecents(readRecents());
    setNow(Date.now());
    const stored = readSettings();
    setSettings(stored);
    setDraft(stored);
  }, []);

  const openModal = () => {
    setDraft(settings);
    setDevicesRequested(false);
    setModalOpen(true);
  };

  /* Device labels are only exposed once the user has granted camera/mic access.
     Ask for permission only if the labels came back blank, so opening Settings
     does not trigger a prompt when access was already granted. */
  React.useEffect(() => {
    if (!modalOpen || !navigator.mediaDevices?.enumerateDevices) return;
    let cancelled = false;

    const collect = async (needPermission: boolean) => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (cancelled) return;
      const hasLabels = devices.some((d) => d.label);
      if (needPermission && !hasLabels) return;
      setCameras(devices.filter((d) => d.kind === 'videoinput'));
      setMics(devices.filter((d) => d.kind === 'audioinput'));
    };

    const run = async () => {
      try {
        await collect(false);
        if (cancelled) return;
        setDevicesRequested(true);
      } catch {
        setDevicesRequested(true);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach((t) => t.stop());
        await collect(true);
      } catch {
        /* permission denied or unavailable — keep whatever we already listed */
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [modalOpen]);

  // Escape closes the dialog.
  React.useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  const rememberRoom = React.useCallback((name: string) => {
    setRecents((prev) => {
      const next = [{ name, ts: Date.now() }, ...prev.filter((r) => r.name !== name)].slice(
        0,
        MAX_RECENTS,
      );
      writeJson(RECENTS_KEY, next);
      return next;
    });
  }, []);

  const forgetRoom = React.useCallback((name: string) => {
    setRecents((prev) => {
      const next = prev.filter((r) => r.name !== name);
      writeJson(RECENTS_KEY, next);
      return next;
    });
  }, []);

  const saveSettings = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: Settings = {
      ...draft,
      // An empty passphrase would silently disable E2EE, so mint one on enable.
      passphrase: draft.e2ee && !draft.passphrase ? randomString(64) : draft.passphrase,
    };
    setSettings(next);
    writeJson(SETTINGS_KEY, next);
    setModalOpen(false);
    toast.success('Settings saved');
  };

  const enter = React.useCallback(
    (room: string) => {
      rememberRoom(room);
      const hash = settings.e2ee ? `#${encodePassphrase(settings.passphrase)}` : '';

      if (settings.server === 'custom' && settings.serverUrl.trim() && settings.token.trim()) {
        const qs = new URLSearchParams({
          liveKitUrl: settings.serverUrl.trim(),
          token: settings.token.trim(),
        });
        router.push(`/custom/?${qs.toString()}${hash}`);
        return;
      }

      // Passed as query params so the server component can hand them to the
      // pre-join screen without a client-only localStorage read.
      const params = new URLSearchParams();
      if (settings.displayName.trim()) params.set('name', settings.displayName.trim());
      if (settings.cameraId) params.set('cam', settings.cameraId);
      if (settings.micId) params.set('mic', settings.micId);
      const query = params.toString();
      router.push(`/rooms/${encodeURIComponent(room)}${query ? `?${query}` : ''}${hash}`);
    },
    [settings, rememberRoom, router],
  );

  const startMeeting = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    enter(roomName.trim() || getRandomRoomName());
  };

  const bookMeeting = async () => {
    const room = getRandomRoomName();
    setRoomName(room);
    const url = `${window.location.origin}/rooms/${encodeURIComponent(room)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Meeting URL copied — send it to your guests.');
    } catch {
      toast.success(`Meeting URL: ${url}`);
    }
  };

  return (
    <div className="orbit-landing">
      {/* Hero */}
      <section className="orbit-hero">
        <header className="orbit-navbar">
          <Link href="/" className="orbit-brand" title="Orbit Meeting Home">
            <svg className="orbit-brand-icon" viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="12" r="3.5" fill="currentColor" />
              <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-25 12 12)" />
            </svg>
            <span>orbit</span>
          </Link>

          <button
            type="button"
            className="orbit-settings-btn"
            onClick={openModal}
            aria-label="Settings"
            title="Settings"
          >
            <SettingsIcon />
          </button>
        </header>

        <div className="orbit-hero-content">
          <h1 className="orbit-hero-title">Orbit Meeting</h1>
          <p className="orbit-hero-subtitle">Secure and high quality meetings</p>

          <form className="orbit-meeting-form" onSubmit={startMeeting}>
            <input
              type="text"
              className="orbit-meeting-input"
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder="Enter room name"
              aria-label="Room name"
              spellCheck={false}
              autoComplete="off"
            />
            <button type="submit" className="orbit-start-btn">
              Start meeting
            </button>
          </form>

          <p className="orbit-hero-subtext">
            Or{' '}
            <button type="button" className="orbit-hero-link" onClick={() => void bookMeeting()}>
              book a meeting URL
            </button>{' '}
            in advance and share the link with whoever you need.
          </p>
        </div>
      </section>

      {/* Meetings card */}
      <main className="orbit-landing-main">
        <div className="orbit-meetings-card">
          <div className="orbit-tabs" role="tablist" aria-label="Meetings">
            <button
              type="button"
              role="tab"
              id="tab-upcoming"
              aria-selected={tab === 'upcoming'}
              aria-controls="pane-upcoming"
              className={`orbit-tab-btn${tab === 'upcoming' ? ' is-active' : ''}`}
              onClick={() => setTab('upcoming')}
            >
              Your upcoming meetings
            </button>
            <button
              type="button"
              role="tab"
              id="tab-recent"
              aria-selected={tab === 'recent'}
              aria-controls="pane-recent"
              className={`orbit-tab-btn${tab === 'recent' ? ' is-active' : ''}`}
              onClick={() => setTab('recent')}
            >
              Your recent meetings
            </button>
          </div>

          <div className="orbit-tab-content">
            <div
              role="tabpanel"
              id="pane-upcoming"
              aria-labelledby="tab-upcoming"
              className={`orbit-tab-pane${tab === 'upcoming' ? ' is-active' : ''}`}
              hidden={tab !== 'upcoming'}
            >
              <div className="orbit-pane-icon">
                <CalendarGlyphIcon />
              </div>
              <p className="orbit-pane-text">
                Calendar sync is not connected in this deployment. Your upcoming meetings will
                appear here once it is.
              </p>
              <button
                type="button"
                className="orbit-calendar-link is-disabled"
                aria-disabled="true"
                onClick={() =>
                  toast('Calendar sync is not connected in this deployment yet.', {
                    icon: '📅',
                  })
                }
              >
                <CalendarIcon />
                Connect your calendar
              </button>
            </div>

            <div
              role="tabpanel"
              id="pane-recent"
              aria-labelledby="tab-recent"
              className={`orbit-tab-pane${tab === 'recent' ? ' is-active' : ''}`}
              hidden={tab !== 'recent'}
            >
              {recents.length === 0 ? (
                <>
                  <div className="orbit-pane-icon">
                    <ClockIcon />
                  </div>
                  <p className="orbit-pane-text">
                    No recent meetings found. Start or join a room above to see your meeting history
                    here.
                  </p>
                </>
              ) : (
                <ul className="orbit-recent-list">
                  {recents.map((recent) => (
                    <li key={recent.name} className="orbit-recent-item">
                      <button
                        type="button"
                        className="orbit-recent-name"
                        onClick={() => enter(recent.name)}
                      >
                        {recent.name}
                      </button>
                      <span className="orbit-recent-time">{relativeTime(recent.ts, now)}</span>
                      <button
                        type="button"
                        className="orbit-recent-del"
                        title={`Delete ${recent.name}`}
                        aria-label={`Delete ${recent.name}`}
                        onClick={() => forgetRoom(recent.name)}
                      >
                        <TrashIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Settings */}
      {modalOpen && (
        <div
          className="orbit-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) setModalOpen(false);
          }}
        >
          <div
            className="orbit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="orbit-settings-title"
          >
            <form onSubmit={saveSettings}>
              <div className="orbit-modal-header">
                <h3 className="orbit-modal-title" id="orbit-settings-title">
                  Orbit Settings
                </h3>
                <button
                  type="button"
                  className="orbit-modal-close"
                  onClick={() => setModalOpen(false)}
                  aria-label="Close settings"
                >
                  &times;
                </button>
              </div>

              <div className="orbit-modal-body">
                <div className="orbit-form-group">
                  <label htmlFor="displayNameInput">Your Name</label>
                  <input
                    id="displayNameInput"
                    type="text"
                    placeholder="e.g. Jane Doe"
                    value={draft.displayName}
                    onChange={(event) =>
                      setDraft((d) => ({ ...d, displayName: event.target.value }))
                    }
                  />
                </div>

                <div className="orbit-form-group">
                  <label htmlFor="cameraSelect">Camera</label>
                  <select
                    id="cameraSelect"
                    value={draft.cameraId}
                    onChange={(event) => setDraft((d) => ({ ...d, cameraId: event.target.value }))}
                  >
                    <option value="">Browser default</option>
                    {cameras.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || 'Camera'}
                      </option>
                    ))}
                  </select>
                  {cameras.length === 0 && devicesRequested && (
                    <small className="orbit-form-hint">No camera detected.</small>
                  )}
                </div>

                <div className="orbit-form-group">
                  <label htmlFor="micSelect">Microphone</label>
                  <select
                    id="micSelect"
                    value={draft.micId}
                    onChange={(event) => setDraft((d) => ({ ...d, micId: event.target.value }))}
                  >
                    <option value="">Browser default</option>
                    {mics.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || 'Microphone'}
                      </option>
                    ))}
                  </select>
                  {mics.length === 0 && devicesRequested && (
                    <small className="orbit-form-hint">No microphone detected.</small>
                  )}
                </div>

                <div className="orbit-form-group">
                  <label htmlFor="serverSelect">Server</label>
                  <select
                    id="serverSelect"
                    value={draft.server}
                    onChange={(event) =>
                      setDraft((d) => ({ ...d, server: event.target.value as ServerMode }))
                    }
                  >
                    <option value="default">Orbit default</option>
                    <option value="custom">Custom LiveKit server</option>
                  </select>
                </div>

                {draft.server === 'custom' && (
                  <>
                    <div className="orbit-form-group">
                      <label htmlFor="serverUrl">LiveKit URL</label>
                      <input
                        id="serverUrl"
                        type="url"
                        placeholder="wss://your-project.livekit.cloud"
                        value={draft.serverUrl}
                        onChange={(event) =>
                          setDraft((d) => ({ ...d, serverUrl: event.target.value }))
                        }
                      />
                    </div>
                    <div className="orbit-form-group">
                      <label htmlFor="token">Access token</label>
                      <textarea
                        id="token"
                        rows={3}
                        placeholder="Token"
                        value={draft.token}
                        onChange={(event) => setDraft((d) => ({ ...d, token: event.target.value }))}
                      />
                    </div>
                  </>
                )}

                <div className="orbit-form-group">
                  <label className="orbit-check" htmlFor="e2eeToggle">
                    <input
                      id="e2eeToggle"
                      type="checkbox"
                      checked={draft.e2ee}
                      onChange={(event) => setDraft((d) => ({ ...d, e2ee: event.target.checked }))}
                    />
                    <LockIcon />
                    End-to-end encryption
                  </label>
                  {draft.e2ee && (
                    <input
                      type="password"
                      aria-label="Encryption passphrase"
                      placeholder="Passphrase (auto-generated if left empty)"
                      value={draft.passphrase}
                      onChange={(event) =>
                        setDraft((d) => ({ ...d, passphrase: event.target.value }))
                      }
                    />
                  )}
                </div>
              </div>

              <div className="orbit-modal-footer">
                <button
                  type="button"
                  className="orbit-modal-btn secondary"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="orbit-modal-btn primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
