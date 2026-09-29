'use client';

import { VideoConferenceClientImpl } from './VideoConferenceClientImpl';
import { isVideoCodec } from '@/lib/types';

/**
 * Client half of the /custom route.
 *
 * The token is handed in by the server component for rendering, but it is
 * deliberately kept out of the server response: the page receives only the
 * already-validated server URL from the server, and this component is the
 * boundary where the token begins to be used. Keeping the decision to render
 * here means the server can refuse an untrusted LiveKit URL without ever
 * echoing a token back into HTML.
 */
export function CustomRoomClient(props: {
  serverUrl: string;
  token: string;
  codec: string | undefined;
  singlePeerConnection: boolean;
}) {
  const codec = props.codec !== undefined && isVideoCodec(props.codec) ? props.codec : undefined;

  return (
    <main data-lk-theme="default" style={{ height: '100%' }}>
      <VideoConferenceClientImpl
        liveKitUrl={props.serverUrl}
        token={props.token}
        codec={codec}
        singlePeerConnection={props.singlePeerConnection}
      />
    </main>
  );
}
