'use client';
import * as React from 'react';
import { ORBIT_LANGUAGES, useOrbitTranslator } from './OrbitTranslatorProvider';
import { SearchIcon, TranslateIcon } from './icons';
import { TranslationVisualizer } from './TranslationVisualizer';
import { TranscriptBox } from './TranscriptBox';

const STATUS_LABEL: Record<string, string> = {
  idle: 'Idle',
  connecting: 'Connecting',
  listening: 'Listening',
  translating: 'Translating',
  playing: 'Playing',
  error: 'Error',
};

export function OrbitTranslatorPanel({ onClose }: { onClose: () => void }) {
  const t = useOrbitTranslator();
  const [q, setQ] = React.useState('');

  const languages = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return ORBIT_LANGUAGES;
    return ORBIT_LANGUAGES.filter((l) => l.label.toLowerCase().includes(needle));
  }, [q]);

  const active = ORBIT_LANGUAGES.find((l) => l.code === t.targetLang);

  // Panel visibility is UI-only: hiding never stops the session (see provider).
  return (
    <>
      <div className="orbit-drawer-head">
        <h3 className="orbit-drawer-title">
          <TranslateIcon />
          Live Translator
          <TranslationVisualizer
            level={t.playbackLevel}
            playing={t.isPlayingTranslation && t.isActive}
          />
        </h3>
        <button
          className="orbit-drawer-x"
          onClick={onClose}
          aria-label="Close translator (keeps session running)"
          title="Close panel — translation session keeps running"
        >
          &times;
        </button>
      </div>

      <div className="orbit-drawer-body">
        <p className="orbit-mhint">
          Select your target language for real-time speech translation and on-screen live subtitles.
        </p>

        <div className="orbit-lang-search">
          <SearchIcon />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search target language..."
            aria-label="Search target language"
          />
        </div>

        <div className="orbit-mfield">
          <label htmlFor="orbit-target-lang">Target Language</label>
          <select
            id="orbit-target-lang"
            className="orbit-lang-select"
            value={t.targetLang}
            onChange={(e) => t.setTargetLang(e.target.value)}
          >
            {languages.length === 0 ? (
              <option value={t.targetLang}>
                No match — keeping {active?.label ?? t.targetLang}
              </option>
            ) : (
              languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="orbit-mfield">
          <label htmlFor="orbit-incoming-vol">Volume of incoming audio while translating</label>
          <input
            id="orbit-incoming-vol"
            className="orbit-vol"
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(t.incomingVolume * 100)}
            onChange={(e) => t.setIncomingVolume(Number(e.target.value) / 100)}
            aria-label="Volume of incoming audio while translating"
          />
          <span className="orbit-vol-read">{Math.round(t.incomingVolume * 100)}%</span>
          <p className="orbit-mhint">
            {t.isActive
              ? 'Incoming participants are ducked while you listen to the translation. Translated speech plays at full volume.'
              : 'Takes effect as soon as the translator starts.'}
          </p>
        </div>

        <div className="orbit-status-pill">
          <span className="orbit-status-dot" />
          <span>
            {t.isActive
              ? `Translating to: ${active?.label ?? t.targetLang}`
              : `Status: ${STATUS_LABEL[t.status] ?? t.status}`}
          </span>
        </div>

        {!t.isActive && (
          <button type="button" className="orbit-mbtn primary" onClick={t.start}>
            Start Translator
          </button>
        )}
        {t.isActive && (
          <button type="button" className="orbit-mbtn secondary" onClick={t.stop}>
            Stop Translator
          </button>
        )}

        {t.isActive && (
          <p className="orbit-mhint">
            Listening to {t.sourceCount} track{t.sourceCount === 1 ? '' : 's'} ({t.micCount} mic ·{' '}
            {t.screenAudioCount} screen audio)
            {t.sourceLabels.length > 0 && <> · {t.sourceLabels.slice(0, 3).join(' · ')}</>}
            {t.sourceLabels.length > 3 && <> +{t.sourceLabels.length - 3} more</>}
          </p>
        )}

        {t.isLocalSharingScreen && !t.hasLocalScreenAudio && (
          <p className="orbit-mhint is-warn">
            Your screen share has no audio track, so there is nothing on it to translate. Stop the
            share and start it again, then tick <strong>Also share tab audio</strong>. Only Chrome
            and Edge can capture it — Firefox and Safari cannot.
          </p>
        )}

        <p className="orbit-mhint">
          Your own screen share is translated too, so you hear the content you are presenting in{' '}
          {active?.label ?? t.targetLang}. Your microphone is the single source never used —
          translating it would play your own voice back through your own speakers.
        </p>

        <div className="orbit-trans-script">
          <h4>Original</h4>
          <TranscriptBox
            label="Original transcript"
            tone="source"
            text={t.original}
            placeholder="Real-time transcription of the incoming speaker appears here."
          />
        </div>
        <div className="orbit-trans-script">
          <h4>Translation</h4>
          <TranscriptBox
            label={`Translation into ${active?.label ?? t.targetLang}`}
            tone="output"
            text={t.translated}
            placeholder="Translated text appears here once the translator is running."
          />
        </div>

        {t.lastError && <p className="orbit-mhint is-error">Last error: {t.lastError}</p>}
      </div>
    </>
  );
}
