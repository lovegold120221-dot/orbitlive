'use client';
import * as React from 'react';

/**
 * Playback meter for the translated audio.
 *
 * Fed a single 0–1 level sampled from an AnalyserNode on the translated output
 * gain, so it is driven by the signal that is actually reaching the speakers
 * rather than by the transcript or the play/pause status. Because the analyser
 * sees the real waveform, the bars fall on their own as soon as a chunk ends
 * and rise again on the next one — no separate timer to keep in step.
 *
 * `level` is the loudest-bar height; the remaining bars are derived from it
 * with a fixed profile so the shape reads as a meter, not a random bar chart.
 */
export function TranslationVisualizer({
  level,
  playing,
  bars = 5,
}: {
  level: number;
  playing: boolean;
  bars?: number;
}) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0));

  return (
    <span
      className={`orbit-vis${playing ? ' is-playing' : ''}`}
      role="meter"
      aria-label="Translation audio playback level"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuetext={playing ? 'Translated audio playing' : 'No translated audio playing'}
    >
      {Array.from({ length: bars }, (_, i) => {
        // Centre bar is tallest, tapering outward, so the meter reads as one
        // object. `level` scales the whole profile.
        const centre = (bars - 1) / 2;
        const weight = 1 - Math.abs(i - centre) / (centre || 1);
        // Floor at 0.12 so an idle meter still shows its bars, dimmed, rather
        // than vanishing and shifting the header layout.
        const h = 0.12 + clamped * 0.88 * weight;
        return (
          <span
            key={i}
            className="orbit-vis-bar"
            style={{ transform: `scaleY(${h.toFixed(3)})` }}
          />
        );
      })}
    </span>
  );
}
