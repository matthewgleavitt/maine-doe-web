#!/bin/bash
# Local preview server for the Comms Portal.
# Serves comms-portal/ at http://localhost:8000.
# Usage: ./dev.sh [port]

set -e
cd "$(dirname "$0")/comms-portal"
PORT="${1:-8000}"

cat <<EOF

Comms Portal preview
   serving: $(pwd)
   port:    $PORT

Works locally (no auth needed):
  http://localhost:$PORT/templates.html
  http://localhost:$PORT/brandguide.html
  http://localhost:$PORT/engine.html
  http://localhost:$PORT/processes.html
  http://localhost:$PORT/publications.html
  http://localhost:$PORT/events-tracker.html
  http://localhost:$PORT/youtube-tracker.html
  http://localhost:$PORT/tools.html
  http://localhost:$PORT/analytics-dashboard.html

Needs maine.gov same-origin (won't fully work locally — deploy to staging to test):
  index.html               (Drupal auth gate)
  welcome.html             (Drupal moderation queue)
  file-manager.html        (Drupal JSON:API + admin delete)
  page-explorer.html       (Drupal JSON:API)

Press Ctrl+C to stop.

EOF

python3 -m http.server "$PORT"
