'use client';
import * as React from 'react';

/**
 * Meeting preferences set from the Settings dialog. Persisted in localStorage
 * per browser, and broadcast in-tab so every consumer updates immediately
 * (the `storage` event only fires in *other* tabs).
 */

export type MeetingPrefs = {
  /** Keep the bottom toolbar on screen instead of auto-hiding when idle. */
  alwaysShowToolbar: boolean;
  /** Toast when a participant joins or leaves. */
  joinLeaveNotifications: boolean;
  /** Toast when a chat message arrives while the chat drawer is closed. */
  chatNotifications: boolean;
  /** Toast when somebody raises their hand. */
  raiseHandNotifications: boolean;
  /** Silence every remote audio element. */
  muteAllSounds: boolean;
  /** Drop out of tile view automatically while somebody is speaking. */
  followActiveSpeaker: boolean;
  /** Show participant name labels on video tiles. */
  showNames: boolean;
  /** Persist these preferences to localStorage. */
  rememberSettings: boolean;
  /** Microphone state when the pre-join screen opens. */
  startMuted: boolean;
  /** Camera state when the pre-join screen opens. */
  startVideoOff: boolean;
  /** Turn the camera off by itself when the connection is poor. */
  lowBandwidthMode: boolean;
  /** Preferred audio output device, applied via HTMLMediaElement.setSinkId. */
  speakerId: string;
};

export const DEFAULT_MEETING_PREFS: MeetingPrefs = {
  alwaysShowToolbar: false,
  joinLeaveNotifications: false,
  chatNotifications: true,
  raiseHandNotifications: true,
  muteAllSounds: false,
  followActiveSpeaker: false,
  showNames: true,
  rememberSettings: true,
  startMuted: true,
  startVideoOff: true,
  lowBandwidthMode: false,
  speakerId: '',
};

const KEY = 'orbit.meetingPrefs';
const EVENT = 'orbit:prefs';

function read(): MeetingPrefs {
  if (typeof window === 'undefined') return DEFAULT_MEETING_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_MEETING_PREFS;
    const parsed = JSON.parse(raw) as Partial<MeetingPrefs>;
    return { ...DEFAULT_MEETING_PREFS, ...parsed };
  } catch {
    return DEFAULT_MEETING_PREFS;
  }
}

export function getMeetingPrefs(): MeetingPrefs {
  return read();
}

export function setMeetingPrefs(next: MeetingPrefs) {
  try {
    if (next.rememberSettings) {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } else {
      // "Remember my settings" off: drop anything already stored, and keep
      // refusing to write so a reload comes back to the defaults.
      window.localStorage.removeItem(KEY);
    }
  } catch {
    /* best-effort only */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useMeetingPrefs(): [MeetingPrefs, (next: MeetingPrefs) => void, boolean] {
  // Seeded from a post-mount read so SSR and the first client render agree.
  const [prefs, setPrefs] = React.useState<MeetingPrefs>(DEFAULT_MEETING_PREFS);
  // False until the stored value has been read. Consumers that want to apply a
  // preference as an initial value must wait for this: reading `prefs` on the
  // first commit still yields DEFAULT_MEETING_PREFS, so acting on it then
  // silently ignores whatever the user actually saved.
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    setPrefs(read());
    setLoaded(true);
    const onChange = () => setPrefs(read());
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const update = React.useCallback((next: MeetingPrefs) => {
    setPrefs(next);
    setMeetingPrefs(next);
  }, []);

  return [prefs, update, loaded];
}
