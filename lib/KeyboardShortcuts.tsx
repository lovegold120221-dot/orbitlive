'use client';

import React from 'react';
import { Track } from 'livekit-client';
import { useTrackToggle } from '@livekit/components-react';
import { runToggle } from '@/lib/runToggle';

/** True when the keystroke belongs to a text field rather than to the meeting. */
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

export function KeyboardShortcuts() {
  const { toggle: toggleMic } = useTrackToggle({ source: Track.Source.Microphone });
  const { toggle: toggleCamera } = useTrackToggle({ source: Track.Source.Camera });

  React.useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;

      // Never hijack a keystroke aimed at a text field. Without this, Ctrl+V
      // in the chat box was swallowed: the camera toggled instead of pasting,
      // because preventDefault ran before anything checked the focus target.
      if (isEditableTarget(event.target)) return;

      // Both shortcuts require Shift. Bare Ctrl+A / Ctrl+V collide with
      // select-all and paste, which are not ours to take over.
      if (!event.shiftKey) return;

      if (event.key === 'A' || event.key === 'a') {
        event.preventDefault();
        runToggle(toggleMic, (m) => console.warn(m));
      } else if (event.key === 'V' || event.key === 'v') {
        event.preventDefault();
        runToggle(toggleCamera, (m) => console.warn(m));
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [toggleMic, toggleCamera]);

  return null;
}
