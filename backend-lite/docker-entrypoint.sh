#!/bin/sh
# backend-lite entrypoint: seed the SQLite database on first boot, then serve.
#
# The DB lives at $DB_PATH (default /app/data/data.db) on a named volume, so it
# survives restarts. Seeding only runs when the file is absent; delete the volume
# (docker compose down -v) or the file to force a fresh seed.
set -e

DB_FILE="${DB_PATH:-/app/data/data.db}"
mkdir -p "$(dirname "$DB_FILE")"

if [ ! -f "$DB_FILE" ]; then
  echo "[backend-lite] no database at $DB_FILE — seeding demo data..."
  npm run seed
else
  echo "[backend-lite] reusing existing database at $DB_FILE"
fi

echo "[backend-lite] starting API on :${PORT:-9000} (admin at /app)..."
exec npm start
