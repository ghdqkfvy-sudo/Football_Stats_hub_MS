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

/**
 * 끝난 경기만, 오래된 순. 승부차기로 갈린 경기는 승패를 ESPN 의 승자 표시로 읽는다.
 * 클럽 친선경기는 뺀다 — 시즌 성적이 아니다(2026-11-28, 선수 기록 lib/squad.ts 와 같은 규칙).
 * 국가대표 친선전(fifa.friendly)은 실제 A매치라 그대로 둔다.
 */
export function seasonBars(matches: Match[], teamId: string): SeasonBar[] {
  return matches
    .filter((m) => m.status === 'finished' && m.homeScore !== undefined && m.awayScore !== undefined
      && m.competition !== 'club.friendly'
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

/**
 * 지금 이어지고 있는 흐름 — 가장 최근 경기부터 거꾸로 센다(2026-11-28).
 *  · 2연승 이상 → win · 2연패 이상 → loss
 *  · 그게 아니면 3경기 이상 지지 않았을 때 unbeaten(무패), 3경기 이상 못 이겼을 때 winless(무승)
 *  · 그 밖에는 null — 1연승 · 1연패는 흐름이라 부르기 어렵다
 * n 은 그 흐름에 든 경기 수 — 막대 그래프에서 맨 오른쪽 n 개가 그 구간이다.
 */
export type StreakKind = 'win' | 'loss' | 'unbeaten' | 'winless';
export interface Streak { kind: StreakKind; n: number }

export function currentStreak(bars: Pick<SeasonBar, 'result'>[]): Streak | null {
  const run = (ok: (r: SeasonBar['result']) => boolean) => {
    let n = 0;
    for (let i = bars.length - 1; i >= 0 && ok(bars[i].result); i--) n++;
    return n;
  };
  const w = run((r) => r === 'W');
  if (w >= 2) return { kind: 'win', n: w };
  const l = run((r) => r === 'L');
  if (l >= 2) return { kind: 'loss', n: l };
  const unbeaten = run((r) => r !== 'L');
  if (unbeaten >= 3) return { kind: 'unbeaten', n: unbeaten };
  const winless = run((r) => r !== 'W');
  if (winless >= 3) return { kind: 'winless', n: winless };
  return null;
}

/** 화면 글자 — "10연승 중" · "3연패 중" · "5경기 무패" · "4경기 무승" */
export function streakLabel(s: Streak): string {
  return s.kind === 'win' ? `${s.n}연승 중` : s.kind === 'loss' ? `${s.n}연패 중` : s.kind === 'unbeaten' ? `${s.n}경기 무패` : `${s.n}경기 무승`;
}
