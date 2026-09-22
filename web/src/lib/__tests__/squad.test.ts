import { describe, expect, it } from 'vitest';
import { bestEleven, buildSquad, roleOf, slotRows, teamCohesion } from '../squad';
import type { Match } from '../types';
import type { AthleteInfo, Lineup, LineupEntry } from '../../types/feedTypes';

/* ── 도우미: 최소한의 Match/Lineup 을 만든다 ────────────── */

const team = (id: string, name = `T${id}`) => ({
  id, name, shortName: name, abbr: name.slice(0, 3).toUpperCase(), logo: '',
});

function match(id: string, opts: Partial<Match> = {}): Match {
  return {
    id,
    kickoffUtc: `2026-09-${id.padStart(2, '0')}T12:00Z`,
    competition: 'eng.1',
    competitionName: 'Premier League',
    status: 'finished',
    home: team('363', 'Chelsea'),
    away: team('999', 'Other'),
    homeScore: 2,
    awayScore: 0,
    goals: [],
    goalsLoaded: true,
    ...opts,
  };
}

const lineup = (entries: LineupEntry[], formation = '4-2-3-1'): Lineup =>
  ({ teamId: '363', formation, entries, hasStats: true, hasMinutes: true });

const info = (name: string, pos: AthleteInfo['pos'] = 'M'): AthleteInfo =>
  ({ name, jersey: 1, pos });

describe('roleOf — 포지션 약어 해석', () => {
  it('중앙 미드필더·공격형MF·센터포워드를 수비수로 분류하지 않는다', () => {
    // ⚠️ 예전에 "약어가 C 로 시작하면 수비수" 규칙을 써서 벨링엄이 DF 가 됐다
    expect(roleOf('CM')?.pos).toBe('M');
    expect(roleOf('CAM')?.pos).toBe('M');
    expect(roleOf('CF')?.pos).toBe('F');
    expect(roleOf('CD')?.pos).toBe('D');
    expect(roleOf('CB')?.pos).toBe('D');
  });

  it('좌우 표시를 접미/접두 양쪽에서 읽는다', () => {
    // 접미사(-L)는 같은 줄의 안쪽, 접두사(L)는 줄의 바깥쪽이다
    expect(roleOf('CD-L')).toEqual({ depth: 1, lateral: -1, pos: 'D' });
    expect(roleOf('CD-R')).toEqual({ depth: 1, lateral: 1, pos: 'D' });
    expect(roleOf('LB')).toEqual({ depth: 1, lateral: -2, pos: 'D' });
    expect(roleOf('RM')).toEqual({ depth: 3, lateral: 2, pos: 'M' });
    expect(roleOf('G')).toEqual({ depth: 0, lateral: 0, pos: 'G' });
  });

  it('모르는 약어는 null 이다 — 지어내지 않는다', () => {
    expect(roleOf('ZZZ')).toBeNull();
    expect(roleOf('')).toBeNull();
  });
});

describe('slotRows — 줄 나누기', () => {
  it('3-4-2-1 을 3-4-3 으로 바꾸지 않는다', () => {
    /* ⚠️ 실제로 났던 버그. ESPN 이 2선 두 명을 CF-L/CF-R(센터포워드)로 주므로
       깊이로만 묶으면 최전방 F 와 한 줄이 되어 3-4-3 처럼 보였다.
       줄 크기는 포메이션 문자열이 정해야 한다. */
    const rows = slotRows([
      { abbr: 'G', n: 1 },
      { abbr: 'CD-L', n: 1 }, { abbr: 'CD', n: 1 }, { abbr: 'CD-R', n: 1 },
      { abbr: 'LM', n: 1 }, { abbr: 'CM', n: 2 }, { abbr: 'RM', n: 1 },
      { abbr: 'CF-L', n: 1 }, { abbr: 'CF-R', n: 1 },
      { abbr: 'F', n: 1 },
    ], '3-4-2-1');
    expect(rows).not.toBeNull();
    expect(rows!.map((r) => r.length)).toEqual([1, 3, 4, 2, 1]);
    expect(rows![0]).toEqual(['G']);
    expect(rows![4]).toEqual(['F']);           // 최전방은 F 혼자
    expect(rows![3].sort()).toEqual(['CF-L', 'CF-R']);
  });

  it('줄 안에서는 왼쪽부터 오른쪽으로 세운다', () => {
    const rows = slotRows([
      { abbr: 'G', n: 1 },
      { abbr: 'LB', n: 1 }, { abbr: 'CD-L', n: 1 }, { abbr: 'CD-R', n: 1 }, { abbr: 'RB', n: 1 },
      { abbr: 'CM', n: 2 },
      { abbr: 'AM-L', n: 1 }, { abbr: 'AM', n: 1 }, { abbr: 'AM-R', n: 1 },
      { abbr: 'F', n: 1 },
    ], '4-2-3-1');
    expect(rows!.map((r) => r.length)).toEqual([1, 4, 2, 3, 1]);
    expect(rows![1]).toEqual(['LB', 'CD-L', 'CD-R', 'RB']);
    expect(rows![3]).toEqual(['AM-L', 'AM', 'AM-R']);
  });

  it('자리가 없으면 null — 빈 배치를 그리지 않는다', () => {
    expect(slotRows([], '4-4-2')).toBeNull();
  });
});

describe('buildSquad — 출전 시간', () => {
  it('벤치에만 앉은 경기를 90분으로 세지 않는다', () => {
    /* ⚠️ 오래된 버그: JSON 에서 undefined 는 null 로 내려가는데 예전 코드가
       `inMin !== undefined` 로만 걸러 null 을 통과시켰다. 그래서
       `90 - null = 90` 이 되어 안 뛴 선수까지 "교체 90분" 이 됐다. */
    const entries: LineupEntry[] = [
      ['1', 1, true, null, null, 0, 0, 'G'],      // 선발 풀타임
      ['2', 0, false, null, null, 0, 0, 'CM'],    // 명단만 (투입 기록 없음)
      ['3', 0, false, 70, null, 1, 0, 'F'],       // 70분 투입
    ];
    const { players } = buildSquad(
      [match('1')],
      { 1: lineup(entries) },
      { 1: info('GK', 'G'), 2: info('Bench'), 3: info('Sub', 'F') },
      '363',
    );
    const by = Object.fromEntries(players.map((p) => [p.name, p]));
    expect(by.GK.minutes).toBe(90);
    expect(by.Sub.minutes).toBe(20);
    // 안 뛴 선수는 기록이 올라가지 않는다 (목록에서 사라지지도 않는다 — apps 0)
    expect(by.Bench?.apps ?? 0).toBe(0);
  });

  it('클럽 친선경기는 집계에서 뺀다 (국가대표 친선전은 넣는다)', () => {
    const entries: LineupEntry[] = [['1', 1, true, null, null, 1, 0, 'F']];
    const mk = (id: string, competition: string) =>
      [match(id, { competition }), lineup(entries)] as const;
    const [friendly, fl] = mk('1', 'club.friendly');
    const [nat, nl] = mk('2', 'fifa.friendly');

    const onlyFriendly = buildSquad([friendly], { 1: fl }, { 1: info('P', 'F') }, '363');
    expect(onlyFriendly.players.length).toBe(0);
    expect(onlyFriendly.covered).toBe(0);

    const withNat = buildSquad([nat], { 2: nl }, { 1: info('P', 'F') }, '363');
    expect(withNat.players[0].apps).toBe(1);
    expect(withNat.players[0].goals).toBe(1);
  });

  it('포메이션은 가장 많이 쓴 것으로 정하고, 빈 문자열은 후보에서 뺀다', () => {
    const e: LineupEntry[] = [['1', 1, true, null, null, 0, 0, 'G']];
    const { formation, formationTally } = buildSquad(
      [match('1'), match('2'), match('3')],
      {
        1: lineup(e, ''),            // 포메이션 정보 없음 — 1등이 되면 안 된다
        2: lineup(e, ''),
        3: lineup(e, '3-4-2-1'),
      },
      { 1: info('GK', 'G') },
      '363',
    );
    expect(formation).toBe('3-4-2-1');
    expect(formationTally.every((t) => t.shape.trim() !== '')).toBe(true);
  });
});

describe('bestEleven — 실제로 선 자리로 채운다', () => {
  it('그 자리 선발이 많은 선수를 먼저 앉힌다', () => {
    /* ⚠️ 예전에는 "깊이가 비슷하고 점수 높은 선수" 를 줄마다 잘라 넣어서,
       그 자리에 한 번도 선 적 없는 선수가 베스트 11 에 올라왔다. */
    const shape = '4-2-3-1';
    const slotShape = [
      { abbr: 'G', n: 1 },
      { abbr: 'LB', n: 1 }, { abbr: 'CD-L', n: 1 }, { abbr: 'CD-R', n: 1 }, { abbr: 'RB', n: 1 },
      { abbr: 'CM', n: 2 },
      { abbr: 'AM-L', n: 1 }, { abbr: 'AM', n: 1 }, { abbr: 'AM-R', n: 1 },
      { abbr: 'F', n: 1 },
    ];
    const mk = (id: string, modalPos: string, posPlaces: Record<string, number>, score: number) => ({
      id, name: `P${id}`, jersey: Number(id), pos: 'M' as const,
      apps: 5, starts: 5, minutes: 450, goals: 0, assists: 0, points: 0,
      yellow: 0, red: 0, slots: {}, modalSlot: 0, posPlaces, posAny: posPlaces,
      modalPos, byComp: [], recent: [], realMinutes: true, score,
    });
    // 점수는 낮지만 그 자리 단골인 선수가 이겨야 한다
    const regular = mk('10', 'F', { F: 6 }, 10);
    const starRoamer = mk('11', 'AM', { AM: 1 }, 999);
    const players = [starRoamer, regular, ...slotShape.flatMap((s) =>
      Array.from({ length: s.n }, (_, k) => mk(`${s.abbr}${k}`, s.abbr, { [s.abbr]: 3 }, 5)))];

    const { slots, formation } = bestEleven(players, shape, slotShape);
    expect(formation).toBe('4-2-3-1');
    const forward = slots.find((s) => s.label === 'F');
    expect(forward?.player?.id).toBe('10');
  });

  it('좌우 정보가 하나도 없으면 verified 가 false 다', () => {
    const coarse = [{ abbr: 'G', n: 1 }, { abbr: 'D', n: 4 }, { abbr: 'M', n: 4 }, { abbr: 'F', n: 2 }];
    const players = coarse.flatMap((s) => Array.from({ length: s.n }, (_, k) => ({
      id: `${s.abbr}${k}`, name: `${s.abbr}${k}`, jersey: 1, pos: 'M' as const,
      apps: 3, starts: 3, minutes: 270, goals: 0, assists: 0, points: 0,
      yellow: 0, red: 0, slots: {}, modalSlot: 0,
      posPlaces: { [s.abbr]: 3 }, posAny: { [s.abbr]: 3 }, modalPos: s.abbr,
      byComp: [], recent: [], realMinutes: true, score: 1,
    })));
    expect(bestEleven(players, '4-4-2', coarse).verified).toBe(false);
  });

  it('골키퍼가 G, 원톱이 F 인 것만으로 경고를 띄우지 않는다', () => {
    /* ⚠️ 예전에는 "모든 약어가 상세할 것" 을 요구해서 정상적인 4-2-3-1 에도
       매번 "라인업 기록 부족" 이 붙었다 — GK 는 어느 팀이든 그냥 G 다. */
    const slotShape = [
      { abbr: 'G', n: 1 },
      { abbr: 'LB', n: 1 }, { abbr: 'CD-L', n: 1 }, { abbr: 'CD-R', n: 1 }, { abbr: 'RB', n: 1 },
      { abbr: 'CM', n: 2 },
      { abbr: 'AM-L', n: 1 }, { abbr: 'AM', n: 1 }, { abbr: 'AM-R', n: 1 },
      { abbr: 'F', n: 1 },
    ];
    const players = slotShape.flatMap((s) => Array.from({ length: s.n }, (_, k) => ({
      id: `${s.abbr}${k}`, name: `${s.abbr}${k}`, jersey: 1, pos: 'M' as const,
      apps: 3, starts: 3, minutes: 270, goals: 0, assists: 0, points: 0,
      yellow: 0, red: 0, slots: {}, modalSlot: 0,
      posPlaces: { [s.abbr]: 3 }, posAny: { [s.abbr]: 3 }, modalPos: s.abbr,
      byComp: [], recent: [], realMinutes: true, score: 1,
    })));
    expect(bestEleven(players, '4-2-3-1', slotShape).verified).toBe(true);
  });
});

describe('teamCohesion', () => {
  it('같은 11명이 매 경기 선발이면 100 이다', () => {
    const slots = Array.from({ length: 11 }, (_, i) => ({
      row: 0, col: i, rowCount: 11, label: 'X',
      player: {
        id: String(i), name: String(i), jersey: 1, pos: 'M' as const,
        apps: 6, starts: 6, minutes: 540, goals: 0, assists: 0, points: 0,
        yellow: 0, red: 0, slots: {}, modalSlot: 0, posPlaces: {}, posAny: {},
        modalPos: 'CM', byComp: [], recent: [], realMinutes: true, score: 1,
      },
    }));
    expect(teamCohesion(slots, 6)).toBe(100);
    expect(teamCohesion(slots, 12)).toBe(50);
    expect(teamCohesion([], 6)).toBe(0);
    expect(teamCohesion(slots, 0)).toBe(0);
  });
});
