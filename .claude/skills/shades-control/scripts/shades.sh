#!/usr/bin/env bash
# Send one op to the Shades agent bridge on the running dev server.
#
#   shades.sh <op> ['<json args>']
#   shades.sh patchConfig '{"store":"pattern","path":"patternTypeConfig.type","value":"hex"}'
#
# Port: $SHADES_PORT, else 9775 (main checkout). Worktree dev servers use 9776.
# Output: the JSON response. Exit 0 on ok, 2 when the bridge is switched off,
# 1 on any other failure.
set -euo pipefail

op="${1:?usage: shades.sh <op> ['<json args>']}"
args="${2:-}"
[ -z "$args" ] && args='{}'
port="${SHADES_PORT:-9775}"

body=$(printf '{"op":%s,"args":%s}' "$(printf '%s' "$op" | jq -Rs .)" "$args")

set +e
response=$(curl -sS --max-time 180 -w '\n%{http_code}' \
	-H 'Content-Type: application/json' \
	-X POST "http://localhost:${port}/__shades/agent" \
	--data "$body")
curl_status=$?
set -e

if [ $curl_status -ne 0 ]; then
	echo "{\"ok\":false,\"error\":\"No dev server answering on port ${port}. Start it with npm run dev, or set SHADES_PORT.\"}"
	exit 1
fi

code="${response##*$'\n'}"
json="${response%$'\n'*}"
echo "$json"
case "$code" in
	200) exit 0 ;;
	423) exit 2 ;;
	*) exit 1 ;;
esac
