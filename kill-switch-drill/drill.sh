#!/usr/bin/env bash
# drill.sh: time how long an agent's access keeps working after you revoke it.
#
# You describe each way the agent reaches something ("a path") as a check
# command that exits 0 while access works and non-zero once it is refused.
# The drill confirms every check passes, pulls your revoke levers, then polls
# each check until it fails. The slowest path is your time-to-revocation.
#
#   ./drill.sh \
#     --check 'existing-token=curl -sf -H "Authorization: Bearer $TOKEN" https://api.example.com/me' \
#     --check 'new-token=./get-token.sh' \
#     --revoke 'manual' \
#     --label 'support-bot'
#
# Options
#   --check NAME=COMMAND   a path to time (repeatable). COMMAND runs under bash -c.
#   --revoke COMMAND       a lever to pull (repeatable), in order. 'manual' pauses
#                          for you to revoke by hand; the clock starts when you
#                          press Enter.
#   --interval SECONDS     seconds between polls (default 1)
#   --timeout SECONDS      give up after this long (default 7200, two hours)
#   --confirm N            consecutive failures needed to count as refused (default 2)
#   --check-timeout SECS   kill a single check that hangs longer than this (default 10)
#   --label TEXT           names the run in results.csv (default: agent)
#   --out FILE             results file (default: results.csv)
#
# Exit codes: 0 every path refused, 1 a path still worked at the timeout,
#             2 bad arguments or a check failed before anything was revoked.
set -uo pipefail

names=(); cmds=(); revokes=()
interval=1; timeout_s=7200; confirm=2; check_timeout=10; label="agent"; out="results.csv"

die() { echo "drill: $*" >&2; exit 2; }
usage() { sed -n '2,/^set -uo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --check)   [ $# -ge 2 ] || die "--check needs NAME=COMMAND"
               case "$2" in *=*) ;; *) die "--check '$2' is not NAME=COMMAND" ;; esac
               names+=("${2%%=*}"); cmds+=("${2#*=}"); shift 2 ;;
    --revoke)  [ $# -ge 2 ] || die "--revoke needs a command or 'manual'"; revokes+=("$2"); shift 2 ;;
    --interval) interval="$2"; shift 2 ;;
    --timeout) timeout_s="$2"; shift 2 ;;
    --confirm) confirm="$2"; shift 2 ;;
    --check-timeout) check_timeout="$2"; shift 2 ;;
    --label)   label="$2"; shift 2 ;;
    --out)     out="$2"; shift 2 ;;
    -h|--help) usage 0 ;;
    *) die "unknown option '$1' (try --help)" ;;
  esac
done
[ ${#names[@]} -gt 0 ] || die "give at least one --check"
[ ${#revokes[@]} -gt 0 ] || die "give at least one --revoke (use 'manual' to revoke by hand)"

now() { date +%s.%N 2>/dev/null | sed 's/N$/0/'; }
elapsed() { awk -v a="$1" -v b="$(now)" 'BEGIN { printf "%.1f", b - a }'; }

run_check() {
  if command -v timeout >/dev/null 2>&1; then
    timeout "$check_timeout" bash -c "$1" >/dev/null 2>&1
  else
    bash -c "$1" >/dev/null 2>&1
  fi
}

# 1. Every path must work before anything is revoked, or the timing means nothing.
echo "Checking ${#names[@]} path(s) before revoking..."
for i in "${!names[@]}"; do
  if run_check "${cmds[$i]}"; then
    echo "  ok      ${names[$i]}"
  else
    echo "  FAILED  ${names[$i]}: this check fails before anything is revoked. Fix it first." >&2
    exit 2
  fi
done

# 2. Pull the levers. The clock starts at the first one.
t0=""
for r in "${revokes[@]}"; do
  if [ "$r" = "manual" ]; then
    read -r -p "Revoke the agent's access now, then press Enter to start the clock... " _ </dev/tty
    [ -n "$t0" ] || t0=$(now)
    echo "  lever   manual (clock started)"
  else
    [ -n "$t0" ] || t0=$(now)
    if bash -c "$r" >/dev/null 2>&1; then echo "  lever   ok      $r"; else echo "  lever   FAILED  $r (exit $?); timing continues" >&2; fi
  fi
done

# 3. Poll every path until each is refused `confirm` times in a row.
fails=(); first=(); refused=()   # indexed by path number: bash 3.2 (macOS) has no associative arrays
for i in "${!names[@]}"; do fails[$i]=0; done
pending=${#names[@]}
echo "Polling every ${interval}s (timeout ${timeout_s}s)..."
while [ "$pending" -gt 0 ]; do
  for i in "${!names[@]}"; do
    n="${names[$i]}"
    [ -n "${refused[$i]:-}" ] && continue
    started=$(elapsed "$t0")   # stamp the attempt when it starts, so slow checks don't drift later
    if run_check "${cmds[$i]}"; then
      fails[$i]=0; first[$i]=""
    else
      [ "${fails[$i]}" -eq 0 ] && first[$i]="$started"
      fails[$i]=$(( fails[$i] + 1 ))
      if [ "${fails[$i]}" -ge "$confirm" ]; then
        refused[$i]="${first[$i]}"; pending=$(( pending - 1 ))
        echo "  refused ${n} after ${refused[$i]} s"
      fi
    fi
  done
  [ "$pending" -eq 0 ] && break
  if awk -v e="$(elapsed "$t0")" -v t="$timeout_s" 'BEGIN { exit !(e >= t) }'; then break; fi
  sleep "$interval"
done

# 4. Report, and append one row per path to the results file.
[ -f "$out" ] || echo "run_date,label,path,seconds_to_first_refusal,status" > "$out"
run_date=$(date -u +%Y-%m-%dT%H:%M:%SZ)
slowest=""; slowest_s=0; still=()
for i in "${!names[@]}"; do
  n="${names[$i]}"
  if [ -n "${refused[$i]:-}" ]; then
    echo "$run_date,$label,$n,${refused[$i]},refused" >> "$out"
    if awk -v a="${refused[$i]}" -v b="$slowest_s" 'BEGIN { exit !(a >= b) }'; then slowest="$n"; slowest_s="${refused[$i]}"; fi
  else
    echo "$run_date,$label,$n,,still working at ${timeout_s}s" >> "$out"
    still+=("$n")
  fi
done
echo
if [ ${#still[@]} -eq 0 ]; then
  echo "time-to-revocation: ${slowest_s} s (slowest path: ${slowest})"
  exit 0
else
  echo "time-to-revocation: more than ${timeout_s} s (still working: ${still[*]})"
  exit 1
fi
