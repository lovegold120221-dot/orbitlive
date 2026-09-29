# orbitlive

Orbit Meeting — secure, high-quality video meetings. Next.js + LiveKit with an Orbit-branded landing page, pre-join, in-room stage, live translation, chat, and recording.

## Features

- Landing page with instant rooms, bookable meeting URLs, and recent-meeting history
- Pre-join screen with camera / mic / speaker pickers and device checks
- In-room stage, participant tiles, participants panel, chat, and control bar
- Live translator panel with transcript box and visualizer (external translator over WebSocket)
- Local + server-side recording hooks with S3-compatible egress config
- End-to-end encryption option (passphrase in URL hash, never sent to the server)
- Custom-room embed at `/custom` (validated against this deployment's LiveKit server only)
- Docker-first production deploy with type + lint gate and live verification

## Tech stack

- Next.js 15, React 18, TypeScript
- `@livekit/components-react`, `livekit-client`, `livekit-server-sdk`
- pnpm 10
- Docker + Docker Compose (Node 22 alpine, standalone output)

## Getting started

Prerequisites: Node 18+, pnpm 10, a LiveKit server or LiveKit Cloud project.

```sh
pnpm install
cp .env.example .env.local
# fill in LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL
pnpm dev
# open http://localhost:3000
```

Build / run locally:

```sh
pnpm build
pnpm start
```

Lint / tests:

```sh
pnpm lint
pnpm test
```

## Environment

Only these are actually read by the app. Dev uses `.env.local`, production uses `.env.deploy` (`0600`, passed via `env_file`, never committed).

### Required — meetings won't work without these

| Var | Where | Description |
| --- | --- | --- |
| `LIVEKIT_URL` | server | Your LiveKit server. Cloud: `wss://your-project.livekit.cloud`. Self-hosted: `wss://livekit.your-domain.com`. Read by `/api/connection-details`, `/api/record/*`, and `/custom` URL validation. |
| `LIVEKIT_API_KEY` | server | Issues participant tokens (`app/api/connection-details/route.ts`). |
| `LIVEKIT_API_SECRET` | server | Signs participant tokens. |

### Translator (optional)

| Var | Where | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | server | Only used by `GET /api/orbit-translator-status` to probe `models/gemini-3.5-live-translate-preview`. Without it the route returns `503` and the UI shows the backend as not ready. The realtime audio path itself goes over the translator WebSocket service, which holds its own key. |
| `NEXT_PUBLIC_ORBIT_TRANSLATOR_WS` | build | Translator WebSocket URL. Defaults to same-origin `/orbit-translator/`. Set it when the translator runs elsewhere, e.g. `wss://your-domain.com/orbit-translator/`. Baked at build time. |

### Server recording / egress (optional, off by default)

Local in-browser recording needs no server. The `/api/record/start|stop` egress endpoints stay `404` unless you opt in:

| Var | Where | Description |
| --- | --- | --- |
| `ORBIT_RECORDING_ENABLED=1` | server | Opt-in flag. Anything else (including unset) keeps egress disabled. |
| `ORBIT_RECORDING_SECRET` | server | Bearer secret for the record routes. Fails closed when missing. |
| `S3_ENDPOINT` / `S3_KEY_ID` / `S3_KEY_SECRET` / `S3_BUCKET` / `S3_REGION` | server | Only needed when recording is enabled. S3-compatible upload target for the composite `.mp4`. |

### Misc (optional)

| Var | Where | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_CONN_DETAILS_ENDPOINT` | build | Token endpoint override. Defaults to `/api/connection-details`. |

Not needed: `NEXT_PUBLIC_SHOW_SETTINGS_MENU`, `NEXT_PUBLIC_LK_RECORD_ENDPOINT` (legacy LiveKit demo menu), Datadog / debug flags. Minimal `.env.local`:

```sh
LIVEKIT_URL=wss://livekit.your-domain.com
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
# optional: GEMINI_API_KEY=... (translator status probe)
```

`NEXT_PUBLIC_*` values are baked at build time — changing them requires a rebuild (Docker `ARG`, see `Dockerfile`).

## Self-hosting

Yes — everything is self-hostable. This repo only runs the web app; LiveKit and the translator are separate services you point it at.

1. Run LiveKit OSS (see LiveKit docs for its own compose/ports) and note its public `wss://` URL plus API key/secret.
2. Run this app: `docker compose build meet && docker compose up -d --force-recreate meet` (`127.0.0.1:3000:3000`, `standalone` output). Secrets come from `.env.deploy` as container env — `NEXT_PUBLIC_*` stay build args.
3. Put a reverse proxy with TLS in front. Proxy `/orbit-translator/` (WebSocket) to your translator service, everything else to the app on `127.0.0.1:3000`.
4. Set `NEXT_PUBLIC_ORBIT_TRANSLATOR_WS=wss://your-domain.com/orbit-translator/` at build time if the translator is split out (otherwise the app defaults to same-origin `/orbit-translator/`).
5. The `?region=` query param only rewrites `*.livekit.cloud` hosts (`lib/getLiveKitURL.ts`) — it is a no-op for self-hosted URLs.

## Docker deploy

```sh
# .env.deploy holds server secrets (LIVEKIT_*, GEMINI_API_KEY, optional ORBIT_RECORDING_*/S3_*)
docker compose build meet
docker compose up -d --force-recreate meet
```

Verified deploy (type-check, lint, rebuild, container-image check, HTTP checks):

```sh
./scripts/deploy.sh
DEPLOY_URL=https://your-host DEPLOY_MARKER="orbit-landing" ./scripts/deploy.sh
```

See `docker-compose.yml` and `scripts/deploy.sh` for the full flow. The compose file binds `127.0.0.1:3000:3000` — put TLS / reverse proxy in front.

## Project structure

```text
app/
  page.tsx                    # landing / room entry
  rooms/[roomName]/           # standard room flow
  custom/                     # embed flow (?liveKitUrl + token)
  api/
    connection-details/       # token minting
    record/start|stop/        # egress recording
    orbit-translator-status/  # translator health
components/orbit/             # OrbitMeeting, OrbitPreJoin, Stage, ControlBar,
                              # ChatPanel, TranslatorPanel, recorder, modals, icons
lib/                          # meeting prefs, languages, recording guard, avatar
public/images/orbit-logo.svg  # brand
styles/orbit.css              # Orbit theme
scripts/deploy.sh             # verified deploy
Dockerfile / docker-compose.yml
.opencode/skills/gh/          # gh CLI skill (auth via gh, no secrets in repo)
```

## Routes

- `/` — create / join, settings, recents
- `/rooms/:roomName` — full meeting (pre-join → stage)
- `/custom/?liveKitUrl=<url>&token=<jwt>` — embed; URL must match `LIVEKIT_URL`

## License

See `LICENSE`.
