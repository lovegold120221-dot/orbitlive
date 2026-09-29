'use client';
import * as React from 'react';
import { useRoomContext } from '@livekit/components-react';
import { useLocalMeetingRecorder, type RecorderStatus } from '@/lib/useLocalMeetingRecorder';

type RecorderCtx = {
  status: RecorderStatus;
  elapsed: number | null;
  error: string | null;
  isRecording: boolean;
  start: () => Promise<void>;
  stop: () => void;
};

const Ctx = React.createContext<RecorderCtx | null>(null);

export function useOrbitRecorder(): RecorderCtx {
  const v = React.useContext(Ctx);
  if (!v) throw new Error('useOrbitRecorder must be used inside OrbitRecorderProvider');
  return v;
}

/**
 * Owns the single local recorder instance for the meeting.
 *
 * The toolbar button and the Settings dialog both drive recording, so the hook
 * lives here rather than inside either of them — two instances would mean two
 * capture graphs, two canvases and two downloads from one click.
 */
export function OrbitRecorderProvider({ children }: { children: React.ReactNode }) {
  const room = useRoomContext();
  const rec = useLocalMeetingRecorder(room);

  const value = React.useMemo<RecorderCtx>(
    () => ({
      status: rec.status,
      elapsed: rec.elapsed,
      error: rec.error,
      isRecording: rec.status === 'recording' || rec.status === 'saving',
      start: rec.start,
      stop: rec.stop,
    }),
    [rec.status, rec.elapsed, rec.error, rec.start, rec.stop],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
