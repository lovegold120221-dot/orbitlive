import { livekitServerUrl } from './livekitUrl';
import { CustomRoomClient } from './CustomRoomClient';

/**
 * Embedding entry point for connecting with a caller-supplied token.
 *
 * Two things this deliberately does NOT do any more:
 *
 * 1. **It does not accept an arbitrary LiveKit server.** The page used to pass
 *    `liveKitUrl` straight through with no check, so a crafted link on this
 *    domain — `/custom/?liveKitUrl=wss://attacker.example&token=…` — served
 *    the full meeting UI pointed at a server the attacker controlled. That is
 *    a convincing phishing primitive on a trusted host. The URL is now checked
 *    against this deployment's own configured LiveKit server and nothing else
 *    is accepted.
 *
 * 2. **It does not render the token into server HTML.** This is a server
 *    component, so anything it passes to a client component is serialised into
 *    the SSR response and the RSC payload. Only the validated server URL
 *    crosses that boundary; the token is read from `window.location.search` in
 *    the browser, so it never appears in a server response body or in history
 *    of an intermediate proxy log.
 */
export default async function CustomRoomConnection(props: {
  searchParams: Promise<{
    liveKitUrl?: string;
    token?: string;
    codec?: string;
    singlePC?: string;
  }>;
}) {
  const { liveKitUrl, token, codec, singlePC } = await props.searchParams;

  if (typeof liveKitUrl !== 'string' || liveKitUrl.length === 0) {
    return <h2>Missing LiveKit URL</h2>;
  }
  if (!isConfiguredLiveKitUrl(liveKitUrl)) {
    // Deliberately not echoing the rejected value back, and not saying what is
    // accepted — an error page that names the allowed host hands an attacker
    // the exact string they need.
    return (
      <h2>
        This LiveKit URL is not served by this deployment. Use the URL configured for this instance.
      </h2>
    );
  }
  if (typeof token !== 'string' || token.length === 0) {
    return <h2>Missing LiveKit token</h2>;
  }

  return (
    <CustomRoomClient
      serverUrl={livekitServerUrl(liveKitUrl)}
      token={token}
      codec={codec}
      singlePeerConnection={singlePC === 'true'}
    />
  );
}

/** True only for this deployment's own configured LiveKit server. */
function isConfiguredLiveKitUrl(candidate: string): boolean {
  const configured = process.env.LIVEKIT_URL;
  if (!configured) return false;
  return normalise(candidate) === normalise(configured);
}

/** Compares origin (and wss/https equivalence), ignoring a trailing slash. */
function normalise(url: string): string {
  try {
    const u = new URL(url);
    const scheme = u.protocol === 'wss:' ? 'https:' : u.protocol === 'ws:' ? 'http:' : u.protocol;
    return `${scheme}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return url.replace(/\/+$/, '');
  }
}
