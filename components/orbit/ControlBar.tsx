'use client';
import * as React from 'react';
import { Track } from 'livekit-client';
import {
  useChat,
  useParticipants,
  useRoomContext,
  useTrackToggle,
} from '@livekit/components-react';
import {
  CamIcon,
  CamOffIcon,
  ChatIcon,
  ChevronDownIcon,
  DonateIcon,
  SettingsIcon,
  HangupIcon,
  HandIcon,
  LogOutIcon,
  MicIcon,
  MicOffIcon,
  PeopleIcon,
  ScreenIcon,
  ScreenStopIcon,
  TileIcon,
  TranslateIcon,
  RecordIcon,
  StopIcon,
} from './icons';
import { useOrbitTranslator } from './OrbitTranslatorProvider';
import { useOrbitRecorder } from './OrbitRecorderProvider';
import { runToggle } from '@/lib/runToggle';
import toast from 'react-hot-toast';
import { formatElapsed } from '@/lib/useLocalMeetingRecorder';
import {
  OrbitSettingsModal,
  OrbitDonateModal,
  OrbitEndAllModal,
  OrbitLeaveModal,
  type OrbitModal,
} from './MeetingModals';

export type OrbitPanel = 'chat' | 'participants' | 'translator' | null;

function ToolButton({
  title,
  onClick,
  active,
  muted,
  badge,
  dot,
  donate,
  recording,
  children,
}: {
  title: string;
  onClick?: () => void;
  active?: boolean;
  muted?: boolean;
  badge?: number;
  dot?: boolean;
  donate?: boolean;
  recording?: boolean;
  children: React.ReactNode;
}) {
  const cls = [
    'orbit-tool',
    active ? 'is-highlight' : '',
    muted ? 'is-off' : '',
    donate ? 'is-donate' : '',
    recording ? 'is-recording' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} onClick={onClick} title={title} aria-label={title}>
      {children}
      {typeof badge === 'number' && badge > 0 && (
        <span className="orbit-tool-badge">{badge > 99 ? '99+' : badge}</span>
      )}
      {dot && <span className="orbit-tool-dot" />}
    </button>
  );
}

export function OrbitControlBar({
  openPanel,
  setOpenPanel,
  gridView,
  setGridView,
  micOn,
  camOn,
  onToggleMic,
  onToggleCam,
  visible,
  modal,
  setModal,
  exitPopoverOpen,
  setExitPopoverOpen,
}: {
  openPanel: OrbitPanel;
  setOpenPanel: (p: OrbitPanel | ((prev: OrbitPanel) => OrbitPanel)) => void;
  gridView: boolean;
  setGridView: (v: boolean | ((prev: boolean) => boolean)) => void;
  micOn: boolean;
  camOn: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  /** False while the interface is idle — Jitsi-style auto-hide. */
  visible: boolean;
  modal: OrbitModal;
  setModal: (m: OrbitModal) => void;
  exitPopoverOpen: boolean;
  setExitPopoverOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
}) {
  const room = useRoomContext();
  const participants = useParticipants();
  const { chatMessages } = useChat();
  const translator = useOrbitTranslator();
  // `audio: true` is what makes the browser offer "Also share tab audio" and
  // publish a ScreenShareAudio track. Without it getDisplayMedia captures video
  // only, so there is no screen audio for the translator to consume — the
  // translator treats that track as a source, but it has to exist first.
  const screen = useTrackToggle({
    source: Track.Source.ScreenShare,
    captureOptions: { audio: true },
  });

  const [handRaised, setHandRaised] = React.useState(false);
  const [unread, setUnread] = React.useState(0);
  // Local-only recording: mixes the meeting in the browser and downloads the
  // file to this user's device. Nothing is uploaded. The instance is shared
  // with the Settings dialog via a provider, so both drive the same recording.
  const recorder = useOrbitRecorder();
  const isRecording = recorder.isRecording;
  const lastSeenRef = React.useRef(0);
  const exitOpen = exitPopoverOpen;
  const setExitOpen: (v: boolean | ((prev: boolean) => boolean)) => void = setExitPopoverOpen;

  React.useEffect(() => {
    if (openPanel === 'chat') {
      lastSeenRef.current = chatMessages.length;
      setUnread(0);
    } else {
      setUnread(Math.max(0, chatMessages.length - lastSeenRef.current));
    }
  }, [chatMessages.length, openPanel]);

  // Close the exit popover on outside click / Escape.
  React.useEffect(() => {
    if (!exitOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = document.getElementById('orbit-endcall');
      if (el && !el.contains(e.target as Node)) setExitOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExitOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [exitOpen]);

  const togglePanel = (p: Exclude<OrbitPanel, null>) =>
    setOpenPanel((prev) => (prev === p ? null : p));

  const toggleHand = React.useCallback(async () => {
    const next = !handRaised;
    setHandRaised(next);
    try {
      await room.localParticipant.setAttributes({ handRaised: next ? 'true' : 'false' });
    } catch {
      // attributes unsupported → local-only indicator still works
    }
  }, [handRaised, room]);

  const sharing = screen.enabled;

  return (
    <>
      <div className={`orbit-toolbar-zone${visible ? '' : ' is-hidden'}`}>
        <div className="orbit-toolbar" role="toolbar" aria-label="Meeting controls">
          <ToolButton
            title={micOn ? 'Mute microphone' : 'Unmute microphone'}
            muted={!micOn}
            onClick={onToggleMic}
          >
            {micOn ? <MicIcon /> : <MicOffIcon />}
          </ToolButton>

          <ToolButton
            title={camOn ? 'Stop camera' : 'Start camera'}
            muted={!camOn}
            onClick={onToggleCam}
          >
            {camOn ? <CamIcon /> : <CamOffIcon />}
          </ToolButton>

          <ToolButton
            title={sharing ? 'Stop screen share' : 'Share screen'}
            active={!!sharing}
            onClick={() => runToggle(screen.toggle, toast.error)}
          >
            {sharing ? <ScreenStopIcon /> : <ScreenIcon />}
          </ToolButton>

          <ToolButton
            title="Live Translator"
            active={openPanel === 'translator'}
            dot={translator.isActive}
            onClick={() => togglePanel('translator')}
          >
            <TranslateIcon />
          </ToolButton>

          <ToolButton
            title={handRaised ? 'Lower hand' : 'Raise hand'}
            active={handRaised}
            onClick={() => void toggleHand()}
          >
            <HandIcon />
          </ToolButton>

          <ToolButton title="Support & Donate" donate onClick={() => setModal('donate')}>
            <DonateIcon />
          </ToolButton>

          <ToolButton
            title="Meeting chat"
            active={openPanel === 'chat'}
            badge={unread}
            onClick={() => togglePanel('chat')}
          >
            <ChatIcon />
          </ToolButton>

          <ToolButton
            title="Participants"
            active={openPanel === 'participants'}
            badge={participants.length}
            onClick={() => togglePanel('participants')}
          >
            <PeopleIcon />
          </ToolButton>

          <ToolButton
            title={gridView ? 'Switch to speaker view' : 'Switch to tile view'}
            active={gridView}
            onClick={() => setGridView((v) => !v)}
          >
            <TileIcon />
          </ToolButton>

          <ToolButton
            title={isRecording ? 'Stop recording and download' : 'Record this meeting locally'}
            recording={isRecording}
            onClick={() => (isRecording ? recorder.stop() : void recorder.start())}
          >
            {isRecording ? <StopIcon /> : <RecordIcon />}
          </ToolButton>

          <ToolButton title="Settings" onClick={() => setModal('settings')}>
            <SettingsIcon />
          </ToolButton>

          <span className="orbit-toolbar-divider" />

          <div className="orbit-endcall" id="orbit-endcall">
            <button
              type="button"
              className="orbit-endcall-main"
              onClick={() => setModal('leave')}
              title="Leave this meeting"
            >
              <HangupIcon />
              <span>End Call</span>
            </button>
            <button
              type="button"
              className="orbit-endcall-more"
              title="More call options"
              aria-label="More call options"
              aria-expanded={exitOpen}
              onClick={() => setExitOpen((v) => !v)}
            >
              <ChevronDownIcon />
            </button>
            {exitOpen && (
              <div className="orbit-exitpop" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  onClick={() => {
                    setExitOpen(false);
                    setModal('endall');
                  }}
                >
                  <HangupIcon />
                  <span>End Call for All</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setExitOpen(false);
                    setModal('leave');
                  }}
                >
                  <LogOutIcon />
                  <span>Leave Call</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/*
        Recording indicator. `position: fixed` deliberately, not absolutely
        positioned inside the toolbar: the toolbar is `overflow-x: auto`, which
        computes overflow-y to auto as well, so a chip anchored above the button
        would be clipped away.
      */}
      {isRecording && (
        <div className="orbit-rec-chip" role="status" aria-live="polite">
          <span className="orbit-rec-dot" aria-hidden="true" />
          <span>REC</span>
          <span className="orbit-rec-time">
            {recorder.elapsed !== null ? formatElapsed(recorder.elapsed) : '0:00'}
          </span>
          <span className="orbit-rec-note">saved to your device</span>
          <button
            type="button"
            className="orbit-rec-stop"
            onClick={recorder.stop}
            title="Stop recording and download the file"
          >
            Stop
          </button>
        </div>
      )}

      {recorder.status === 'saving' && (
        <div className="orbit-rec-chip is-saving" role="status" aria-live="polite">
          <span className="orbit-rec-time">Finishing the recording…</span>
        </div>
      )}

      {recorder.error && (
        <div className="orbit-rec-chip is-error" role="alert">
          <span>{recorder.error}</span>
        </div>
      )}

      {modal === 'settings' && <OrbitSettingsModal onClose={() => setModal(null)} />}
      {modal === 'donate' && <OrbitDonateModal onClose={() => setModal(null)} />}
      {modal === 'leave' && <OrbitLeaveModal onClose={() => setModal(null)} />}
      {modal === 'endall' && <OrbitEndAllModal onClose={() => setModal(null)} />}
    </>
  );
}
