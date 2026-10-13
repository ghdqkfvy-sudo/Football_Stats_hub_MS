import type { Match } from './types';

/**
 * 앱을 켜 둔 채로 데이터를 다시 받는 규칙.
 *
 * 예전에는 일정이 팀을 고를 때 **한 번만** 받아졌다. 화면을 켜 두고 기다리면
 * 킥오프 시각이 지나도 카운트다운만 0 에 멈추고 스코어는 오지 않았다.
 *
 * - 경기가 진행 중이거나 곧/방금 시작한 경기가 있을 때만 주기적으로 받는다
 *   (그 밖의 시간에는 바뀔 것이 없다 — 괜히 부르지 않는다).
 * - 프록시(실시간)는 Worker 캐시 TTL 과 같은 30초, 정적 피드는 봇이 10분마다
 *   다시 뜨므로 2분이면 충분하다.
 */
export const LIVE_POLL_MS = 30_000;
export const FEED_POLL_MS = 120_000;

/** 킥오프 10분 전부터, 킥오프 후 3시간(연장·승부차기 포함)까지를 "경기 시간대" 로 본다 */
const BEFORE_MS = 10 * 60_000;
const AFTER_MS = 3 * 60 * 60_000;

export function inMatchWindow(matches: Match[], now: number = Date.now()): boolean {
  return matches.some((m) => {
    if (m.status === 'live') return true;
    if (m.status !== 'scheduled' || m.timeTBD) return false;
    const t = Date.parse(m.kickoffUtc);
    return Number.isFinite(t) && now >= t - BEFORE_MS && now <= t + AFTER_MS;
  });
}

/** 다음 갱신까지 기다릴 시간(ms). 경기 시간대가 아니면 null — 주기 갱신을 하지 않는다. */
export function pollDelay(matches: Match[], hasProxy: boolean, now: number = Date.now()): number | null {
  if (!inMatchWindow(matches, now)) return null;
  return hasProxy ? LIVE_POLL_MS : FEED_POLL_MS;
}

/**
 * 새로 받은 일정에 이미 불러 둔 득점 기록을 이어 붙인다.
 * 득점 상세는 경기마다 따로 불러 오므로(onGoalsLoaded), 일정을 다시 받을 때마다
 * 비워 버리면 결과 목록의 득점자가 깜빡이며 다시 로딩된다.
 * 진행 중 경기는 득점이 늘어나므로 이어 붙이지 않는다(새 값을 쓴다).
 */
export function mergeMatches(prev: Match[], next: Match[]): Match[] {
  const old = new Map(prev.map((m) => [m.id, m]));
  return next.map((m) => {
    const o = old.get(m.id);
    if (!o || !o.goalsLoaded || m.goalsLoaded || m.status !== 'finished' || o.status !== 'finished') return m;
    return { ...m, goals: o.goals, goalsLoaded: true };
  });
}
