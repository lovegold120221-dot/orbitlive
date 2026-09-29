'use client';

/**
 * Runs a LiveKit track toggle and turns any failure into a readable message.
 *
 * `useTrackToggle().toggle` rethrows whenever the caller supplies no `onError`,
 * so every bare `void toggle()` produced an unhandled rejection with no
 * explanation. The two ordinary cases are both user actions, not bugs:
 * dismissing the screen-share picker rejects with AbortError, and a device
 * already held by another app rejects with NotReadableError.
 */

const MESSAGES: Array<[RegExp, string]> = [
  [/abort/i, 'Screen sharing was cancelled.'],
  [
    /notallowed|permission/i,
    'Permission denied. Check your browser’s camera or microphone access.',
  ],
  [/notreadable|track .*started|already/i, 'That device is busy in another application.'],
  [/notfound|devicesnotfound/i, 'No camera or microphone was found.'],
  [/overconstrained/i, 'That device is no longer available.'],
];

function messageFor(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  const text = err instanceof Error ? err.message : String(err ?? '');
  const haystack = `${name} ${text}`;
  for (const [re, msg] of MESSAGES) {
    if (re.test(haystack)) return msg;
  }
  return 'That device could not be started. Check the browser console for details.';
}

/** Fire-and-forget a toggle, reporting any rejection instead of swallowing it. */
export function runToggle(
  toggle: ((force?: boolean) => Promise<unknown>) | undefined,
  onError?: (message: string) => void,
): void {
  if (!toggle) return;
  void Promise.resolve()
    .then(() => toggle())
    .catch((err: unknown) => {
      const message = messageFor(err);
      console.warn('track toggle failed', err);
      onError?.(message);
    });
}
