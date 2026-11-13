/**
 * 팀 시즌 결과 막대 — 일정 탭의 "시즌 흐름"(components/SeasonChart).
 * 캘린더와 월별 목록은 한 달씩만 보여 준다. 끝난 경기 전부를 한 줄에 세워
 * "어디서 연승했고 어디서 꺾였나" 가 보이게 한다. 새로 받는 데이터는 없다.
 */
import type { Match, TeamRef } from './types';

export interface SeasonBar {
  id: string;
  kickoffUtc: string;
  competition: string;
  opponent: TeamRef;
  home: boolean;
  gf: number;
  ga: number;
  /** 득실차 — 막대의 방향과 길이 */
  diff: number;
  result: 'W' | 'D' | 'L';
}

/** 끝난 경기만, 오래된 순. 승부차기로 갈린 경기는 승패를 ESPN 의 승자 표시로 읽는다 */
export function seasonBars(matches: Match[], teamId: string): SeasonBar[] {
  return matches
    .filter((m) => m.status === 'finished' && m.homeScore !== undefined && m.awayScore !== undefined
      && (m.home.id === teamId || m.away.id === teamId))
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc))
    .map((m) => {
      const home = m.home.id === teamId;
      const gf = (home ? m.homeScore : m.awayScore) as number;
      const ga = (home ? m.awayScore : m.homeScore) as number;
      const result = gf > ga ? 'W' : gf < ga ? 'L'
        : m.winnerId ? (m.winnerId === teamId ? 'W' : 'L') : 'D';
      return { id: m.id, kickoffUtc: m.kickoffUtc, competition: m.competition, opponent: home ? m.away : m.home, home, gf, ga, diff: gf - ga, result };
    });
}

/** 막대 길이(0~1) — 득실차 ±cap 에서 꽉 찬다. 무승부 · 승부차기는 바닥에 붙은 짧은 토막 */
export function barLength(diff: number, cap = 4): number {
  if (diff === 0) return 0;
  return Math.min(1, Math.abs(diff) / cap);
}

export interface SeasonTally { w: number; d: number; l: number; gf: number; ga: number }
export const tally = (bars: SeasonBar[]): SeasonTally => bars.reduce(
  (t, b) => ({ w: t.w + (b.result === 'W' ? 1 : 0), d: t.d + (b.result === 'D' ? 1 : 0), l: t.l + (b.result === 'L' ? 1 : 0), gf: t.gf + b.gf, ga: t.ga + b.ga }),
  { w: 0, d: 0, l: 0, gf: 0, ga: 0 },
);
