import { EgressClient } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { requireRecordingAuth, recordingDisabled } from '@/lib/recording-guard';

export async function POST(req: NextRequest) {
  try {
    /** See lib/recording-guard.ts: disabled unless opted in, and authenticated. */
    const disabled = recordingDisabled();
    if (disabled) return disabled;

    const auth = requireRecordingAuth(req);
    if (auth) return auth;

    const roomName = req.nextUrl.searchParams.get('roomName');
    if (roomName === null) {
      return new NextResponse('Missing roomName parameter', { status: 400 });
    }
    if (roomName.length > 128) {
      return new NextResponse('Invalid roomName parameter', { status: 400 });
    }

    const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;
    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return new NextResponse('LiveKit is not configured on this deployment', { status: 500 });
    }

    const hostURL = new URL(LIVEKIT_URL!);
    hostURL.protocol = 'https:';

    const egressClient = new EgressClient(hostURL.origin, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    const activeEgresses = (await egressClient.listEgress({ roomName })).filter(
      (info) => info.status < 2,
    );
    if (activeEgresses.length === 0) {
      return new NextResponse('No active recording found', { status: 404 });
    }
    await Promise.all(activeEgresses.map((info) => egressClient.stopEgress(info.egressId)));

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
