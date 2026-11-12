/**
 * 선수 상세 카드의 파생 값 — 경기 줄을 하나씩 읽지 않아도 "어떤 시즌인가" 가 보이게.
 * 전부 이미 가진 기록(PlayerSeason)에서 계산한다. 새로 받아 오는 데이터는 없다.
 */
import type { PlayerSeason, RecentGame } from './squad';

/** "0 : 3"(홈 : 원정) → 우리 팀 기준 "3:0". 원정 승리가 "W 0:3" 으로 읽히던 것을 바로잡는다 */
export function ourScore(g: Pick<RecentGame, 'scoreline' | 'homeAway'>): string {
  const m = /^\s*(\S+)\s*:\s*(\S+)\s*$/.exec(g.scoreline);
  if (!m) return g.scoreline;
  return g.homeAway === '홈' ? `${m[1]}:${m[2]}` : `${m[2]}:${m[1]}`;
}

/** 90분당 값 — 표본이 너무 작으면(90분 미만) 뻥튀기되므로 null */
export function per90(value: number, minutes: number): number | null {
  if (!(minutes >= 90)) return null;
  return Math.round((value / minutes) * 90 * 100) / 100;
}

/** 선발 비율(%) — 출전이 없으면 null */
export const startShare = (p: Pick<PlayerSeason, 'apps' | 'starts'>): number | null =>
  (p.apps > 0 ? Math.round((p.starts / p.apps) * 100) : null);

/** 경기 평점 평균 — 평점이 있는 경기만 */
function meanRating(games: RecentGame[]): number | null {
  const r = games.map((g) => g.rating).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return r.length ? r.reduce((a, v) => a + v, 0) / r.length : null;
}

/** 폼 차트의 기준선 — FotMob 시즌 평균이 있으면 그 값, 없으면 경기 평점의 평균 */
export function seasonAvg(p: Pick<PlayerSeason, 'rating' | 'recent'>): number | null {
  return typeof p.rating === 'number' ? p.rating : meanRating(p.recent);
}

/**
 * 최근 5경기 평점이 시즌 평균보다 얼마나 높은가(낮은가).
 * recent 는 최신순. 평점 있는 경기가 6경기는 돼야 "최근" 과 "시즌" 이 다른 말이 된다.
 */
export function recentDelta(p: Pick<PlayerSeason, 'rating' | 'recent'>): { recent: number; delta: number } | null {
  const rated = p.recent.filter((g) => typeof g.rating === 'number');
  if (rated.length < 6) return null;
  const recent = meanRating(rated.slice(0, 5));
  const base = seasonAvg(p);
  if (recent == null || base == null) return null;
  return { recent: Math.round(recent * 100) / 100, delta: Math.round((recent - base) * 10) / 10 };
}

export interface TeamRank { key: 'goals' | 'assists' | 'points' | 'minutes' | 'rating'; label: string; rank: number }

const RANKED: { key: TeamRank['key']; label: string }[] = [
  { key: 'goals', label: '득점' },
  { key: 'assists', label: '도움' },
  { key: 'points', label: '공격P' },
  { key: 'rating', label: '평점' },
  { key: 'minutes', label: '출전 시간' },
];

/**
 * 팀 안에서 몇 위인가 — 3위 안에 드는 항목만(전부 적으면 다시 나열이 된다).
 * 같은 값은 같은 순위. 값이 0 이면 순위를 매기지 않는다.
 * 평점은 5경기 이상 뛴 선수끼리만 견준다(한 경기 9.0 이 팀 1위가 되지 않게).
 */
export function teamRanks(p: PlayerSeason, players: PlayerSeason[], top = 3): TeamRank[] {
  const out: TeamRank[] = [];
  for (const { key, label } of RANKED) {
    const pool = key === 'rating' ? players.filter((x) => x.apps >= 5) : players;
    if (key === 'rating' && p.apps < 5) continue;
    const mine = p[key];
    if (typeof mine !== 'number' || !(mine > 0)) continue;
    const rank = 1 + pool.filter((x) => (x[key] ?? 0) > mine).length;
    if (rank <= top) out.push({ key, label, rank });
  }
  return out;
}

/** 최신순 경기 목록을 달(月)로 묶는다 — KST 기준 "11월" */
export function byMonth(games: RecentGame[]): { month: number; games: RecentGame[] }[] {
  const out: { month: number; games: RecentGame[] }[] = [];
  for (const g of games) {
    const t = Date.parse(g.kickoffUtc);
    const month = Number.isFinite(t) ? new Date(t + 9 * 3600_000).getUTCMonth() + 1 : 0;
    const last = out[out.length - 1];
    if (last && last.month === month) last.games.push(g);
    else out.push({ month, games: [g] });
  }
  return out;
}
