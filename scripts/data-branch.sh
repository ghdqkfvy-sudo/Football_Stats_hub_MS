#!/usr/bin/env bash
# 데이터 브랜치(data) 다루기 — 수집한 JSON 을 main 이 아니라 data 브랜치에 쌓는다 (2026-11-12).
#
# 왜: 수집 봇이 20분마다 web/public/data 를 main 에 커밋해, main 의 최근 이력이 전부
#     "chore(data)" 였다(코드 변경이 묻히고, 코드를 올릴 때마다 봇 커밋과 리베이스해야 했다).
#     이제 main 에는 사람이 올린 커밋만 남는다. main 의 web/public/data 는 **씨앗 사본**으로 남겨 둔다
#     — data 브랜치가 없을 때(포크 · 첫 실행)와 로컬 개발의 기본값이다. 더 갱신되지는 않는다.
#
# 쓰는 법 (저장소 루트에서):
#   scripts/data-branch.sh pull            data 브랜치의 파일을 web/public/data 위에 덮어 놓는다
#   scripts/data-branch.sh push "메시지" [파일…]   pull 뒤에 바뀐 파일만(파일을 주면 그중 그것만) data 브랜치에 커밋 · 푸시
#                                          종료 코드 0 = 올렸다 · 10 = 바뀐 것 없음 · 그 밖 = 실패
#   scripts/data-branch.sh squash [N]      data 이력이 N(기본 200)개를 넘으면 한 커밋으로 접는다
#
# 여러 수집(빠른 · 느린 · 라이브)이 동시에 돈다. 그래서 "내 작업 폴더 전체" 가 아니라
# **이번에 내가 바꾼 파일만** 최신 data 위에 얹어 올린다 — 다른 수집이 그새 올린 파일을 낡은 사본으로
# 되돌리지 않는다. 푸시가 밀리면(누가 먼저 올렸거나 이력이 접혔으면) 최신에서 다시 얹는다.
set -euo pipefail

BRANCH=data
DIR=web/public/data
GITDIR=$(git rev-parse --git-dir)
SUMS="$GITDIR/data-branch.sums"

sums() { (cd "$DIR" && find . -maxdepth 1 -type f -name '*.json' -print0 | sort -z | xargs -0 -r sha1sum); }
fetch_data() { git fetch -q --depth="${1:-1}" origin "$BRANCH" 2>/dev/null; }

cmd_pull() {
  if fetch_data; then
    git archive FETCH_HEAD "$DIR" | tar -x
    echo "data 브랜치 $(git rev-parse --short FETCH_HEAD) 를 $DIR 에 덮었다"
  else
    echo "data 브랜치가 아직 없다 — main 의 씨앗 사본을 쓴다"
  fi
  sums > "$SUMS"
}

# 이번에 바뀐 파일 이름(pull 때 적어 둔 지문과 다른 것 · 새로 생긴 것)
changed_files() {
  [ -f "$SUMS" ] || { sums | awk '{print $2}' | sed 's|^\./||'; return; }
  # 줄 전체(지문 + 이름)로 견준다 — 이름만 견주면 내용이 바뀐 파일을 놓친다
  comm -23 <(sums | sort) <(sort "$SUMS") | awk '{print $2}' | sed 's|^\./||'
}

cmd_push() {
  local msg=${1:?커밋 메시지가 필요하다}
  git config user.name  >/dev/null 2>&1 || git config user.name  "stats-bot"
  git config user.email >/dev/null 2>&1 || git config user.email "stats-bot@users.noreply.github.com"

  shift
  local files; files=$(changed_files)
  # 파일 이름을 더 주면 그 파일만 올린다(라이브 수집은 자기 팀 live-*.json 만) — 몇 시간 도는 작업의
  # 낡은 사본이 다른 파일에 섞여 올라가지 않게
  if [ "$#" -gt 0 ] && [ -n "$files" ]; then
    files=$(printf '%s\n' "$files" | grep -Fx -f <(printf '%s\n' "$@" | sed 's|.*/||') || true)
  fi
  local wt attempt
  for attempt in 1 2 3 4 5; do
    wt=$(mktemp -d)
    local bootstrap=0
    if fetch_data; then
      git worktree add -q --detach "$wt" FETCH_HEAD
    else
      # 첫 실행 — 빈 이력에서 시작해 지금 폴더 전체를 올린다(씨앗 사본 + 방금 수집한 것)
      bootstrap=1
      git worktree add -q --detach "$wt" HEAD
      git -C "$wt" checkout -q --orphan "data-init-$$"
      git -C "$wt" rm -rfq --cached . >/dev/null 2>&1 || true
      find "$wt" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
    fi
    mkdir -p "$wt/$DIR"
    if [ "$bootstrap" = 1 ]; then
      cp "$DIR"/*.json "$wt/$DIR/"
    elif [ -n "$files" ]; then
      while IFS= read -r f; do [ -n "$f" ] && cp "$DIR/$f" "$wt/$DIR/$f"; done <<< "$files"
    fi

    git -C "$wt" add -A "$DIR"
    if git -C "$wt" diff --cached --quiet; then
      git worktree remove --force "$wt"; sums > "$SUMS"
      echo "변경 없음"; return 10
    fi
    # 병합 충돌 마커가 든 데이터는 올리지 않는다(2026-09-23 사고 — 봇이 충돌 마커를 배포했다)
    if git -C "$wt" grep -nI --cached -E '^(<<<<<<< |=======$|>>>>>>> )' -- "$DIR"; then
      git worktree remove --force "$wt"
      echo "::error::충돌 마커가 섞인 데이터가 있다. 올리지 않고 멈춘다." >&2; return 1
    fi
    git -C "$wt" commit -q -m "$msg"
    if git -C "$wt" push -q origin "HEAD:refs/heads/$BRANCH" 2>/dev/null; then
      git worktree remove --force "$wt"; sums > "$SUMS"
      echo "data 브랜치에 올렸다 (${attempt}번째 시도)"; return 0
    fi
    git worktree remove --force "$wt"
    echo "푸시가 밀렸다 — 최신 data 에서 다시 얹는다 (${attempt}/5)"
    sleep $((attempt * 2))
  done
  echo "::error::data 브랜치 푸시 5회 실패" >&2; return 1
}

cmd_squash() {
  local keep=${1:-200}
  fetch_data $((keep + 1)) || { echo "data 브랜치 없음"; return 0; }
  local n base; n=$(git rev-list --count FETCH_HEAD); base=$(git rev-parse FETCH_HEAD)
  if [ "$n" -le "$keep" ]; then echo "data 이력 ${n}개 — 그대로 둔다"; return 0; fi
  git config user.name  >/dev/null 2>&1 || git config user.name  "stats-bot"
  git config user.email >/dev/null 2>&1 || git config user.email "stats-bot@users.noreply.github.com"
  local wt; wt=$(mktemp -d)
  git worktree add -q --detach "$wt" FETCH_HEAD
  git -C "$wt" checkout -q --orphan "data-squash-$$"
  git -C "$wt" commit -q -m "chore(data): 이력 정리 $(date -u +'%Y-%m-%dT%H:%MZ')"
  # 그새 다른 수집이 올렸으면 접지 않는다(다음 회차에 다시 본다) — 남의 커밋을 지우지 않는다
  if git -C "$wt" push -q --force-with-lease="$BRANCH:$base" origin "HEAD:refs/heads/$BRANCH" 2>/dev/null; then
    echo "data 이력 ${n}개를 한 커밋으로 접었다"
  else
    echo "그새 새 커밋이 올라왔다 — 이번에는 접지 않는다"
  fi
  git worktree remove --force "$wt"
}

case "${1:-}" in
  pull) cmd_pull ;;
  push) shift; cmd_push "$@" ;;
  squash) shift; cmd_squash "$@" ;;
  *) echo "usage: $0 pull | push \"msg\" | squash [N]" >&2; exit 2 ;;
esac
