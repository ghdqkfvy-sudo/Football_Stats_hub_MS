/**
 * 스쿼드 활용도 — 선수 스탯 탭의 가로 막대(components/UsageChart).
 * 표의 출전 · 선발 · 분은 숫자 열이라 "누가 주전이고 누가 로테이션인가" 를 읽어야 안다.
 * 출전 시간을 선발로 뛴 시간과 교체로 뛴 시간으로 갈라 한 막대에 그린다.
 */
import type { PlayerSeason } from './squad';

export interface UsageRow {
  p: PlayerSeason;
  /** 선발로 뛴 분 */
  start: number;
  /** 교체로 들어가 뛴 분 */
  sub: number;
  total: number;
}

export function usageOf(p: PlayerSeason): UsageRow {
  /* 경기별 기록이 있으면 거기서 가른다. 없으면(시즌 통계만 있는 선수) 전부 선발 시간으로 둔다 */
  if (p.recent.length) {
    const start = p.recent.filter((g) => g.started).reduce((a, g) => a + g.minutes, 0);
    const sub = p.recent.filter((g) => !g.started).reduce((a, g) => a + g.minutes, 0);
    return { p, start, sub, total: start + sub };
  }
  return { p, start: p.minutes, sub: 0, total: p.minutes };
}

const ORDER = ['F', 'M', 'D', 'G'] as const;
export const POS_KO: Record<string, string> = { F: '공격수', M: '미드필더', D: '수비수', G: '골키퍼' };

/** 포지션마다(공격 → 골키퍼) 출전 시간 많은 순. 한 번도 안 뛴 선수는 뺀다 */
export function usageGroups(players: PlayerSeason[]): { pos: string; rows: UsageRow[] }[] {
  return ORDER.map((pos) => ({
    pos,
    rows: players.filter((p) => p.pos === pos).map(usageOf).filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total || b.start - a.start),
  })).filter((g) => g.rows.length > 0);
}
