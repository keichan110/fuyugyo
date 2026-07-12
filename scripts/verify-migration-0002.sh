#!/usr/bin/env bash
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly DATABASE_PATH="$(mktemp "${TMPDIR:-/tmp}/fuyugyo-migration-0002.XXXXXX.db")"

cleanup() {
  rm -f "$DATABASE_PATH"
}
trap cleanup EXIT

result="$(${SQLITE3:-sqlite3} "$DATABASE_PATH" \
  '.bail on' \
  'PRAGMA foreign_keys=ON;' \
  ".read $ROOT_DIR/drizzle/0000_zippy_ulik.sql" \
  ".read $ROOT_DIR/drizzle/0001_datetime_conversion.sql" \
  ".read $ROOT_DIR/test/fixtures/migration-0002-existing-data.sql" \
  'BEGIN;' \
  ".read $ROOT_DIR/drizzle/0002_odd_cargill.sql" \
  'COMMIT;' \
  'SELECT count(*) FROM instructor_certifications;' \
  'SELECT count(*) FROM shift_assignments;' \
  'SELECT count(*) FROM pragma_foreign_key_check;' \
  "SELECT group_concat(department_code, ',') FROM (SELECT DISTINCT department_code FROM certifications ORDER BY department_code);" \
  "SELECT group_concat(department_code, ',') FROM (SELECT DISTINCT department_code FROM shifts ORDER BY department_code);")"

readonly expected=$'1\n1\n0\nski,snowboard\nski'
if [[ "$result" != "$expected" ]]; then
  echo '0002 マイグレーション検証失敗' >&2
  echo "$result" >&2
  exit 1
fi

echo '0002 マイグレーション検証成功'
echo 'instructor_certifications=1, shift_assignments=1, foreign_key_errors=0'
