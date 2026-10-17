import type { PlayerSeason } from './squad';

/**
 * 팀 내 선수 비교(2026-10-17) — 비교 창의 줄과 "같은 자리 경쟁자" 추천.
 */

/**
 * 같은 자리 경쟁자 — 1번 선수와 **같은 자리에 선발로 선 횟수가 겹치는** 선수부터.
 * 겹침 = 자리마다 min(둘의 선발 수)의 합(하토·차바리아는 LM 3·3 → 3).
 * 겹치는 사람이 없으면 같은 포지션(G/D/M/F) 중 출전 많은 순. 최대 n명.
 */
export function rivalsOf(a: PlayerSeason, players: PlayerSeason[], n = 4): PlayerSeason[] {
  const others = players.filter((p) => p.id !== a.id && p.pos === a.pos);
  const overlap = (p: PlayerSeason) =>
    Object.entries(a.posAny ?? {}).reduce((s, [k, v]) => s + Math.min(v, p.posAny?.[k] ?? 0), 0);
  const scored = others.map((p) => ({ p, o: overlap(p) }));
  const shared = scored.filter((x) => x.o > 0).sort((x, y) => y.o - x.o || y.p.apps - x.p.apps);
  const rest = scored.filter((x) => x.o === 0).sort((x, y) => y.p.apps - x.p.apps);
  return [...shared, ...rest].slice(0, n).map((x) => x.p);
}

/** 90분당 — 90분 미만이면 의미가 없어 null */
export const per90 = (v: number, minutes: number): number | null =>
  minutes >= 90 ? Math.round((v * 90 / minutes) * 100) / 100 : null;

export interface CompareRow {
  key: string;
  label: string;
  a: number | null;
  b: number | null;
  /** 표시 문자열 */
  fa: string;
  fb: string;
  /** 큰 쪽이 좋은가(카드는 작을수록 좋다) */
  higherBetter: boolean;
  /** 더 나은 쪽 — 'a' · 'b' · 같음/비교 불가면 null */
  win: 'a' | 'b' | null;
  /** 값 아래 작은 글씨 — 대회별 출전의 "4선발" */
  subA?: string;
  subB?: string;
}

const fmt = (v: number | null, digits = 0, unit = '') =>
  v === null ? '–' : `${digits ? v.toFixed(digits) : v}${unit}`;

function row(key: string, label: string, a: number | null, b: number | null, opt: { higherBetter?: boolean; digits?: number; unit?: string } = {}): CompareRow {
  const hb = opt.higherBetter ?? true;
  const win = a === null || b === null || a === b ? null : (a > b) === hb ? 'a' : 'b';
  return { key, label, a, b, fa: fmt(a, opt.digits, opt.unit), fb: fmt(b, opt.digits, opt.unit), higherBetter: hb, win };
}

/** 시즌 기록 · 90분당 · 선발률 · 카드 */
export function compareRows(a: PlayerSeason, b: PlayerSeason): { season: CompareRow[]; rate: CompareRow[] } {
  const startRate = (p: PlayerSeason) => (p.apps ? Math.round((p.starts / p.apps) * 100) : null);
  return {
    season: [
      row('apps', '출전', a.apps, b.apps),
      row('starts', '선발', a.starts, b.starts),
      row('minutes', '출전 시간', a.minutes, b.minutes, { unit: '분' }),
      row('goals', '골', a.goals, b.goals),
      row('assists', '도움', a.assists, b.assists),
      row('points', '공격 포인트', a.points, b.points),
    ],
    rate: [
      row('g90', '90분당 골', per90(a.goals, a.minutes), per90(b.goals, b.minutes), { digits: 2 }),
      row('a90', '90분당 도움', per90(a.assists, a.minutes), per90(b.assists, b.minutes), { digits: 2 }),
      row('p90', '90분당 공격 포인트', per90(a.points, a.minutes), per90(b.points, b.minutes), { digits: 2 }),
      row('srate', '선발률', startRate(a), startRate(b), { unit: '%' }),
      row('yellow', '경고', a.yellow, b.yellow, { higherBetter: false }),
      row('red', '퇴장', a.red, b.red, { higherBetter: false }),
    ],
  };
}

/** 출전 칸에 선발 수를 붙인다 — 경기 수 아래 "(4선발)" (좁은 칸에서 잘리지 않게 두 줄) */
const withStarts = (r: CompareRow, sa: number, sb: number): CompareRow => ({ ...r, subA: `(${sa}선발)`, subB: `(${sb}선발)` });

/**
 * 대회별 비교 — 대회마다 출전(선발) · 출전 시간 · 골 · 도움.
 * 출전 시간은 대회별 집계가 없어 경기별 기록(recent)에서 그 대회 경기만 더한다.
 * 대회 순서: 두 선수 출전 합이 많은 순(보통 리그 → 챔스 → 컵).
 */
export function compareByComp(a: PlayerSeason, b: PlayerSeason): { competition: string; rows: CompareRow[] }[] {
  const comps = [...new Set([...a.byComp, ...b.byComp].map((c) => c.competition))];
  const of = (p: PlayerSeason, k: string) => p.byComp.find((c) => c.competition === k);
  const mins = (p: PlayerSeason, k: string) => p.recent.filter((g) => g.competition === k).reduce((s, g) => s + g.minutes, 0);
  return comps
    .map((k) => {
      const x = of(a, k), y = of(b, k);
      return {
        competition: k,
        total: (x?.apps ?? 0) + (y?.apps ?? 0),
        rows: [
          /* 출전 "6 (4선발)" — 선발은 따로 줄을 두지 않고 경기 수 옆에 */
          withStarts(row('apps', '출전', x?.apps ?? 0, y?.apps ?? 0), x?.starts ?? 0, y?.starts ?? 0),
          row('minutes', '출전 시간', mins(a, k), mins(b, k), { unit: '분' }),
          row('goals', '골', x?.goals ?? 0, y?.goals ?? 0),
          row('assists', '도움', x?.assists ?? 0, y?.assists ?? 0),
        ],
      };
    })
    .sort((p, q) => q.total - p.total)
    .map(({ competition, rows }) => ({ competition, rows }));
}
