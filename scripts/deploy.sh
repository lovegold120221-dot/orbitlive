#!/usr/bin/env bash
# Build, recreate and *verify* the Orbit Meeting container.
#
# The verification is the important part: a successful `docker compose up -d`
# only says the container started, not that it is running the image we just
# built. This compares the running container's image ID against the freshly
# built tag, then confirms the expected code marker is actually being served
# by the public site.
set -euo pipefail

cd /root/meet

SERVICE=meet
IMAGE=orbit-meet-test:1.0.0
CONTAINER=orbit-meet-test
URL="${DEPLOY_URL:-https://test.abitech.site}"
# A string that only exists in the build being deployed, used as a live marker.
MARKER="${DEPLOY_MARKER:-}"
# Seconds to wait for the container to answer after it starts.
WARMUP="${DEPLOY_WARMUP:-20}"

echo "==> type + lint gate"
# The Docker build runs ESLint and fails on error-level lint, but only after
# several minutes of building, and its output gets buried under source-map
# noise. Catching it here first turns a failed deploy into a fast, obvious
# failure. `tsc` passing is NOT sufficient: it does not run ESLint, and this
# repo's standalone eslint needs an eslint.config.js that does not exist.
if ! npx tsc --noEmit; then
  echo "    FAIL: type errors"
  exit 1
fi
if npx next lint --dir app --dir components --dir lib 2>&1 | grep -q "Error:"; then
  echo "    FAIL: lint errors (re-run: npx next lint --dir app --dir components --dir lib)"
  npx next lint --dir app --dir components --dir lib 2>&1 | grep -B2 "Error:" | head -30
  exit 1
fi
echo "    types and lint clean"

echo "==> building $IMAGE"
if [[ "${DEPLOY_NO_CACHE:-0}" == "1" ]]; then
  # Bypass the Docker layer cache for this build only. Note this does NOT prune
  # the shared build cache, so the livekit / jitsi / translator images keep
  # theirs and stay fast to rebuild.
  echo "    --no-cache: ignoring cached layers"
  rm -rf .next
  docker compose build --no-cache "$SERVICE"
else
  docker compose build "$SERVICE"
fi

built_id="$(docker image inspect "$IMAGE" --format '{{.Id}}')"
echo "    image id: $built_id"

echo "==> recreating $CONTAINER"
docker compose up -d --force-recreate "$SERVICE"

running_id="$(docker inspect "$CONTAINER" --format '{{.Image}}')"
if [[ "$running_id" != "$built_id" ]]; then
  echo "FAIL: container is running $running_id but the build produced $built_id" >&2
  exit 1
fi
echo "    container runs the freshly built image"

echo "==> waiting for the app to answer"
for ((i = 0; i < WARMUP; i++)); do
  if curl -fsS -o /dev/null "$URL/"; then break; fi
  sleep 1
  if ((i == WARMUP - 1)); then
    echo "FAIL: $URL did not respond within ${WARMUP}s" >&2
    docker logs --tail 40 "$CONTAINER" >&2
    exit 1
  fi
done

status="$(curl -s -o /dev/null -w '%{http_code}' "$URL/")"
if [[ "$status" != "200" ]]; then
  echo "FAIL: $URL/ returned $status" >&2
  exit 1
fi
echo "    $URL/ -> 200"

for route in "/rooms/DeployCheck" "/custom/"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$URL$route")"
  echo "    $route -> $code"
  [[ "$code" == "200" || "$code" == "308" ]] || { echo "FAIL: $route returned $code" >&2; exit 1; }
done

if [[ -n "$MARKER" ]]; then
  # Check the marker inside the RUNNING CONTAINER's build output, not just the
  # chunks named in the served HTML.
  #
  # The previous version only scanned /_next/static/chunks/*.js referenced by
  # the initial HTML of /rooms/DeployCheck. That misses route-specific chunks
  # under chunks/app/**/page-*.js, which are lazily loaded and named nowhere in
  # the first response — so a marker that lived only in the room page looked
  # absent from a perfectly good build. It also fails for any identifier the
  # minifier renamed, which only survives in a .map.
  #
  # BOTH trees are searched. A change can legitimately land in either:
  #   /app/.next/static/  — client components and CSS
  #   /app/.next/server/  — server components and route handlers
  # Checking only static/ reported a good build as wrong whenever the change was
  # server-side, and checking only chunks named in the HTML missed lazily
  # loaded route chunks.
  if docker exec "$CONTAINER" grep -rq -- "$MARKER" /app/.next/static/ 2>/dev/null ||
    docker exec "$CONTAINER" grep -rq -- "$MARKER" /app/.next/server/ 2>/dev/null; then
    echo "    running container's build contains marker: $MARKER"
  else
    echo "FAIL: marker \"$MARKER\" is nowhere in the running container's build output" >&2
    echo "      wrong build deployed, or the marker does not match the source verbatim." >&2
    echo "      use a string that appears character-for-character in the source." >&2
    echo "      note: identifiers are renamed by minification, so pick a literal" >&2
    echo "      such as a CSS class, a sentence, or a user-facing label." >&2
    exit 1
  fi
fi

echo "==> deploy OK"
