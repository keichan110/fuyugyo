#!/usr/bin/env bash
set -uo pipefail

tc_out=$(pnpm run typecheck 2>&1); tc_ec=$?
lint_out=$(pnpm run lint 2>&1); lint_ec=$?
fmt_out=$(pnpm run format:check 2>&1); fmt_ec=$?
doctor_out=$(npx react-doctor@latest --scope changed --blocking error 2>&1); doctor_ec=$?

if [ $tc_ec -ne 0 ] || [ $lint_ec -ne 0 ] || [ $fmt_ec -ne 0 ] || [ $doctor_ec -ne 0 ]; then
  {
    [ $tc_ec -ne 0 ] && printf '%s\n' "$tc_out"
    [ $lint_ec -ne 0 ] && printf '%s\n' "$lint_out"
    [ $fmt_ec -ne 0 ] && printf '%s\n' "$fmt_out"
    [ $doctor_ec -ne 0 ] && printf '%s\n' "$doctor_out"
  } >&2
  exit 2
fi
