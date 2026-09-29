'use client';
import * as React from 'react';

/**
 * A scrolling transcript box that follows new text automatically.
 *
 * The naive version — `scrollTop = scrollHeight` on every update — is wrong in
 * practice: the moment someone scrolls up to re-read an earlier line, the next
 * chunk yanks them back to the bottom mid-sentence. So this tracks whether the
 * reader is *following* (already at the bottom) and only auto-scrolls in that
 * case. Once they scroll away, the view stays where they left it and a
 * "Jump to latest" button appears instead.
 */
export function TranscriptBox({
  text,
  placeholder,
  tone = 'source',
  label,
}: {
  text: string;
  placeholder: string;
  /** `source` = what was said, `output` = the translation. Drives the colour. */
  tone?: 'source' | 'output';
  label: string;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [following, setFollowing] = React.useState(true);
  const [pinnedToBottom, setPinnedToBottom] = React.useState(true);

  // Re-pin whenever the reader returns to the bottom, or on a fresh session.
  React.useEffect(() => {
    setFollowing(true);
    setPinnedToBottom(true);
  }, [label]);

  // Follow new content only while the reader is already at the bottom. The
  // rAF lets the browser lay the new text out before we measure, otherwise
  // scrollHeight is the previous height and we land short.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !following || !text) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      setPinnedToBottom(true);
    });
    return () => cancelAnimationFrame(id);
  }, [text, following]);

  const onScroll = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Within a few pixels counts as "at the bottom" — scrollHeight is
    // fractional at times and an exact comparison flickers.
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
    setPinnedToBottom(atBottom);
    setFollowing(atBottom);
  }, []);

  const jumpToLatest = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setFollowing(true);
    setPinnedToBottom(true);
  }, []);

  const hasOverflow = text.length > 0;

  return (
    <>
      <div
        ref={ref}
        onScroll={onScroll}
        className={`orbit-trans-script-body is-${tone}`}
        role="log"
        aria-live="polite"
        aria-label={label}
        tabIndex={0}
      >
        {text || placeholder}
      </div>
      {hasOverflow && !pinnedToBottom && (
        <button
          type="button"
          className="orbit-trans-jump"
          onClick={jumpToLatest}
          // Deliberately not auto-focused: stealing focus mid-meeting would
          // pull the keyboard away from whatever they were doing.
        >
          ↓ Jump to latest
        </button>
      )}
    </>
  );
}
