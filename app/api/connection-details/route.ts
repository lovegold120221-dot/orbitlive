import { randomString } from '@/lib/client-utils';
import { getLiveKitURL } from '@/lib/getLiveKitURL';
import { ConnectionDetails } from '@/lib/types';
import { AccessToken, AccessTokenOptions, VideoGrant } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

const COOKIE_KEY = 'random-participant-postfix';

/** Metadata keys a client is never allowed to set for itself. */
const CLIENT_FORBIDDEN_METADATA_KEYS = ['role', 'moderator', 'admin', 'permissions', 'host'];

/**
 * Strips client-asserted privilege from participant metadata.
 *
 * A participant's role is a server decision. Accepting it from the query string
 * means anyone can mint themselves a moderator token with a single crafted
 * request, so those keys are removed before the value is signed into the JWT.
 * Everything else is preserved as a free-form annotation.
 */
function sanitizeParticipantMetadata(raw: string): string {
  if (!raw) return '';
  if (raw.length > 1024) return '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON: keep it as an opaque string, minus any embedded role claim.
    return raw.replace(/role|moderator/gi, '');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return raw.replace(/role|moderator/gi, '');
  }
  const out: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
  for (const key of CLIENT_FORBIDDEN_METADATA_KEYS) {
    delete out[key];
  }
  try {
    return JSON.stringify(out);
  } catch {
    return '';
  }
}

export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const roomName = request.nextUrl.searchParams.get('roomName');
    const participantName = request.nextUrl.searchParams.get('participantName');
    const metadata = request.nextUrl.searchParams.get('metadata') ?? '';
    const region = request.nextUrl.searchParams.get('region');
    if (!LIVEKIT_URL) {
      throw new Error('LIVEKIT_URL is not defined');
    }
    const livekitServerUrl = region ? getLiveKitURL(LIVEKIT_URL, region) : LIVEKIT_URL;
    let randomParticipantPostfix = request.cookies.get(COOKIE_KEY)?.value;
    if (livekitServerUrl === undefined) {
      throw new Error('Invalid region');
    }

    if (typeof roomName !== 'string') {
      return new NextResponse('Missing required query parameter: roomName', { status: 400 });
    }
    if (participantName === null) {
      return new NextResponse('Missing required query parameter: participantName', { status: 400 });
    }

    // Generate participant token
    if (!randomParticipantPostfix) {
      randomParticipantPostfix = randomString(4);
    }

    // The client used to be able to assert its own privilege: it sent
    // `metadata={"role":"moderator"}` and both the settings dialog and the
    // participants list derived the moderator role by parsing that same value.
    // Privilege has to be decided here or not at all, so any role claim from
    // the query string is dropped and only server-owned keys are honoured.
    // `createParticipantToken` signs the metadata into the JWT, so anything
    // left in here is a claim the client cannot forge — but nothing is granted
    // by it today, because every token gets identical permissions.
    const sanitizedMetadata = sanitizeParticipantMetadata(metadata);

    // Length/charset caps. These values are signed into a JWT and rendered as
    // participant names, so an unbounded string is both a token-size problem
    // and a display spoofing vector.
    if (participantName.length > 64) {
      return new NextResponse('participantName is too long (max 64 characters)', { status: 400 });
    }
    if (roomName.length > 128) {
      return new NextResponse('roomName is too long (max 128 characters)', { status: 400 });
    }
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f]/.test(participantName) || /[\x00-\x1f\x7f]/.test(roomName)) {
      return new NextResponse('roomName and participantName may not contain control characters', {
        status: 400,
      });
    }

    const participantToken = await createParticipantToken(
      {
        identity: `${participantName}__${randomParticipantPostfix}`,
        name: participantName,
        metadata: sanitizedMetadata,
      },
      roomName,
    );

    // Return connection details
    const data: ConnectionDetails = {
      serverUrl: livekitServerUrl,
      roomName: roomName,
      participantToken: participantToken,
      participantName: participantName,
    };
    return new NextResponse(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `${COOKIE_KEY}=${randomParticipantPostfix}; Path=/; HttpOnly; SameSite=Strict; Secure; Expires=${getCookieExpirationTime()}`,
      },
    });
  } catch (error) {
    console.error('[connection-details] failed', error);
    // A thrown non-Error used to make this handler return undefined, which
    // Next.js reports as "No response". Always answer, and keep the
    // configuration detail in the server log rather than the response body.
    if (error instanceof Error && /is not defined/.test(error.message)) {
      return new NextResponse('The conferencing service is not configured', { status: 500 });
    }
    return new NextResponse('Could not create a connection token', { status: 500 });
  }
}

function createParticipantToken(userInfo: AccessTokenOptions, roomName: string) {
  const at = new AccessToken(API_KEY, API_SECRET, userInfo);
  at.ttl = '5m';
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);
  return at.toJwt();
}

function getCookieExpirationTime(): string {
  var now = new Date();
  var time = now.getTime();
  var expireTime = time + 60 * 120 * 1000;
  now.setTime(expireTime);
  return now.toUTCString();
}
