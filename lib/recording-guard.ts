import { NextRequest, NextResponse } from 'next/server';

/**
 * Guard for the server-side (egress) recording routes.
 *
 * These endpoints start and stop a room-wide composite recording that uploads
 * to the customer's S3 bucket. They were originally unauthenticated GETs, which
 * meant anyone who could guess or observe a room name could trigger a recording
 * and stop one in progress — and could do it from a bare `<img src>`, because a
 * state-changing GET is trivially CSRF-triggerable.
 *
 * The app's actual recording feature is the in-browser local recorder, which
 * needs no server at all. So the default posture here is **off**: the routes
 * only do anything when a deployment explicitly opts in.
 */

/** Disabled unless explicitly enabled, so the default deploy has no S3 egress. */
export function recordingDisabled(): NextResponse | null {
  if (process.env.ORBIT_RECORDING_ENABLED === '1') return null;
  return new NextResponse('Server-side recording is not enabled on this deployment', {
    status: 404,
  });
}

/**
 * Requires a bearer secret matching ORBIT_RECORDING_SECRET.
 *
 * Returns a 401 response when the check fails, or null when the caller is
 * authorised. A missing configured secret fails closed.
 */
export function requireRecordingAuth(req: NextRequest): NextResponse | null {
  const expected = process.env.ORBIT_RECORDING_SECRET;
  if (!expected) {
    // Enabled but no secret set is a misconfiguration: refuse rather than
    // silently falling back to open access.
    return new NextResponse('Server-side recording is misconfigured', { status: 500 });
  }
  const header = req.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  // Constant-time-ish compare; lengths are equal in the happy path.
  let mismatch = presented.length ^ expected.length;
  const max = Math.max(presented.length, expected.length);
  for (let i = 0; i < max; i++) {
    mismatch |= (presented.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  }
  if (mismatch !== 0) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  return null;
}
