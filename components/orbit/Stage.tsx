'use client';
import * as React from 'react';
import { Track } from 'livekit-client';
import {
  useParticipants,
  useSpeakingParticipants,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import {
  OrbitAloneStage,
  OrbitFilmstripTile,
  OrbitGridCard,
  OrbitParticipantTile,
} from './ParticipantTile';

export function OrbitStage({
  roomName,
  gridView,
  filmstripOpen,
  onToggleFilmstrip,
  onInvite,
  pinned,
  onPin,
  micOn,
  camOn,
  onToggleMic,
  onToggleCam,
}: {
  roomName: string;
  gridView: boolean;
  filmstripOpen: boolean;
  onToggleFilmstrip: () => void;
  onInvite: () => void;
  pinned: string | null;
  onPin: (identity: string) => void;
  micOn: boolean;
  camOn: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
}) {
  const participants = useParticipants();
  const speaking = useSpeakingParticipants();

  // Real LiveKit screen-share tracks take over the stage when present.
  const screenShares = useTracks([Track.Source.ScreenShare], { onlySubscribed: true });
  const activeScreenShare = screenShares.length > 0 ? screenShares[0] : null;

  const cameraRefs = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const camByIdentity = React.useMemo(() => {
    const m = new Map<string, TrackReferenceOrPlaceholder>();
    for (const r of cameraRefs) m.set(r.participant.identity, r);
    return m;
  }, [cameraRefs]);

  // Strip order: active speaker first, then join order. The local participant
  // is included like everyone else, so you appear exactly once.
  const strip = React.useMemo(() => {
    const speakIds = new Set(speaking.map((p) => p.identity));
    return [...participants].sort((a, b) => {
      const sa = speakIds.has(a.identity) ? 0 : 1;
      const sb = speakIds.has(b.identity) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return (a.joinedAt?.getTime?.() ?? 0) - (b.joinedAt?.getTime?.() ?? 0);
    });
  }, [participants, speaking]);

  // Speaker-view tile priority: pinned participant > active remote speaker >
  // first remote > (alone) the local participant. Screen shares do not come
  // through here — they get their own branch and own the main stage outright.
  const remotes = strip.filter((p) => !p.isLocal);
  const pinnedParticipant = pinned ? participants.find((p) => p.identity === pinned) : undefined;
  const main = pinnedParticipant ?? speaking.find((p) => !p.isLocal) ?? remotes[0] ?? strip[0];

  if (!main) {
    return <div className="orbit-stage is-empty">Waiting for participants…</div>;
  }

  // The waiting screen only applies when nobody is sharing, otherwise your own
  // screen share would be hidden behind the "only person here" prompt.
  const alone = participants.length === 1 && participants[0].isLocal && !activeScreenShare;
  const mainRef = camByIdentity.get(main.identity);

  return (
    <div className={`orbit-stage${filmstripOpen ? ' with-strip' : ''}`}>
      <div className="orbit-videowrap">
        {gridView ? (
          <div className="orbit-gridview">
            {/* A share stays visible in tile view as its own tile, the way
                Jitsi does — otherwise switching to the grid makes it vanish. */}
            {activeScreenShare && (
              <OrbitGridCard
                key={'share-' + activeScreenShare.participant.identity}
                participant={activeScreenShare.participant}
                cameraRef={activeScreenShare}
                isScreenShare
              />
            )}
            {strip.map((p) => (
              <OrbitGridCard
                key={p.identity + p.sid}
                participant={p}
                cameraRef={camByIdentity.get(p.identity)}
              />
            ))}
          </div>
        ) : activeScreenShare ? (
          // A screen share always takes the main stage — including your own,
          // and including when you are the only participant in the room.
          <div className="orbit-speakerwrap">
            <OrbitParticipantTile
              key={'share-' + activeScreenShare.participant.identity}
              participant={activeScreenShare.participant}
              cameraRef={activeScreenShare}
              isScreenShare
            />
          </div>
        ) : alone ? (
          <OrbitAloneStage
            roomName={roomName}
            cameraRef={camByIdentity.get(participants[0].identity)}
            micOn={micOn}
            camOn={camOn}
            onToggleMic={onToggleMic}
            onToggleCam={onToggleCam}
            onInvite={onInvite}
          />
        ) : (
          <div className="orbit-speakerwrap">
            <OrbitParticipantTile
              key={'main-' + main.identity}
              participant={main}
              cameraRef={mainRef}
            />
          </div>
        )}

        <button
          type="button"
          className="orbit-strip-toggle"
          onClick={onToggleFilmstrip}
          title={filmstripOpen ? 'Hide filmstrip' : 'Show filmstrip'}
          aria-label={filmstripOpen ? 'Hide filmstrip' : 'Show filmstrip'}
          aria-expanded={filmstripOpen}
        >
          {filmstripOpen ? '›' : '‹'}
        </button>
      </div>

      {filmstripOpen && !gridView && (
        <div className="orbit-filmstrip" aria-label="Participants">
          {strip.map((p) => (
            <OrbitFilmstripTile
              key={p.identity + p.sid}
              participant={p}
              cameraRef={camByIdentity.get(p.identity)}
              // While a screen share is on stage, the sharer is the active
              // tile — not whoever happens to be speaking.
              isActive={p.identity === (activeScreenShare?.participant.identity ?? main.identity)}
              onSelect={() => onPin(p.identity)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
