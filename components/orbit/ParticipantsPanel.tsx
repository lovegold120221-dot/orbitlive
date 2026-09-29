'use client';
import * as React from 'react';
import type { Participant } from 'livekit-client';
import {
  ConnectionQualityIndicator,
  useIsMuted,
  useIsSpeaking,
  useLocalParticipant,
  useParticipantAttributes,
  useParticipants,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { avatarStyle, initialsOf } from './ParticipantTile';
import { MicIcon, MicOffIcon } from './icons';

function isHandRaised(attributes: Record<string, string> | undefined) {
  return attributes?.handRaised === 'true' || attributes?.hand === 'true';
}

/** Role is carried in participant metadata; see the Settings > Moderator tab. */
function isModerator(p: Participant) {
  if (!p.metadata) return false;
  try {
    return (JSON.parse(p.metadata) as { role?: string })?.role === 'moderator';
  } catch {
    return false;
  }
}

/**
 * Takes the participant object directly rather than an identity to look up.
 * The previous version re-ran `useParticipants()` inside a wrapper *and* the
 * row, and used a non-null assertion on the second lookup — so a participant
 * leaving while the panel was open could hand `undefined` to `useIsSpeaking`,
 * which throws "No participant provided".
 */
function Row({ participant, isSelf }: { participant: Participant; isSelf: boolean }) {
  const speaking = useIsSpeaking(participant);
  const micMuted = useIsMuted({ participant, source: Track.Source.Microphone });
  const { attributes } = useParticipantAttributes({ participant });

  const name = participant.name || participant.identity || 'Guest';
  const hand = isHandRaised(attributes);
  const sharing = participant.isScreenShareEnabled;
  const moderator = isModerator(participant);

  return (
    <div className="orbit-part-row" data-speaking={speaking ? 'true' : 'false'}>
      <div
        className="orbit-part-avatar"
        style={
          speaking ? { ...avatarStyle(name), boxShadow: '0 0 0 2px #60a5fa' } : avatarStyle(name)
        }
      >
        {initialsOf(name)}
      </div>

      <div className="orbit-part-info">
        <span className="orbit-part-name" title={name}>
          {name}
        </span>
        <span className="orbit-part-tags">
          {isSelf && <span className="orbit-part-badge">You</span>}
          {moderator && <span className="orbit-part-badge is-mod">Moderator</span>}
          {hand && (
            <span className="orbit-part-badge is-hand" title="Hand raised">
              ✋
            </span>
          )}
          {sharing && (
            <span className="orbit-part-badge is-share" title="Sharing their screen">
              🖥
            </span>
          )}
        </span>
      </div>

      <div className="orbit-part-right">
        {micMuted ? (
          <MicOffIcon className="orbit-part-mic is-off" aria-label="Microphone muted" />
        ) : (
          <MicIcon className="orbit-part-mic is-on" aria-label="Microphone on" />
        )}
        {!participant.isCameraEnabled && (
          <span className="orbit-part-nocam" title="Camera off">
            no cam
          </span>
        )}
        <span className="orbit-part-conn" title="Connection quality">
          {/* participant passed explicitly: this row is not wrapped in a
              ParticipantContext.Provider, and the no-prop form resolves the
              participant from that context and throws. */}
          <ConnectionQualityIndicator participant={participant} />
        </span>
      </div>
    </div>
  );
}

export function OrbitParticipantsPanel({ onClose }: { onClose: () => void }) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const [q, setQ] = React.useState('');

  // You first, then whoever is speaking, then join order — the sidebar
  // ordering Jitsi uses.
  const ordered = React.useMemo(() => {
    return [...participants].sort((a, b) => {
      if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
      if (a.isSpeaking !== b.isSpeaking) return a.isSpeaking ? -1 : 1;
      return (a.joinedAt?.getTime?.() ?? 0) - (b.joinedAt?.getTime?.() ?? 0);
    });
  }, [participants]);

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? ordered.filter((p) => (p.name || p.identity || '').toLowerCase().includes(needle))
    : ordered;

  const searching = needle.length > 0;

  return (
    <>
      <div className="orbit-drawer-head">
        <h3 className="orbit-drawer-title">
          {searching
            ? `${filtered.length} of ${participants.length} participants`
            : `Participants (${participants.length})`}
        </h3>
        <button
          className="orbit-drawer-x"
          onClick={onClose}
          aria-label="Close participants"
          title="Close"
        >
          &times;
        </button>
      </div>

      <div className="orbit-drawer-body">
        {participants.length > 4 && (
          <input
            className="orbit-part-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search participants..."
            aria-label="Search participants"
          />
        )}

        {filtered.length === 0 ? (
          <div className="orbit-empty">No participants match “{q}”.</div>
        ) : (
          filtered.map((p) => (
            <Row
              key={p.identity + p.sid}
              participant={p}
              isSelf={p.identity === localParticipant.identity}
            />
          ))
        )}
      </div>
    </>
  );
}
