import { describe, expect, it } from 'vitest';
import { pointsPerGame, seasonRecord } from '../compare';
import type { Match } from '../types';

const team = (id: string) => ({ id, name: id, shortName: id, abbr: id, logo: '' });
const m = (id: string, at: string, home: string, away: string, hs: number, as: number, competition = 'eng.1'): Match => ({
  id, kickoffUtc: at, competition, competitionName: competition, status: 'finished',
  home: team(home), away: team(away), homeScore: hs, awayScore: as, goals: [], goalsLoaded: false,
});

describe('seasonRecord', () => {
  it('모든 대회를 합치고 친선전은 뺀다 · 폼은 오른쪽이 최근', () => {
    const r = seasonRecord([
      m('1', '2026-08-01T00:00Z', 'A', 'B', 2, 0),
      m('0', '2026-07-20T00:00Z', 'A', 'C', 5, 0, 'club.friendly'),
      m('2', '2026-08-10T00:00Z', 'C', 'A', 1, 1, 'uefa.champions'),
      m('3', '2026-08-20T00:00Z', 'A', 'D', 0, 3),
    ], 'A');
    expect(r).toMatchObject({ played: 3, win: 1, draw: 1, loss: 1, gf: 3, ga: 4 });
    expect(r.form).toEqual(['W', 'D', 'L']);
  });
});

describe('pointsPerGame', () => {
  it('소수 둘째 자리 · 0경기는 null', () => {
    expect(pointsPerGame(18, 8)).toBe(2.25);
    expect(pointsPerGame(10, 3)).toBe(3.33);
    expect(pointsPerGame(0, 0)).toBeNull();
  });
});

import { euroStage, leaguePhaseOutcome } from '../compare';

describe('euroStage', () => {
  const R = [
    { label: 'League Phase', start: '2026-08-27T07:00Z', end: '2027-02-15T07:59Z' },
    { label: 'Knockout Round Playoffs', start: '2027-02-15T08:00Z', end: '2027-03-08T07:59Z' },
    { label: 'Rd of 16', start: '2027-03-08T08:00Z', end: '2027-04-05T06:59Z' },
    { label: 'Quarterfinals', start: '2027-04-05T07:00Z', end: '2027-04-26T06:59Z' },
    { label: 'Final', start: '2027-06-01T07:00Z', end: '2027-07-01T06:59Z' },
  ];
  const ucl = (id: string, at: string, home: string, away: string, hs?: number, as?: number): Match => ({
    ...m(id, at, home, away, hs ?? 0, as ?? 0, 'uefa.champions'),
    ...(hs === undefined ? { status: 'scheduled' as const, homeScore: undefined, awayScore: undefined } : {}),
  });
  const at = (iso: string) => Date.parse(iso);

  it('참가하지 않으면 null', () => {
    expect(euroStage([], 'A', R, undefined)).toBeNull();
  });
  it('리그 페이즈 중이면 순위', () => {
    const s = euroStage([ucl('1', '2026-09-08T19:00Z', 'A', 'B', 2, 1)], 'A', R, 12, at('2026-10-13T00:00Z'));
    expect(s).toMatchObject({ kind: 'league', rank: 12, text: '12위' });
  });
  it('리그 페이즈가 끝나면 순위로 갈린 결과', () => {
    const s = euroStage([ucl('1', '2027-01-28T20:00Z', 'A', 'B', 1, 0)], 'A', R, 6, at('2027-02-20T00:00Z'));
    expect(s?.text).toBe('6위 · 16강 직행');
    expect(leaguePhaseOutcome(24)).toBe('플레이오프');
    expect(leaguePhaseOutcome(25)).toBe('탈락');
  });
  it('토너먼트 진행 중이면 몇 강', () => {
    const s = euroStage([
      ucl('1', '2027-03-10T20:00Z', 'A', 'B', 1, 1),
      ucl('2', '2027-03-17T20:00Z', 'B', 'A'),
    ], 'A', R, 5);
    expect(s).toMatchObject({ kind: 'ko', round: '16강', status: 'playing', text: '16강' });
  });
  it('2차전까지 끝나면 합계로 진출·탈락 (다음 대진 전에도)', () => {
    const through = euroStage([
      ucl('1', '2027-03-10T20:00Z', 'A', 'B', 1, 2),
      ucl('2', '2027-03-17T20:00Z', 'B', 'A', 0, 2),
    ], 'A', R, 5);
    expect(through?.text).toBe('8강 진출');
    const out = euroStage([
      ucl('1', '2027-03-10T20:00Z', 'A', 'B', 1, 2),
      ucl('2', '2027-03-17T20:00Z', 'B', 'A', 1, 0),
    ], 'A', R, 5);
    expect(out?.text).toBe('16강 탈락');
  });
  it('합계 동점은 승부차기로', () => {
    const g2 = { ...ucl('2', '2027-03-17T20:00Z', 'B', 'A', 1, 0), homePens: 3, awayPens: 4 };
    const s = euroStage([ucl('1', '2027-03-10T20:00Z', 'A', 'B', 1, 0), g2], 'A', R, 5);
    expect(s?.text).toBe('8강 진출');
  });
  it('결승 — 우승 / 준우승', () => {
    expect(euroStage([ucl('1', '2027-06-05T19:00Z', 'A', 'B', 2, 0)], 'A', R, 1)?.text).toBe('우승');
    expect(euroStage([ucl('1', '2027-06-05T19:00Z', 'A', 'B', 0, 2)], 'A', R, 1)?.text).toBe('준우승');
  });
});
