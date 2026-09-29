'use client';

import React from 'react';
import { decodePassphrase } from '@/lib/client-utils';
import { DebugMode } from '@/lib/Debug';
import { KeyboardShortcuts } from '@/lib/KeyboardShortcuts';
import { RecordingIndicator } from '@/lib/RecordingIndicator';
import { ConnectionDetails } from '@/lib/types';
import { LocalUserChoices, RoomContext } from '@livekit/components-react';
import {
  ExternalE2EEKeyProvider,
  RoomOptions,
  VideoCodec,
  VideoPresets,
  Room,
  DeviceUnsupportedError,
  RoomConnectOptions,
  RoomEvent,
  TrackPublishDefaults,
  VideoCaptureOptions,
} from 'livekit-client';
import { useRouter } from 'next/navigation';
import { useSetupE2EE } from '@/lib/useSetupE2EE';
import { useLowCPUOptimizer } from '@/lib/usePerfomanceOptimiser';
import { OrbitMeeting } from '@/components/orbit/OrbitMeeting';
import { OrbitPreJoin, type OrbitPreJoinChoices } from '@/components/orbit/OrbitPreJoin';

const CONN_DETAILS_ENDPOINT =
  process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? '/api/connection-details';

export function PageClientImpl(props: {
  roomName: string;
  region?: string;
  hq: boolean;
  codec: VideoCodec;
  singlePeerConnection: boolean;
  /** Prefill for the pre-join screen, supplied by the entry page settings. */
  participantName?: string;
  cameraDeviceId?: string;
  micDeviceId?: string;
}) {
  const [preJoinChoices, setPreJoinChoices] = React.useState<LocalUserChoices | undefined>(
    undefined,
  );
  const preJoinDefaults = React.useMemo(() => {
    return {
      username: props.participantName ?? '',
      videoDeviceId: props.cameraDeviceId ?? '',
      micDeviceId: props.micDeviceId ?? '',
    };
  }, [props.participantName, props.cameraDeviceId, props.micDeviceId]);
  const [connectionDetails, setConnectionDetails] = React.useState<ConnectionDetails | undefined>(
    undefined,
  );
  // LocalUserChoices has no speaker field, so the pre-join hands it over here.
  const [speakerDeviceId, setSpeakerDeviceId] = React.useState('');

  const handlePreJoinSubmit = React.useCallback(
    async (values: OrbitPreJoinChoices) => {
      const url = new URL(CONN_DETAILS_ENDPOINT, window.location.origin);
      url.searchParams.append('roomName', props.roomName);
      url.searchParams.append('participantName', values.username);
      if (props.region) {
        url.searchParams.append('region', props.region);
      }
      // Thrown on failure so OrbitPreJoin can re-enable its Join button and
      // surface the reason instead of hanging on "Joining…".
      const connectionDetailsResp = await fetch(url.toString());
      if (!connectionDetailsResp.ok) {
        throw new Error(`server responded ${connectionDetailsResp.status}`);
      }
      const connectionDetailsData = await connectionDetailsResp.json();
      if (!connectionDetailsData?.serverUrl || !connectionDetailsData?.participantToken) {
        throw new Error('no connection token was returned');
      }
      setPreJoinChoices(values);
      setSpeakerDeviceId(values.audioOutputDeviceId);
      setConnectionDetails(connectionDetailsData);
      // props.roomName and props.region are read above. With an empty dependency
      // array a client-side navigation from /rooms/A to /rooms/B reused this
      // callback, so it minted a token for room A while the pre-join header
      // showed room B — the participant joined the wrong meeting.
    },
    [props.roomName, props.region],
  );

  return (
    <main data-lk-theme="default" style={{ height: '100%' }}>
      {connectionDetails === undefined || preJoinChoices === undefined ? (
        <OrbitPreJoin
          roomName={props.roomName}
          defaults={preJoinDefaults}
          onSubmit={handlePreJoinSubmit}
        />
      ) : (
        <VideoConferenceComponent
          connectionDetails={connectionDetails}
          userChoices={preJoinChoices}
          options={{
            codec: props.codec,
            hq: props.hq,
            singlePeerConnection: props.singlePeerConnection,
            cameraDeviceId: props.cameraDeviceId,
            micDeviceId: props.micDeviceId,
            speakerDeviceId,
          }}
        />
      )}
    </main>
  );
}

function VideoConferenceComponent(props: {
  userChoices: LocalUserChoices;
  connectionDetails: ConnectionDetails;
  options: {
    hq: boolean;
    codec: VideoCodec;
    singlePeerConnection: boolean;
    cameraDeviceId?: string;
    micDeviceId?: string;
    speakerDeviceId?: string;
  };
}) {
  const keyProvider = new ExternalE2EEKeyProvider();
  const { worker, e2eePassphrase } = useSetupE2EE();
  const e2eeEnabled = !!(e2eePassphrase && worker);

  const [e2eeSetupComplete, setE2eeSetupComplete] = React.useState(false);
  // Set only when E2EE was requested and could NOT be enabled. Non-null means
  // we deliberately refuse to connect rather than join unencrypted.
  const [e2eeSetupError, setE2eeSetupError] = React.useState<string | null>(null);

  const roomOptions = React.useMemo((): RoomOptions => {
    let videoCodec: VideoCodec | undefined = props.options.codec ? props.options.codec : 'vp9';
    if (e2eeEnabled && (videoCodec === 'av1' || videoCodec === 'vp9')) {
      videoCodec = undefined;
    }
    const videoCaptureDefaults: VideoCaptureOptions = {
      // A device chosen in the entry page's Settings dialog is an explicit
      // decision, so it takes precedence over the device the pre-join screen
      // detects on its own.
      deviceId: props.options.cameraDeviceId ?? props.userChoices.videoDeviceId ?? undefined,
      resolution: props.options.hq ? VideoPresets.h2160 : VideoPresets.h720,
    };
    const publishDefaults: TrackPublishDefaults = {
      dtx: false,
      videoSimulcastLayers: props.options.hq
        ? [VideoPresets.h1080, VideoPresets.h720]
        : [VideoPresets.h540, VideoPresets.h216],
      red: !e2eeEnabled,
      videoCodec,
    };
    return {
      videoCaptureDefaults: videoCaptureDefaults,
      publishDefaults: publishDefaults,
      audioCaptureDefaults: {
        deviceId: props.options.micDeviceId ?? props.userChoices.audioDeviceId ?? undefined,
      },
      adaptiveStream: true,
      dynacast: true,
      audioOutput: props.options.speakerDeviceId
        ? { deviceId: props.options.speakerDeviceId }
        : undefined,
      e2ee: keyProvider && worker && e2eeEnabled ? { keyProvider, worker } : undefined,
      singlePeerConnection: props.options.singlePeerConnection,
    };
  }, [
    props.userChoices,
    props.options.hq,
    props.options.codec,
    props.options.cameraDeviceId,
    props.options.micDeviceId,
    props.options.speakerDeviceId,
  ]);

  const room = React.useMemo(() => new Room(roomOptions), []);

  React.useEffect(() => {
    if (!e2eeEnabled) {
      setE2eeSetupComplete(true);
      return;
    }
    let cancelled = false;
    // The setE2EEEnabled promise MUST be returned into the chain. Previously it
    // was fire-and-forget, so `setE2eeSetupComplete(true)` ran whether or not
    // E2EE actually engaged: a failure silently downgraded the meeting to
    // unencrypted while the UI carried on as though it were secure.
    keyProvider
      .setKey(decodePassphrase(e2eePassphrase))
      .then(() => room.setE2EEEnabled(true))
      .then(() => {
        if (!cancelled) setE2eeSetupComplete(true);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('E2EE setup failed', e);
        // Refuse to connect rather than joining in the clear. An encrypted
        // meeting that cannot be encrypted must not silently proceed.
        setE2eeSetupError(
          e instanceof DeviceUnsupportedError
            ? 'This browser cannot join an encrypted meeting. Update it to the latest version and try again.'
            : 'This meeting is encrypted, but encryption could not be enabled. You have not been able to join.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [e2eeEnabled, room, e2eePassphrase]);

  const connectOptions = React.useMemo((): RoomConnectOptions => {
    return {
      autoSubscribe: true,
    };
  }, []);

  React.useEffect(() => {
    room.on(RoomEvent.Disconnected, handleOnLeave);
    room.on(RoomEvent.EncryptionError, handleEncryptionError);
    room.on(RoomEvent.MediaDevicesError, handleError);

    if (e2eeSetupComplete && !e2eeSetupError) {
      room
        .connect(
          props.connectionDetails.serverUrl,
          props.connectionDetails.participantToken,
          connectOptions,
        )
        .catch((error) => {
          handleError(error);
        });
      if (props.userChoices.videoEnabled) {
        room.localParticipant.setCameraEnabled(true).catch((error) => {
          handleError(error);
        });
      }
      if (props.userChoices.audioEnabled) {
        room.localParticipant.setMicrophoneEnabled(true).catch((error) => {
          handleError(error);
        });
      }
    }
    return () => {
      room.off(RoomEvent.Disconnected, handleOnLeave);
      room.off(RoomEvent.EncryptionError, handleEncryptionError);
      room.off(RoomEvent.MediaDevicesError, handleError);
    };
  }, [e2eeSetupComplete, e2eeSetupError, room, props.connectionDetails, props.userChoices]);

  // Hard stop for an encrypted meeting we could not secure. Connecting anyway
  // would put every word of the call in the clear while the UI claimed it was
  // protected. The check itself is placed after every hook, at the component's
  // final return — an early return above them would change the hook count
  // between renders and break React's rules of hooks.
  const router = useRouter();

  const lowPowerMode = useLowCPUOptimizer(room);

  const handleOnLeave = React.useCallback(() => router.push('/'), [router]);
  const handleError = React.useCallback((error: Error) => {
    console.error(error);
    alert(`Encountered an unexpected error, check the console logs for details: ${error.message}`);
  }, []);
  const handleEncryptionError = React.useCallback((error: Error) => {
    console.error(error);
    alert(
      `Encountered an unexpected encryption error, check the console logs for details: ${error.message}`,
    );
  }, []);

  React.useEffect(() => {
    if (lowPowerMode) {
      console.warn('Low power mode enabled');
    }
  }, [lowPowerMode]);

  if (e2eeSetupError) {
    return (
      <div className="orbit-fatal" role="alert">
        <h2>Could not join this encrypted meeting</h2>
        <p>{e2eeSetupError}</p>
        <button type="button" className="orbit-mbtn primary" onClick={() => router.push('/')}>
          Back to start
        </button>
      </div>
    );
  }

  return (
    <div className="lk-room-container" style={{ height: '100%' }}>
      <RoomContext.Provider value={room}>
        <KeyboardShortcuts />
        {/* Orbit Meeting presentation over the LiveKit engine. Room connection,
            tracks, devices, subscriptions, chat and disconnect behavior unchanged. */}
        <OrbitMeeting roomName={props.connectionDetails.roomName} />
        <DebugMode />
        <RecordingIndicator />
      </RoomContext.Provider>
    </div>
  );
}
