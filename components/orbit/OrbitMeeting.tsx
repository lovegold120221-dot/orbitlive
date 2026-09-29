'use client';
import * as React from 'react';
import { Track } from 'livekit-client';
import {
  RoomAudioRenderer,
  useChat,
  useParticipants,
  useRemoteParticipants,
  useTrackToggle,
  useSpeakingParticipants,
  useConnectionQualityIndicator,
  useLocalParticipant,
} from '@livekit/components-react';
import toast from 'react-hot-toast';
import { OrbitStage } from './Stage';
import { OrbitControlBar, type OrbitPanel } from './ControlBar';
import { useIdleUi, IDLE_MS } from './useIdleUi';
import { useMeetingPrefs } from '@/lib/meeting-prefs';
import { runToggle } from '@/lib/runToggle';
import type { OrbitModal } from './MeetingModals';
import { OrbitChatPanel } from './ChatPanel';
import { OrbitParticipantsPanel } from './ParticipantsPanel';
import { OrbitTranslatorPanel } from './TranslatorPanel';
import { OrbitTranslatorProvider } from './OrbitTranslatorProvider';
import { OrbitRecorderProvider } from './OrbitRecorderProvider';
import { OrbitErrorBoundary } from './ErrorBoundary';

/**
 * Orbit Meeting — branded UX over the LiveKit conferencing engine.
 * Uses real LiveKit components/hooks (RoomAudioRenderer, useParticipants,
 * useTracks, useChat, TrackToggle, publications/tracks) — only the
 * presentation layer is transformed.
 */
export function OrbitMeeting({ roomName }: { roomName: string }) {
  const [openPanel, setOpenPanel] = React.useState<OrbitPanel>(null);
  const [gridView, setGridView] = React.useState(false);
  const [filmstripOpen, setFilmstripOpen] = React.useState(true);
  // Clicking a filmstrip thumb pins that participant to the main stage,
  // the way Jitsi's filmstrip does. null = follow the active speaker.
  const [pinned, setPinned] = React.useState<string | null>(null);
  const [modal, setModal] = React.useState<OrbitModal>(null);
  // Lifted so the idle timer knows a menu is open and stays pinned visible.
  const [exitPopoverOpen, setExitPopoverOpen] = React.useState(false);

  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const cam = useTrackToggle({ source: Track.Source.Camera });
  const { localParticipant } = useLocalParticipant();

  // A drawer, dialog or popover is open: pin the interface visible so
  // controls can't vanish out from under someone mid-interaction.
  const busy = openPanel !== null || modal !== null || exitPopoverOpen;
  const [prefs] = useMeetingPrefs();
  const { visible } = useIdleUi(busy, prefs.alwaysShowToolbar ? Infinity : IDLE_MS);

  // Optional join/leave notices. Tracks the previous participant count so a
  // change in either direction can be announced once.
  const participantCount = useParticipants().length;
  const prevCount = React.useRef(participantCount);
  React.useEffect(() => {
    const prev = prevCount.current;
    prevCount.current = participantCount;
    if (!prefs.joinLeaveNotifications || prev === participantCount) return;
    if (participantCount > prev) toast(`${participantCount - prev} joined the meeting`);
    else toast(`${prev - participantCount} left the meeting`);
  }, [participantCount, prefs.joinLeaveNotifications]);

  // Optional notice for chat messages that arrive while the drawer is closed.
  const { chatMessages } = useChat();
  const chatCount = chatMessages.length;
  const seenChat = React.useRef(chatCount);
  React.useEffect(() => {
    const prev = seenChat.current;
    seenChat.current = chatCount;
    if (!prefs.chatNotifications || openPanel === 'chat' || chatCount <= prev) return;
    const msg = chatMessages[chatCount - 1];
    const from = msg?.from?.name || msg?.from?.identity || 'Someone';
    toast(`💬 ${from}: ${msg?.message ?? ''}`);
  }, [chatCount, chatMessages, prefs.chatNotifications, openPanel]);

  const invite = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Meeting link copied');
    } catch {
      toast.error('Could not copy the meeting link');
    }
  }, []);

  /* ---------------- settings that change real behaviour ---------------- */

  // "Mute all sounds": zero every remote audio element. Uses the DOM pass
  // rather than the SDK so it composes with the translator's ducking instead
  // of overwriting it — whichever is lower wins.
  React.useEffect(() => {
    if (!prefs.muteAllSounds) return;
    const apply = () => {
      for (const el of Array.from(document.querySelectorAll('audio[data-lk-source]'))) {
        if (el.getAttribute('data-lk-local-participant') === 'true') continue;
        (el as HTMLAudioElement).volume = 0;
      }
    };
    apply();
    // Elements attach asynchronously as tracks are subscribed, so watch for
    // new ones rather than muting once and hoping.
    const obs = new MutationObserver(apply);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [prefs.muteAllSounds]);

  // "Follow active speaker": drop out of tile view while anybody is speaking,
  // then let the user go back to tiles when the room goes quiet again.
  const speaking = useSpeakingParticipants();
  const someoneSpeaking = speaking.length > 0;
  React.useEffect(() => {
    if (!prefs.followActiveSpeaker || !someoneSpeaking) return;
    setGridView(false);
  }, [prefs.followActiveSpeaker, someoneSpeaking]);

  // "Raise hand notifications": toast once per participant per raise.
  const remotes = useRemoteParticipants();
  const raisedRef = React.useRef(new Set<string>());
  React.useEffect(() => {
    for (const p of remotes) {
      let raised = false;
      try {
        const parsed = p.attributes ? JSON.parse(JSON.stringify(p.attributes)) : {};
        raised = parsed?.handRaised === 'true' || parsed?.hand === 'true';
      } catch {
        raised = false;
      }
      const was = raisedRef.current.has(p.identity);
      if (raised && !was && prefs.raiseHandNotifications) {
        toast(`✋ ${p.name || p.identity} raised a hand`);
      }
      if (raised) raisedRef.current.add(p.identity);
      else raisedRef.current.delete(p.identity);
    }
  }, [remotes, prefs.raiseHandNotifications]);

  // Route remote audio to the chosen output device. This lives here, not in
  // the settings dialog, because audio elements attach for the whole meeting
  // while the dialog unmounts the instant you press Done — an observer owned
  // by the dialog is torn down before it ever sees a new participant.
  React.useEffect(() => {
    const sinkId = prefs.speakerId;
    if (!sinkId) return;

    const applySink = () => {
      for (const el of Array.from(document.querySelectorAll('audio[data-lk-source]'))) {
        if (el.getAttribute('data-lk-local-participant') === 'true') continue;
        const audio = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
        if (typeof audio.setSinkId !== 'function') continue;
        if (audio.getAttribute('data-orbit-sink') === sinkId) continue;
        audio
          .setSinkId(sinkId)
          .then(() => el.setAttribute('data-orbit-sink', sinkId))
          .catch(() => {
            /* browser refused this device; the default output remains */
          });
      }
    };
    applySink();
    const obs = new MutationObserver(applySink);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [prefs.speakerId]);

  // "Low bandwidth mode": drop the camera when the connection turns poor, so
  // audio and video for everyone else survive. Deliberately one-way — it never
  // switches the camera back on by itself, because silently re-enabling a
  // microphone-grade sensor in a meeting is worse than leaving it off.
  // The participant MUST be passed explicitly. Called with no argument this
  // hook falls back to reading the local participant out of ParticipantContext,
  // and OrbitMeeting is only inside RoomContext — so the no-argument form
  // throws "No participant provided" and takes the whole meeting page down on
  // mount. ParticipantContext is provided per-tile, not around the meeting.
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant });
  const downgraded = React.useRef(false);
  React.useEffect(() => {
    if (!prefs.lowBandwidthMode) {
      downgraded.current = false;
      return;
    }
    if (quality === 'poor' && cam.enabled && !downgraded.current) {
      downgraded.current = true;
      runToggle(() => cam.toggle?.(false), toast.error);
      toast('Camera turned off to protect the call — connection is poor');
    }
    if (quality === 'good' || quality === 'excellent') {
      // Reset the latch so a later dip can trigger it again, but leave the
      // camera under the user's control.
      downgraded.current = false;
    }
  }, [quality, prefs.lowBandwidthMode, cam]);

  // Keep translator session alive above the panels so closing the panel UI
  // never terminates translation (requirement).
  return (
    <OrbitTranslatorProvider>
      <OrbitRecorderProvider>
        <div
          className={`orbit-meet${prefs.showNames ? '' : ' is-hide-names'}`}
          data-orbit="meeting"
        >
          <div className="orbit-main">
            <OrbitErrorBoundary name="stage">
              <OrbitStage
                roomName={roomName}
                gridView={gridView}
                filmstripOpen={filmstripOpen}
                onToggleFilmstrip={() => setFilmstripOpen((v) => !v)}
                onInvite={() => void invite()}
                pinned={pinned}
                onPin={(identity) => setPinned((prev) => (prev === identity ? null : identity))}
                micOn={!!mic.enabled}
                camOn={!!cam.enabled}
                onToggleMic={() => runToggle(mic.toggle, toast.error)}
                onToggleCam={() => runToggle(cam.toggle, toast.error)}
              />
            </OrbitErrorBoundary>
            {openPanel && (
              <aside className="orbit-drawer" aria-label={`${openPanel} panel`}>
                <OrbitErrorBoundary name={`panel-${openPanel}`}>
                  {openPanel === 'chat' && <OrbitChatPanel onClose={() => setOpenPanel(null)} />}
                  {openPanel === 'participants' && (
                    <OrbitParticipantsPanel onClose={() => setOpenPanel(null)} />
                  )}
                  {openPanel === 'translator' && (
                    <OrbitTranslatorPanel onClose={() => setOpenPanel(null)} />
                  )}
                </OrbitErrorBoundary>
              </aside>
            )}
          </div>
          {/* The toolbar drives track toggles, the recorder and the settings
              dialog. Without a boundary, a throw in any of them unmounts the
              whole meeting and takes the video down with it. */}
          <OrbitErrorBoundary name="control-bar">
            <OrbitControlBar
              openPanel={openPanel}
              setOpenPanel={setOpenPanel}
              gridView={gridView}
              setGridView={setGridView}
              micOn={!!mic.enabled}
              camOn={!!cam.enabled}
              onToggleMic={() => runToggle(mic.toggle, toast.error)}
              onToggleCam={() => runToggle(cam.toggle, toast.error)}
              visible={visible}
              modal={modal}
              setModal={setModal}
              exitPopoverOpen={exitPopoverOpen}
              setExitPopoverOpen={setExitPopoverOpen}
            />
          </OrbitErrorBoundary>
          {/* LiveKit media pipeline stays intact: remote audio, permissions,
            subscriptions, reconnection all flow through here. */}
          <RoomAudioRenderer />
        </div>
      </OrbitRecorderProvider>
    </OrbitTranslatorProvider>
  );
}
