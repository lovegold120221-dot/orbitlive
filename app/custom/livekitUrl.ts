/**
 * Normalises a LiveKit WebSocket URL for the client SDK.
 *
 * The SDK expects a `wss://` (or `ws://` on plain-HTTP local development) URL.
 * A caller may supply the https/wss form of the same server, so the two are
 * treated as equivalent.
 */
export function livekitServerUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('https://')) return `wss://${trimmed.slice('https://'.length)}`;
  if (trimmed.startsWith('http://')) return `ws://${trimmed.slice('http://'.length)}`;
  return trimmed;
}
