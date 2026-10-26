import type { Match } from './types';
import type { CupRoundData } from './api';

/**
 * 컵 대진표 계산 (2026-10-26) — Summary › 대회 순위의 CupBracket 이 쓴다. 화면 없는 순수 함수만.
 * 한 라운드의 경기를 **맞대결(tie)** 로 묶는다 — 단판이면 한 경기, 1·2차전이면 두 경기.
 */
export interface Tie {
  key: string;
  /** 첫 경기 기준 홈 · 원정 */
  a: Match['home'];
  b: Match['away'];
  legs: Match[];
  /** 합산 스코어 [a, b] — 끝난 경기만 */
  agg: [number, number];
  state: 'scheduled' | 'live' | 'done';
  /** 다음 라운드로 간 팀 id — 끝났고 가릴 수 있을 때만 */
  winnerId?: string;
  /** 승부차기 [a, b] — 마지막 경기 */
  pens?: [number, number];
}

const pairKey = (m: Match) => [m.home.id, m.away.id].sort().join('-');

export function tiesOf(matches: Match[]): Tie[] {
  const by = new Map<string, Match[]>();
  for (const m of [...matches].sort((x, y) => x.kickoffUtc.localeCompare(y.kickoffUtc))) {
    const k = pairKey(m);
    by.set(k, [...(by.get(k) ?? []), m]);
  }
  return [...by.entries()].map(([key, legs]) => {
    const first = legs[0];
    const a = first.home, b = first.away;
    let ga = 0, gb = 0;
    for (const l of legs) {
      if (l.status !== 'finished') continue;
      const aHome = l.home.id === a.id;
      ga += (aHome ? l.homeScore : l.awayScore) ?? 0;
      gb += (aHome ? l.awayScore : l.homeScore) ?? 0;
    }
    const done = legs.every((l) => l.status === 'finished');
    const state: Tie['state'] = done ? 'done' : legs.some((l) => l.status === 'live') ? 'live' : 'scheduled';
    const last = legs[legs.length - 1];
    const lastAHome = last.home.id === a.id;
    const pens: [number, number] | undefined = last.homePens != null && last.awayPens != null && (last.homePens || last.awayPens)
      ? (lastAHome ? [last.homePens, last.awayPens] : [last.awayPens, last.homePens]) : undefined;
    let winnerId: string | undefined;
    if (done) {
      if (ga !== gb) winnerId = ga > gb ? a.id : b.id;
      else if (pens && pens[0] !== pens[1]) winnerId = pens[0] > pens[1] ? a.id : b.id;
      else if (last.winnerId) winnerId = last.winnerId;
    }
    return { key, a, b, legs, agg: [ga, gb], state, winnerId, pens };
  });
}

const KO = /quarter|semi|^final$/i;
/** 8강 · 4강 · 결승 — 넓은 화면에서는 한 장의 대진표(트리)로 묶는다 */
export const isKnockoutTree = (label: string) => KO.test(label.trim());

/**
 * 처음 보여 줄 라운드 — 아직 안 끝난 맞대결이 있는 가장 이른 라운드(지금 진행 · 다음 라운드),
 * 없으면 경기가 있는 마지막 라운드.
 */
export function currentRound(rounds: CupRoundData[]): number {
  const withGames = rounds.map((r, i) => ({ r, i })).filter((x) => x.r.matches.length);
  const open = withGames.find((x) => tiesOf(x.r.matches).some((t) => t.state !== 'done'));
  return (open ?? withGames[withGames.length - 1])?.i ?? 0;
}

/**
 * 트리 순서 — 다음 라운드에서 만나는 두 맞대결이 위아래로 붙게.
 * 다음 라운드 대진이 아직 없으면 원래 순서(킥오프 순).
 */
export function treeOrder(cur: Tie[], next: Tie[]): Tie[] {
  if (!next.length) return cur;
  const out: Tie[] = [];
  const has = (t: Tie, id: string) => t.a.id === id || t.b.id === id;
  for (const n of next) for (const id of [n.a.id, n.b.id]) {
    const t = cur.find((x) => has(x, id) && !out.includes(x));
    if (t) out.push(t);
  }
  return [...out, ...cur.filter((t) => !out.includes(t))];
}
