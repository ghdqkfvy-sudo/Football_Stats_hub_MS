import { describe, expect, it } from 'vitest';
import { buildTable, deriveLeaders, formMap, resultOf, tableRound, teamResults } from '../league';
import type { Match, StandingTable } from '../types';

const team = (id: string, name: string) => ({
  id, name, shortName: name, abbr: name.slice(0, 3).toUpperCase(), logo: '',
});

function m(id: string, h: string, a: string, hs?: number, as?: number, date = `2026-09-0${id}T12:00Z`): Match {
  return {
    id, kickoffUtc: date, competition: 'eng.1', competitionName: 'PL',
    status: hs === undefined ? 'scheduled' : 'finished',
    home: team(h, `Team${h}`), away: team(a, `Team${a}`),
    homeScore: hs, awayScore: as, goals: [], goalsLoaded: true,
  };
}

const espnTable = (rows: { id: string; played: number; points: number }[]): StandingTable => ({
  competition: 'eng.1', competitionName: 'PL', derived: false, updatedAt: '',
  rows: rows.map((r, i) => ({
    rank: i + 1, team: team(r.id, `Team${r.id}`), played: r.played,
    win: 0, draw: 0, loss: 0, gf: 0, ga: 0, gd: 0, points: r.points, form: [],
  })),
  zones: { 1: { color: '#0f0', text: 'Champions League' } },
});

describe('resultOf / teamResults', () => {
  it('홈·원정을 뒤집어 승패를 읽는다', () => {
    expect(resultOf(m('1', 'A', 'B', 2, 0), 'A')).toBe('W');
    expect(resultOf(m('1', 'A', 'B', 2, 0), 'B')).toBe('L');
    expect(resultOf(m('1', 'A', 'B', 1, 1), 'A')).toBe('D');
    // 아직 안 치른 경기는 null
    expect(resultOf(m('1', 'A', 'B'), 'A')).toBeNull();
  });

  it('홈/원정 기록을 따로 센다', () => {
    const r = teamResults([m('1', 'A', 'B', 2, 0), m('2', 'C', 'A', 3, 1)], 'A');
    expect(r.home.length).toBe(1);
    expect(r.away.length).toBe(1);
    expect(r.homeRecord).toEqual({ w: 1, d: 0, l: 0 });
    expect(r.awayRecord).toEqual({ w: 0, d: 0, l: 1 });
    expect(r.record).toEqual({ w: 1, d: 0, l: 1 });
  });
});

describe('buildTable', () => {
  it('우리 기록이 모든 팀에서 ESPN 을 따라잡았을 때만 대체한다', () => {
    /* ⚠️ 실제로 났던 사고: 경기 목록이 잘려 들어온 상태로 표를 다시 만들어
       경기 수가 들쭉날쭉한 순위표가 나왔다. 한 팀이라도 모자라면 쓰지 않는다. */
    const espn = espnTable([{ id: 'A', played: 1, points: 3 }, { id: 'B', played: 1, points: 0 }]);
    // A 만 2경기, B 는 1경기 → 대체하지 않는다
    const partial = buildTable(espn, [m('1', 'A', 'B', 1, 0), m('2', 'A', 'C', 1, 0)], 'eng.1', 'PL');
    expect(partial!.derived).toBe(false);

    // 두 팀 모두 2경기 → 대체한다
    const full = buildTable(
      espn,
      [m('1', 'A', 'B', 1, 0), m('2', 'B', 'A', 2, 0)],
      'eng.1', 'PL',
    );
    expect(full!.derived).toBe(true);
    expect(tableRound(full!)).toBe(2);
  });

  it('순위를 다시 계산해도 ESPN 이 준 진출권 구분은 그대로 들고 간다', () => {
    const espn = espnTable([{ id: 'A', played: 0, points: 0 }, { id: 'B', played: 0, points: 0 }]);
    const t = buildTable(espn, [m('1', 'A', 'B', 3, 0)], 'eng.1', 'PL');
    expect(t!.derived).toBe(true);
    expect(t!.zones?.[1]?.text).toBe('Champions League');
  });

  it('ESPN 표를 그대로 쓸 때도 폼은 경기 기록에서 채운다', () => {
    const espn = espnTable([{ id: 'A', played: 5, points: 9 }, { id: 'B', played: 5, points: 3 }]);
    const t = buildTable(espn, [m('1', 'A', 'B', 2, 0)], 'eng.1', 'PL');
    expect(t!.derived).toBe(false);
    expect(t!.rows.find((r) => r.team.id === 'A')!.form).toEqual(['W']);
  });

  it('시드에 없는 팀의 경기는 섞지 않는다', () => {
    const espn = espnTable([{ id: 'A', played: 0, points: 0 }, { id: 'B', played: 0, points: 0 }]);
    const t = buildTable(espn, [m('1', 'A', 'B', 1, 0), m('2', 'A', 'Z', 5, 0)], 'eng.1', 'PL');
    expect(t!.rows.map((r) => r.team.id).sort()).toEqual(['A', 'B']);
    expect(t!.rows.find((r) => r.team.id === 'A')!.played).toBe(1);
  });

  it('ESPN 표가 아예 없으면 경기 기록만으로 만든다 (컵 대회)', () => {
    const t = buildTable(undefined, [m('1', 'A', 'B', 1, 0)], 'eng.fa', 'FA Cup');
    expect(t!.derived).toBe(true);
    expect(t!.rows.length).toBe(2);
    expect(t!.rows[0].team.id).toBe('A');
    // 경기가 없으면 표를 만들지 않는다
    expect(buildTable(undefined, [], 'eng.fa', 'FA Cup')).toBeNull();
  });

  it('승점 → 득실 → 다득점 순으로 세운다', () => {
    const t = buildTable(undefined, [
      m('1', 'A', 'B', 3, 0),   // A +3
      m('2', 'C', 'D', 1, 0),   // C +1
      m('3', 'D', 'C', 0, 5),   // C +5 → C 는 2승, 득실 +6
    ], 'x', 'X');
    expect(t!.rows[0].team.id).toBe('C');
    expect(t!.rows[0].points).toBe(6);
  });
});

describe('formMap', () => {
  it('최근 5경기만, 시간순으로 남긴다', () => {
    const ms = Array.from({ length: 7 }, (_, i) =>
      m(String(i + 1), 'A', 'B', i % 2 === 0 ? 1 : 0, i % 2 === 0 ? 0 : 1, `2026-09-0${i + 1}T12:00Z`));
    const f = formMap(ms);
    expect(f.get('A')!.length).toBe(5);
    // 7경기 중 짝수 회차가 승 → W L W L W L W, 마지막 5경기만 남는다
    expect(f.get('A')).toEqual(['W', 'L', 'W', 'L', 'W']);
    expect(f.get('B')).toEqual(['L', 'W', 'L', 'W', 'L']);
  });
});

describe('deriveLeaders', () => {
  it('경기별 선수 기록이 있으면 그걸 쓴다 (도움이 있는 유일한 경로)', () => {
    const match: Match = {
      ...m('1', 'A', 'B', 2, 1),
      playerStats: [
        { teamId: 'A', name: 'Scorer', g: 2, a: 0 },
        { teamId: 'A', name: 'Helper', g: 0, a: 1 },
      ],
    };
    const rows = deriveLeaders([match]);
    expect(rows[0]).toMatchObject({ name: 'Scorer', goals: 2, assists: 0, points: 2 });
    expect(rows.find((r) => r.name === 'Helper')).toMatchObject({ assists: 1, points: 1 });
  });

  it('선수 기록이 없으면 득점 이벤트로 떨어지고, 자책골은 빼고 센다', () => {
    const match: Match = {
      ...m('1', 'A', 'B', 2, 0),
      goals: [
        { minute: 10, clock: "10'", teamId: 'A', scorer: 'Striker', assist: 'Helper', ownGoal: false, penalty: false },
        { minute: 20, clock: "20'", teamId: 'A', scorer: 'Unlucky', ownGoal: true, penalty: false },
      ],
    };
    const rows = deriveLeaders([match]);
    expect(rows.find((r) => r.name === 'Striker')!.goals).toBe(1);
    expect(rows.find((r) => r.name === 'Helper')!.assists).toBe(1);
    expect(rows.find((r) => r.name === 'Unlucky')).toBeUndefined();
  });
});
