/**
 * Summary 탭의 순수 계산 — 여러 팀의 일정을 한 화면에 모으는 규칙.
 *
 * 화면(SummaryTab)은 이 함수들의 결과를 그리기만 한다. 날짜 경계·정렬·
 * "다음 경기는 무엇인가" 같은 판단은 전부 여기에 있고 테스트로 고정된다 —
 * 이 프로젝트에서 반복해서 틀렸던 게 정확히 그런 것들이다.
 */
import type { Match } from './types';
import { dayKey } from './kst';

/** 팀 하나와 그 팀의 경기들 */
export interface TeamFeed {
  id: string;
  matches: Match[];
}

/** 화면에 뿌릴 "한 팀의 다음 경기" */
export interface NextUp {
  teamId: string;
  match: Match;
}

const byKickoff = (a: Match, b: Match) => a.kickoffUtc.localeCompare(b.kickoffUtc);

/**
 * 팀마다 **아직 안 끝난 가장 가까운 경기**.
 *
 * 진행 중인 경기가 있으면 그게 다음 경기다 — 킥오프가 지났다고 건너뛰면
 * 경기 중에 히어로가 다음 주 경기를 가리킨다.
 */
export function nextUpOf(matches: Match[], now: number = Date.now()): Match | undefined {
  const live = matches.find((m) => m.status === 'live');
  if (live) return live;
  return [...matches]
    .filter((m) => m.status === 'scheduled' && Date.parse(m.kickoffUtc) >= now)
    .sort(byKickoff)[0];
}

/**
 * 모든 팀의 다음 경기를 **가까운 순**으로 세운다.
 * 맨 앞이 히어로, 나머지가 작은 카드다.
 */
export function nextUpBoard(feeds: TeamFeed[], now: number = Date.now()): NextUp[] {
  return feeds
    .map((f) => {
      const match = nextUpOf(f.matches, now);
      return match ? { teamId: f.id, match } : null;
    })
    .filter((x): x is NextUp => !!x)
    .sort((a, b) => byKickoff(a.match, b.match));
}

/* ── 주간 캘린더 ─────────────────────────────────────── */

const DAY = 86400000;

/** 'YYYY-MM-DD' → UTC 자정 타임스탬프 (KST 날짜 키를 날짜 계산에 쓰기 위해) */
export const keyToUtc = (key: string) => Date.parse(`${key}T00:00:00Z`);

/** 타임스탬프 → 'YYYY-MM-DD' */
export const utcToKey = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * 그 날짜가 속한 주의 **월요일** 키.
 * 한국에서 축구 주간은 월요일에 시작한다고 본다(주말 경기가 한 주의 끝).
 */
export function weekStartKey(dayK: string): string {
  const t = keyToUtc(dayK);
  const dow = new Date(t).getUTCDay();      // 0=일
  const back = (dow + 6) % 7;               // 월=0 … 일=6
  return utcToKey(t - back * DAY);
}

/** 월~일 7일의 날짜 키 */
export function weekKeys(startKey: string): string[] {
  const t = keyToUtc(startKey);
  return Array.from({ length: 7 }, (_, i) => utcToKey(t + i * DAY));
}

/** 주 라벨 'M/D ~ M/D' */
export function weekLabel(startKey: string): string {
  const keys = weekKeys(startKey);
  const md = (k: string) => `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}`;
  return `${md(keys[0])} ~ ${md(keys[6])}`;
}

export const shiftWeek = (startKey: string, delta: number) =>
  utcToKey(keyToUtc(startKey) + delta * 7 * DAY);

/** 캘린더 한 칸에 들어가는 경기 */
export interface DayMatch {
  teamId: string;
  match: Match;
}

/**
 * 날짜 키 → 그 날 우리 팀들의 경기 (킥오프 순).
 *
 * ⚠️ 같은 경기가 두 번 들어올 수 있다 — 우리 팀끼리 맞붙으면(첼시 vs 맨유)
 * 두 팀의 일정 파일에 같은 경기가 들어 있다. 한 칸에 두 줄이 되면 같은
 * 경기를 두 번 세게 되므로 경기 id 로 한 번만 남긴다.
 */
export function matchesByDay(feeds: TeamFeed[]): Map<string, DayMatch[]> {
  const out = new Map<string, DayMatch[]>();
  const seen = new Set<string>();
  for (const f of feeds) {
    for (const m of f.matches) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      const k = dayKey(m.kickoffUtc);
      const list = out.get(k);
      if (list) list.push({ teamId: f.id, match: m });
      else out.set(k, [{ teamId: f.id, match: m }]);
    }
  }
  for (const list of out.values()) list.sort((a, b) => byKickoff(a.match, b.match));
  return out;
}

/**
 * 같은 날짜를 다시 누르면 그 날의 다음 경기로 넘어간다.
 * 마지막 경기에서 또 누르면 처음으로 돌아온다.
 */
export function cycleIndex(prevKey: string | null, nextKey: string, prevIndex: number, count: number): number {
  if (count <= 0) return 0;
  if (prevKey !== nextKey) return 0;
  return (prevIndex + 1) % count;
}

/* ── 이달의 경기 결과 ────────────────────────────────── */

/**
 * 이번 달에 **끝난** 경기를 시간 역순으로.
 * 우리 팀끼리의 경기는 한 번만 넣는다(경기 id 기준).
 */
export function monthResults(feeds: TeamFeed[], monthK: string): DayMatch[] {
  const out: DayMatch[] = [];
  const seen = new Set<string>();
  for (const f of feeds) {
    for (const m of f.matches) {
      if (m.status !== 'finished') continue;
      if (dayKey(m.kickoffUtc).slice(0, 7) !== monthK) continue;
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push({ teamId: f.id, match: m });
    }
  }
  return out.sort((a, b) => byKickoff(b.match, a.match));
}
