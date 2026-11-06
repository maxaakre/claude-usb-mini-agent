#!/bin/bash
PROJEKT="$(cd "${1:-$PWD}" && pwd)" || exit 1
cd "$(dirname "$0")"

TIMEOUT=300 # sekunder – modellen läses från ett långsamt USB-minne

# Klar = status ok och ett modell-API. En server som laddar svarar 503,
# och en annan app på porten saknar /v1/models.
server_ready() {
  curl -s --max-time 2 localhost:8080/health | grep -Eq '"status" *: *"ok"' &&
    curl -s --max-time 2 localhost:8080/v1/models | grep -Eq '"object" *: *"list"'
}

if ! server_ready; then
  echo "Startar modellen..."
  ./iniciar.command > server.log 2>&1 &
  SERVER_PID=$!
  trap "kill $SERVER_PID 2>/dev/null" EXIT
  until server_ready; do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      echo "Servern kunde inte starta (är port 8080 upptagen?). Slutet av server.log:" >&2
      tail -n 20 server.log >&2
      exit 1
    fi
    if [ "$SECONDS" -ge "$TIMEOUT" ]; then
      echo "Servern blev inte klar på $TIMEOUT sekunder. Slutet av server.log:" >&2
      tail -n 20 server.log >&2
      exit 1
    fi
    sleep 1
  done
fi
node agent.mjs "$PROJEKT"
