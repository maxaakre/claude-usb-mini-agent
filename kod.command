#!/bin/bash
PROJEKT="$(cd "${1:-$PWD}" && pwd)" || exit 1
cd "$(dirname "$0")"
if ! curl -s localhost:8080/health >/dev/null; then
  echo "Startar modellen..."
  ./iniciar.command > server.log 2>&1 &
  SERVER_PID=$!
  trap "kill $SERVER_PID 2>/dev/null" EXIT
  until curl -s localhost:8080/health | grep -q ok; do sleep 1; done
fi
node agent.mjs "$PROJEKT"
