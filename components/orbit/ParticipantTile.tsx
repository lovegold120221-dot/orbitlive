'use client';
import * as React from 'react';
import { useLocalAvatar } from '@/lib/local-avatar';
import {
  ConnectionQualityIndicator,
  ParticipantContext,
  TrackRefContext,
  VideoTrack,
  useEnsureParticipant,
  useIsMuted,
  useIsSpeaking,
  useLocalParticipant,
  useParticipantAttributes,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import { Track, type Participant } from 'livekit-client';
import { CamIcon, CamOffIcon, MicIcon, MicOffIcon } from './icons';

export function initialsOf(name: string) {
  const clean = (name || '').trim();
  if (!clean) return '?';
  const parts = clean.split(/[\s_@.-]+/).filter(Boolean);
  if (parts.length === 0) return clean.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable per-name hue so tiles stay visually distinguishable, like the mock. */
export function hueOf(name: string) {
  let h = 0;
  const s = name || '?';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function avatarStyle(name: string): React.CSSProperties {
  return { background: `hsl(${hueOf(name)} 26% 28%)` };
}

function displayNameOf(p: Participant) {
  return p.name || p.identity || 'Guest';
}

function isHandRaised(attributes: Record<string, string> | undefined) {
  return attributes?.handRaised === 'true' || attributes?.hand === 'true';
}

/**
 * Shared tile state.
 *
 * `hasVideo` deliberately treats a screen share differently from a camera: a
 * screen-share track exists regardless of whether the camera is on. Gating
 * both on `isCameraEnabled` hid the share behind the sharer's avatar whenever
 * they shared with their camera off — which is the common case here, because
 * the pre-join screen starts with the camera off.
 */
function useTileState(
  participant: Participant,
  cameraRef: TrackReferenceOrPlaceholder | undefined,
  isScreenShare: boolean,
) {
  const p = useEnsureParticipant(participant);
  const micMuted = useIsMuted({ participant: p, source: Track.Source.Microphone });
  const { attributes } = useParticipantAttributes({ participant: p });
  const hasTrack = !!cameraRef?.publication?.track;
  // A picture picked in Settings replaces the initials for the local
  // participant only. It lives in this browser, so it is never anything for
  // anyone else's tile.
  const localAvatar = useLocalAvatar();
  const avatar = p.isLocal ? localAvatar : null;
  return {
    p,
    micMuted,
    handRaised: isHandRaised(attributes),
    name: displayNameOf(p),
    avatar,
    hasVideo: isScreenShare ? hasTrack : p.isCameraEnabled && hasTrack,
  };
}

/* ---------- filmstrip thumbnail (vertical, right edge) ---------- */
export function OrbitFilmstripTile({
  participant,
  cameraRef,
  isActive,
  onSelect,
  isScreenShare = false,
}: {
  participant: Participant;
  cameraRef?: TrackReferenceOrPlaceholder;
  isActive?: boolean;
  onSelect?: () => void;
  isScreenShare?: boolean;
}) {
  const { p, micMuted, handRaised, name, avatar, hasVideo } = useTileState(
    participant,
    cameraRef,
    isScreenShare,
  );

  return (
    // The whole thumb sits inside ParticipantContext: ConnectionQualityIndicator
    // resolves its participant from context, not props, and throws without it.
    <ParticipantContext.Provider value={p}>
      <button
        type="button"
        className={`orbit-thumb${isActive ? ' is-active' : ''}`}
        onClick={onSelect}
        title={name}
        aria-label={`Show ${name}`}
        aria-pressed={!!isActive}
      >
        {hasVideo && cameraRef ? (
          <TrackRefContext.Provider value={cameraRef}>
            <VideoTrack
              className={`orbit-thumb-video${isScreenShare ? ' is-contain' : ''}`}
              muted
            />
          </TrackRefContext.Provider>
        ) : isScreenShare ? (
          <span className="orbit-thumb-avatar is-share">🖥</span>
        ) : (
          <span className="orbit-thumb-avatar" style={avatarStyle(name)}>
            {avatar ? <img className="orbit-avatar-img" src={avatar} alt="" /> : initialsOf(name)}
          </span>
        )}

        {handRaised && (
          <span className="orbit-thumb-hand" title="Hand raised">
            ✋
          </span>
        )}

        <span className="orbit-thumb-foot">
          {micMuted ? (
            <MicOffIcon className="orbit-thumb-mic is-off" />
          ) : (
            <MicIcon className="orbit-thumb-mic is-on" />
          )}
          <span className="orbit-thumb-name">{name}</span>
          {p.isLocal && <span className="orbit-thumb-you"> (You)</span>}
        </span>
      </button>
    </ParticipantContext.Provider>
  );
}

/* ---------- main stage tile ---------- */
export function OrbitParticipantTile({
  participant,
  cameraRef,
  isScreenShare = false,
  showQuality = true,
}: {
  participant: Participant;
  cameraRef?: TrackReferenceOrPlaceholder;
  isScreenShare?: boolean;
  showQuality?: boolean;
}) {
  const isSpeaking = useIsSpeaking(participant);
  const { p, micMuted, handRaised, name, avatar, hasVideo } = useTileState(
    participant,
    cameraRef,
    isScreenShare,
  );

  return (
    <ParticipantContext.Provider value={p}>
      <div
        className={`orbit-tile${isSpeaking ? ' speaking' : ''}${isScreenShare ? ' screenshare-tile' : ''}`}
        data-participant-identity={p.identity}
      >
        {hasVideo && cameraRef ? (
          <TrackRefContext.Provider value={cameraRef}>
            <VideoTrack className="orbit-tile-video" muted={p.isLocal} />
          </TrackRefContext.Provider>
        ) : isScreenShare ? (
          <div className="orbit-tile-sharewait">
            <span className="orbit-tile-sharewait-icon">🖥</span>
            <span>{name} is sharing their screen…</span>
          </div>
        ) : (
          <div className="orbit-tile-avatar" style={avatarStyle(name)}>
            {avatar ? <img className="orbit-avatar-img" src={avatar} alt="" /> : initialsOf(name)}
          </div>
        )}

        {!hasVideo && !isScreenShare && <CamOffIcon className="orbit-tile-nocam" />}

        {handRaised && (
          <span className="orbit-hand-badge" title="Hand raised">
            ✋
          </span>
        )}

        <div className="orbit-tile-foot">
          <span className="orbit-tile-name">
            {micMuted ? <MicOffIcon className="orbit-card-mic" /> : null}
            {name}
            {p.isLocal && <span className="orbit-card-you"> (You)</span>}
          </span>
          {showQuality && (
            <span className="orbit-conn" title="Connection quality">
              <ConnectionQualityIndicator />
            </span>
          )}
        </div>
      </div>
    </ParticipantContext.Provider>
  );
}

/* ---------- grid / tile-view card ---------- */
export function OrbitGridCard({
  participant,
  cameraRef,
  isScreenShare = false,
}: {
  participant: Participant;
  cameraRef?: TrackReferenceOrPlaceholder;
  isScreenShare?: boolean;
}) {
  const { p, micMuted, handRaised, name, avatar, hasVideo } = useTileState(
    participant,
    cameraRef,
    isScreenShare,
  );

  return (
    <ParticipantContext.Provider value={p}>
      <div className="orbit-card">
        {hasVideo && cameraRef ? (
          <TrackRefContext.Provider value={cameraRef}>
            <VideoTrack className={`orbit-card-video${isScreenShare ? ' is-contain' : ''}`} />
          </TrackRefContext.Provider>
        ) : isScreenShare ? (
          <div className="orbit-card-sharewait">🖥</div>
        ) : (
          <div className="orbit-card-avatar" style={avatarStyle(name)}>
            {avatar ? <img className="orbit-avatar-img" src={avatar} alt="" /> : initialsOf(name)}
          </div>
        )}
        {handRaised && (
          <span className="orbit-hand-badge" title="Hand raised">
            ✋
          </span>
        )}
        <span className="orbit-card-name">
          {micMuted ? <MicOffIcon className="orbit-card-mic" /> : null}
          {name}
          {p.isLocal && <span className="orbit-card-you"> (You)</span>}
        </span>
      </div>
    </ParticipantContext.Provider>
  );
}

/**
 * Jitsi's "You are the only person here" waiting screen. Shown whenever the
 * local participant is the only one in the room.
 */
export function OrbitAloneStage({
  roomName,
  cameraRef,
  micOn,
  camOn,
  onToggleMic,
  onToggleCam,
  onInvite,
}: {
  roomName: string;
  cameraRef?: TrackReferenceOrPlaceholder;
  micOn: boolean;
  camOn: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onInvite: () => void;
}) {
  const { localParticipant } = useLocalParticipant();
  const name = displayNameOf(localParticipant);
  const hasVideo = camOn && !!cameraRef?.publication?.track;

  return (
    <div className="orbit-alone">
      <div className="orbit-alone-media">
        {hasVideo && cameraRef ? (
          <TrackRefContext.Provider value={cameraRef}>
            <VideoTrack className="orbit-alone-video" muted />
          </TrackRefContext.Provider>
        ) : (
          <div className="orbit-alone-avatar" style={avatarStyle(name)}>
            {initialsOf(name)}
          </div>
        )}
        {!hasVideo && <CamOffIcon className="orbit-alone-nocam" />}
      </div>

      <h2 className="orbit-alone-title">You are the only person here</h2>

      <button type="button" className="orbit-alone-invite" onClick={onInvite}>
        Invite others
      </button>

      <p className="orbit-alone-room" title={roomName}>
        {roomName}
      </p>

      <div className="orbit-alone-controls">
        <button
          type="button"
          className={`orbit-alone-btn${micOn ? ' is-on' : ' is-off'}`}
          onClick={onToggleMic}
          aria-pressed={micOn}
          title={micOn ? 'Mute microphone' : 'Unmute microphone'}
        >
          {micOn ? <MicIcon /> : <MicOffIcon />}
        </button>
        <button
          type="button"
          className={`orbit-alone-btn${camOn ? ' is-on' : ' is-off'}`}
          onClick={onToggleCam}
          aria-pressed={camOn}
          title={camOn ? 'Turn camera off' : 'Turn camera on'}
        >
          {camOn ? <CamIcon /> : <CamOffIcon />}
        </button>
      </div>
    </div>
  );
}
