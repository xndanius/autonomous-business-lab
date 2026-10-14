#!/usr/bin/env bash
# Saves the data folder as a single commit on the sim-data branch.
# Run from the repository root after sim/engine.mjs. Needs GH_TOKEN.
set -u
cd data || exit 1
if [ -z "$(git status --porcelain)" ]; then
  echo "Nothing new."
  exit 0
fi
TICK=$(node -p "require('./state.json').tick" 2>/dev/null || echo "x")
git checkout --quiet --orphan "snap-${TICK}-${RANDOM}-$(node -p 'Date.now()')"
git add -A
git -c user.name="class-sim" -c user.email="class-sim@users.noreply.github.com" commit --quiet -m "Class chat, tick ${TICK}"
REMOTE="${SIM_REMOTE:-https://x-access-token:${GH_TOKEN:-}@github.com/${GITHUB_REPOSITORY:-}.git}"
for i in 1 2 3; do
  if git push --quiet --force "$REMOTE" HEAD:refs/heads/sim-data; then
    # refresh the fallback mirror the page uses if raw.githubusercontent.com is slow or limited
    [ -z "${SIM_REMOTE:-}" ] && curl -s -m 20 "https://purge.jsdelivr.net/gh/${GITHUB_REPOSITORY}@sim-data/state.json" > /dev/null
    exit 0
  fi
  sleep 5
done
exit 1
