import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const LIVE_TRANSLATE_MODEL = 'models/gemini-3.5-live-translate-preview';

/**
 * Orbit translator backend readiness probe.
 *
 * Uses the @google/genai SDK server-side with GEMINI_API_KEY to verify that
 * models/gemini-3.5-live-translate-preview is reachable. The API key never
 * leaves the server: this route only returns { ok, model }.
 * The browser client streams audio to the translator service WebSocket, which
 * holds the key and owns the realtime Gemini session.
 */
export async function GET() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { ok: false, error: 'GEMINI_API_KEY is not configured on the server' },
      { status: 503 },
    );
  }
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const model = await ai.models.get({ model: LIVE_TRANSLATE_MODEL });
    return NextResponse.json({
      ok: true,
      model: model.name ?? LIVE_TRANSLATE_MODEL,
      displayName: (model as { displayName?: string }).displayName ?? undefined,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Model check failed';
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
