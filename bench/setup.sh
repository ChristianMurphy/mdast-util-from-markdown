#!/usr/bin/env bash
# Set up paired worktrees for the perf bench.
#
#   bash bench/setup.sh           # create .baseline/ (main) and .pr/ (PR #50)
#   bash bench/setup.sh teardown  # remove worktrees and the pr-50 ref

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

PR_NUMBER="${BENCH_PR:-50}"
PR_REF="pr-${PR_NUMBER}"
PR_REMOTE="${BENCH_PR_REMOTE:-origin}"
BASELINE_REF="${BENCH_BASELINE:-main}"
BASELINE_DIR="bench/.baseline"
PR_DIR="bench/.pr"

cmd="${1:-up}"

teardown() {
  if git worktree list --porcelain | grep -q "$BASELINE_DIR"; then
    git worktree remove --force "$BASELINE_DIR"
  fi
  if git worktree list --porcelain | grep -q "$PR_DIR"; then
    git worktree remove --force "$PR_DIR"
  fi
  if git show-ref --verify --quiet "refs/heads/${PR_REF}"; then
    git branch -D "${PR_REF}"
  fi
  rm -rf "$BASELINE_DIR" "$PR_DIR"
  echo "teardown: clean"
}

up() {
  if [ ! -d "$BASELINE_DIR" ]; then
    # Use --detach so this worktree doesn't conflict with the parent checkout
    # of the same branch.
    BASELINE_SHA="$(git rev-parse "$BASELINE_REF")"
    git worktree add --detach "$BASELINE_DIR" "$BASELINE_SHA"
  else
    echo "baseline worktree already present at $BASELINE_DIR"
  fi

  if ! git show-ref --verify --quiet "refs/heads/${PR_REF}"; then
    git fetch "${PR_REMOTE}" "pull/${PR_NUMBER}/head:${PR_REF}"
  fi

  if [ ! -d "$PR_DIR" ]; then
    PR_SHA="$(git rev-parse "$PR_REF")"
    git worktree add --detach "$PR_DIR" "$PR_SHA"
  else
    echo "pr worktree already present at $PR_DIR"
  fi

  for dir in "$BASELINE_DIR" "$PR_DIR"; do
    if [ ! -d "$dir/node_modules" ]; then
      ln -s "$REPO_ROOT/node_modules" "$dir/node_modules"
    fi
  done

  echo "ready:"
  echo "  baseline -> $BASELINE_DIR (ref: $BASELINE_REF)"
  echo "  pr       -> $PR_DIR (ref: $PR_REF)"
}

case "$cmd" in
  up)        up ;;
  teardown)  teardown ;;
  *)         echo "usage: bash bench/setup.sh [up|teardown]"; exit 2 ;;
esac
