'use client';
import * as React from 'react';

export const IDLE_MS = 5000;

/**
 * Jitsi-style interface auto-hide: the toolbar fades out after `ms` of no
 * interaction and snaps back on the next mouse move, key press or touch.
 *
 * `suppress` (a drawer, popover or modal is open) pins the UI visible so
 * controls can never disappear out from under someone mid-interaction.
 *
 * Pass a non-finite `ms` (or the Settings "Always show the toolbar" toggle)
 * to disable auto-hide entirely.
 */
export function useIdleUi(suppress: boolean, ms: number = IDLE_MS) {
  const [visible, setVisible] = React.useState(true);
  const timer = React.useRef<ReturnType<typeof setTimeout>>();

  const wake = React.useCallback(() => {
    setVisible(true);
    clearTimeout(timer.current);
    // A non-finite timeout means "never auto-hide" (the user's
    // "Always show the toolbar" preference). setTimeout rejects Infinity.
    if (!Number.isFinite(ms)) return;
    timer.current = setTimeout(() => setVisible(false), ms);
  }, [ms]);

  // (Re)arm whenever the suppress state flips so opening a panel restarts
  // the countdown from the moment it closes.
  React.useEffect(() => {
    if (suppress) {
      clearTimeout(timer.current);
      setVisible(true);
    } else {
      wake();
    }
  }, [suppress, wake]);

  React.useEffect(() => {
    const onActivity = () => wake();
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('mousedown', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('touchstart', onActivity);
    window.addEventListener('wheel', onActivity, { passive: true });
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('mousedown', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('touchstart', onActivity);
      window.removeEventListener('wheel', onActivity);
    };
  }, [wake]);

  return { visible, wake };
}
