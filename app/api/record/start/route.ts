import { EgressClient, EncodedFileOutput, S3Upload } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { requireRecordingAuth, recordingDisabled } from '@/lib/recording-guard';

export async function POST(req: NextRequest) {
  try {
    /**
     * Server-side (egress) recording. This is a different facility from the
     * in-app local recorder, which records in the browser and downloads to the
     * user's own device.
     *
     * It used to be an unauthenticated GET, which meant anyone who knew or
     * guessed a room name could start a room-wide composite recording that
     * uploads to the customer's S3 bucket and burns egress compute — and could
     * do it from a plain <img src>, since a state-changing GET is trivially
     * CSRF-triggerable. It now requires an explicit opt-in flag and a shared
     * secret, and is POST so it is not reachable by a bare link.
     */
    const disabled = recordingDisabled();
    if (disabled) return disabled;

    const auth = requireRecordingAuth(req);
    if (auth) return auth;

    const roomName = req.nextUrl.searchParams.get('roomName');
    if (roomName === null) {
      return new NextResponse('Missing roomName parameter', { status: 400 });
    }
    // roomName becomes part of an S3 object key. Cap it and reject path
    // separators and control characters so it cannot escape the key prefix.
    if (roomName.length > 64 || /[\x00-\x1f\x7f]/.test(roomName)) {
      return new NextResponse('Invalid roomName parameter', { status: 400 });
    }

    const {
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
      LIVEKIT_URL,
      S3_KEY_ID,
      S3_KEY_SECRET,
      S3_BUCKET,
      S3_ENDPOINT,
      S3_REGION,
    } = process.env;

    const hostURL = new URL(LIVEKIT_URL!);
    hostURL.protocol = 'https:';

    const egressClient = new EgressClient(hostURL.origin, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

    const existingEgresses = await egressClient.listEgress({ roomName });
    if (existingEgresses.length > 0 && existingEgresses.some((e) => e.status < 2)) {
      return new NextResponse('Meeting is already being recorded', { status: 409 });
    }

    const fileOutput = new EncodedFileOutput({
      filepath: `${new Date(Date.now()).toISOString()}-${roomName}.mp4`,
      output: {
        case: 's3',
        value: new S3Upload({
          endpoint: S3_ENDPOINT,
          accessKey: S3_KEY_ID,
          secret: S3_KEY_SECRET,
          region: S3_REGION,
          bucket: S3_BUCKET,
        }),
      },
    });

    await egressClient.startRoomCompositeEgress(
      roomName,
      {
        file: fileOutput,
      },
      {
        layout: 'speaker',
      },
    );

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error('[record] failed', error);
    // Previously this returned `error.message` and, for a thrown non-Error,
    // fell out of the handler returning undefined — which Next.js reports as
    // "No response". Log the detail server-side; do not leak LiveKit internals
    // or S3 hostnames to an unauthenticated caller.
    return new NextResponse('Recording request failed', { status: 500 });
  }
}
