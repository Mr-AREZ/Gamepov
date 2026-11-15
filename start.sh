#!/usr/bin/env bash
# Build the site and open it at http://localhost:8080
cd "$(dirname "$0")"
if command -v node >/dev/null 2>&1; then
  node scripts/build.js
  (sleep 1; (command -v open >/dev/null && open http://localhost:8080) || (command -v xdg-open >/dev/null && xdg-open http://localhost:8080) || true) &
  node scripts/serve.js 8080
elif command -v python3 >/dev/null 2>&1; then
  echo "Node.js not found - serving the pre-built dist/ with Python."
  (sleep 1; (command -v open >/dev/null && open http://localhost:8080) || (command -v xdg-open >/dev/null && xdg-open http://localhost:8080) || true) &
  python3 -m http.server 8080 --directory dist
else
  echo "Please install Node.js (LTS) from https://nodejs.org and run this again."
fi
