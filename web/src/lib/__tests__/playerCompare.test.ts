import { describe, expect, it } from 'vitest';
import { compareByComp, compareRows, per90, rivalsOf } from '../playerCompare';
import type { PlayerSeason } from '../squad';

const P = (id: string, pos: PlayerSeason['pos'], posAny: Record<string, number>, extra: Partial<PlayerSeason> = {}) =>
  ({ id, name: id, pos, posAny, posPlaces: posAny, apps: 5, starts: 3, minutes: 300, goals: 1, assists: 1, points: 2, yellow: 0, red: 0, ...extra }) as PlayerSeason;

describe('선수 비교', () => {
  it('같은 자리 경쟁자 — 겹치는 선발이 많은 순, 같은 포지션만', () => {
    const chavarria = P('chav', 'M', { LM: 3, LB: 1 }, { apps: 8 });
    const hato = P('hato', 'M', { LM: 3, LB: 1 });
    const neto = P('neto', 'M', { RM: 5 }, { apps: 9 });
    const cucu = P('cucu', 'D', { LM: 4 });
    expect(rivalsOf(chavarria, [chavarria, hato, neto, cucu]).map((p) => p.id)).toEqual(['hato', 'neto']);
  });

  it('90분당 — 90분 미만은 비교하지 않는다', () => {
    expect(per90(2, 180)).toBe(1);
    expect(per90(1, 45)).toBeNull();
  });

  it('대회별 — 한쪽만 뛴 대회도 0 으로, 출전 시간은 그 대회 경기만', () => {
    const g = (comp: string, minutes: number) => ({ competition: comp, minutes }) as never;
    const a = P('a', 'M', {}, {
      byComp: [{ competition: 'eng.1', apps: 6, starts: 4, goals: 1, assists: 0 }, { competition: 'uefa.champions', apps: 2, starts: 1, goals: 0, assists: 1 }],
      recent: [g('eng.1', 90), g('eng.1', 60), g('uefa.champions', 30)],
    });
    const b = P('b', 'M', {}, { byComp: [{ competition: 'eng.1', apps: 3, starts: 3, goals: 0, assists: 2 }], recent: [g('eng.1', 270)] });
    const got = compareByComp(a, b);
    expect(got.map((x) => x.competition)).toEqual(['eng.1', 'uefa.champions']);
    expect(got[0].rows.find((r) => r.key === 'minutes')).toMatchObject({ a: 150, b: 270, win: 'b' });
    expect(got[1].rows.find((r) => r.key === 'apps')).toMatchObject({ a: 2, b: 0, win: 'a' });
  });

  it('카드는 적은 쪽이 낫다 · 같으면 승자 없음', () => {
    const a = P('a', 'M', {}, { yellow: 1, goals: 2 });
    const b = P('b', 'M', {}, { yellow: 3, goals: 2 });
    const r = compareRows(a, b);
    expect(r.rate.find((x) => x.key === 'yellow')?.win).toBe('a');
    expect(r.season.find((x) => x.key === 'goals')?.win).toBeNull();
  });
});
