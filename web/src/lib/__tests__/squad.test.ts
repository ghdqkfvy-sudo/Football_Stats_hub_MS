import { describe, expect, it } from 'vitest';
import { bestEleven, buildSquad, isBenchRegular, lineKind, lineLabels, posLabel, roleOf, slotRows, stateAt, stateDelta, teamCohesion } from '../squad';
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

describe('bestEleven — 좌우 짝 자리는 한 묶음', () => {
  /* 첼시 3-4-2-1 (2026-10) 을 줄인 모양 */
  const shape3421 = [
    { abbr: 'G', n: 1 },
    { abbr: 'CD-L', n: 1 }, { abbr: 'CD', n: 1 }, { abbr: 'CD-R', n: 1 },
    { abbr: 'LM', n: 1 }, { abbr: 'CM-L', n: 1 }, { abbr: 'CM-R', n: 1 }, { abbr: 'RM', n: 1 },
    { abbr: 'CF-L', n: 1 }, { abbr: 'CF-R', n: 1 },
    { abbr: 'F', n: 1 },
  ];
  const pl = (id: string, posPlaces: Record<string, number>, apps = 5, score = 1) => ({
    id, name: id, jersey: 1, pos: 'M' as const,
    apps, starts: 5, minutes: apps * 80, goals: 0, assists: 0, points: 0,
    yellow: 0, red: 0, slots: {}, modalSlot: 0, posPlaces, posAny: posPlaces,
    modalPos: Object.keys(posPlaces)[0], byComp: [], recent: [], realMinutes: true, score,
  });
  const filler = shape3421
    .filter((s) => !s.abbr.startsWith('CM'))
    .map((s) => pl(`fill-${s.abbr}`, { [s.abbr]: 6 }));
  const cm = (slots: ReturnType<typeof bestEleven>['slots']) =>
    slots.filter((s) => s.label.startsWith('CM')).map((s) => `${s.label}:${s.player?.id}`);

  it('중앙 미드필더는 왼쪽·오른쪽을 한 묶음으로 센다', () => {
    /* ⚠️ 예전에는 CM-R 만 2경기 선 선수(헨더슨)가, 중원 4경기(CM-L 2 + CM-R 2)인
       선수(제임스)를 이겼다 — 자리를 약어 하나하나로 따로 셌기 때문이다. */
    const players = [
      ...filler,
      pl('lavia', { 'CM-L': 2, 'CM-R': 1 }),
      pl('james', { 'CM-L': 2, 'CM-R': 2 }),
      pl('henderson', { 'CM-R': 2 }, 2, 999),
    ];
    const { slots } = bestEleven(players, '3-4-2-1', shape3421);
    expect(cm(slots).sort()).toEqual(['CM-L:lavia', 'CM-R:james'].sort());
  });

  it('묶음 안에서는 더 많이 선 쪽에 앉힌다', () => {
    const players = [...filler, pl('a', { 'CM-R': 4 }), pl('b', { 'CM-L': 3 })];
    expect(cm(bestEleven(players, '3-4-2-1', shape3421).slots)).toEqual(['CM-L:b', 'CM-R:a']);
  });

  it('동점은 종합 점수가 아니라 총 출전 수로 가린다', () => {
    const players = [
      ...filler.filter((p) => p.id !== 'fill-LM'),
      ...['CM-L', 'CM-R'].map((a) => pl(`cm-${a}`, { [a]: 6 })),
      pl('many-apps', { LM: 3 }, 8, 1),
      pl('high-score', { LM: 3 }, 6, 999),
    ];
    const lm = bestEleven(players, '3-4-2-1', shape3421).slots.find((s) => s.label === 'LM');
    expect(lm?.player?.id).toBe('many-apps');
  });

  it('4-2-3-1 의 두 명 중원 줄(ESPN 은 LM·RM 으로 준다)도 한 묶음이다', () => {
    const shape = [
      { abbr: 'G', n: 1 },
      { abbr: 'LB', n: 1 }, { abbr: 'CD-L', n: 1 }, { abbr: 'CD-R', n: 1 }, { abbr: 'RB', n: 1 },
      { abbr: 'LM', n: 1 }, { abbr: 'RM', n: 1 },
      { abbr: 'AM-L', n: 1 }, { abbr: 'AM', n: 1 }, { abbr: 'AM-R', n: 1 },
      { abbr: 'F', n: 1 },
    ];
    const players = [
      ...shape.filter((s) => s.abbr !== 'LM' && s.abbr !== 'RM').map((s) => pl(`f-${s.abbr}`, { [s.abbr]: 9 })),
      pl('valverde', { RM: 9 }),
      pl('tchou', { LM: 2, RM: 3 }),   // 중원 5경기 — 한쪽만 보면 2·3
      pl('lm-only', { LM: 4 }),
    ];
    const pivot = bestEleven(players, '4-2-3-1', shape).slots
      .filter((s) => s.label === 'LM' || s.label === 'RM').map((s) => s.player?.id).sort();
    expect(pivot).toEqual(['tchou', 'valverde']);
  });
});

describe('posLabel — ESPN 약어를 화면 표기로 (포메이션에 따라)', () => {
  it('4-2-3-1 의 LM/RM 은 더블 볼란치(LDM/RDM), 2선은 LAM/RAM', () => {
    expect(posLabel('LM', '4-2-3-1')).toBe('LDM');
    expect(posLabel('AM-L', '4-2-3-1')).toBe('LAM');
    expect(posLabel('F', '4-2-3-1')).toBe('ST');
  });
  it('3-4-2-1 의 CF-L/CF-R 은 2선, 4-4-2 에서는 투톱', () => {
    expect(posLabel('CF-R', '3-4-2-1')).toBe('RAM');
    expect(posLabel('CF-L', '4-4-2')).toBe('LS');
    expect(posLabel('LM', '3-4-2-1')).toBe('LM');
  });
  it('SUB·빈 값은 자리가 아니다', () => {
    expect(posLabel('SUB')).toBeUndefined();
    expect(posLabel(undefined)).toBeUndefined();
  });
});

describe('경기별 기록 — 자리는 선발만, 교체는 "누구 대신" 만', () => {
  it('교체 출전에는 자리를 붙이지 않는다 (윙어가 풀백과 바뀌어도 RB 가 아니다)', () => {
    const lus = { '1': lineup([
      ['a', 2, true, null, 70, 0, 0, 'RB'],
      ['b', 0, false, 70, null, 0, 0, 'SUB', 0, 0, 'a'],
    ]) };
    const { players } = buildSquad([match('1')], lus, { a: info('Trent Alexander-Arnold', 'D'), b: info('Vinícius Júnior', 'F') }, '363');
    const b = players.find((p) => p.id === 'b')!;
    expect(b.recent[0].pos).toBeUndefined();
    expect(b.recent[0].forName).toBe('Trent Alexander-Arnold');
    expect(players.find((p) => p.id === 'a')!.recent[0].pos).toBe('RB');
    // 베스트 11 자리 집계에도 교체 출전은 들어가지 않는다
    expect(b.posAny).toEqual({});
  });
});

describe('교체 출전 — 투입·아웃 때의 경기 상황', () => {
  const goal = (minute: number, teamId: string) =>
    ({ minute, clock: `${minute}'`, teamId, scorer: 'x', ownGoal: false, penalty: false });

  it('stateAt: 같은 분의 골은 이미 난 것으로 본다', () => {
    const m = { goals: [goal(10, '363'), goal(64, '999')] };
    expect(stateAt(m, '363', 9)).toBe('D');
    expect(stateAt(m, '363', 30)).toBe('L');
    expect(stateAt(m, '363', 64)).toBe('D');
  });

  it('stateDelta: 열세→동점 은 좋아짐, 리드→동점 은 나빠짐', () => {
    expect(stateDelta('T', 'D')).toBe(1);
    expect(stateDelta('L', 'D')).toBe(-1);
    expect(stateDelta('L', 'L')).toBe(0);
  });

  it('교체 선수의 경기별 상황 변화와 요약이 실린다 (아웃되면 그 분까지)', () => {
    const lus = { '1': lineup([
      ['s', 9, true, null, 60, 0, 0, 'F'],
      ['b', 0, false, 60, 80, 0, 0, 'SUB', 0, 0, 's'],
    ]) };
    const m1 = match('1', { goals: [goal(30, '999'), goal(70, '363'), goal(85, '363')], goalsLoaded: true, homeScore: 2, awayScore: 1 });
    const { players, covered } = buildSquad([m1], lus, { s: info('S'), b: info('B') }, '363');
    const b = players.find((p) => p.id === 'b')!;
    expect(b.recent[0].stateIn).toBe('T');
    expect(b.recent[0].stateOut).toBe('D');      // 85분 골은 아웃(80분) 뒤라 빼고 본다
    expect(b.bench).toMatchObject({ subs: 1, team: covered, avgIn: 60, minutes: 20 });
    expect(b.bench!.changes[0]).toMatchObject({ from: 'T', to: 'D' });
  });

  it('isBenchRegular: 교체 3회 이상 · 교체 ≥ 선발 · 팀 경기의 20% 이상', () => {
    const bench = (subs: number, team: number) => ({ subs, team, avgIn: 70, minutes: 60, changes: [] });
    expect(isBenchRegular({ starts: 2, bench: bench(5, 10) })).toBe(true);
    expect(isBenchRegular({ starts: 6, bench: bench(4, 10) })).toBe(false);   // 주로 선발
    expect(isBenchRegular({ starts: 0, bench: bench(2, 10) })).toBe(false);   // 3회 미만
    expect(isBenchRegular({ starts: 0, bench: bench(3, 20) })).toBe(false);   // 15%
    expect(isBenchRegular({ starts: 0, bench: bench(4, 20) })).toBe(true);    // 20%
    expect(isBenchRegular({ starts: 0, bench: undefined })).toBe(false);
  });
});

describe('떠난 선수 — 지금 팀 로스터에 없으면 목록·베스트 11 에서 뺀다', () => {
  it('onRoster === false 는 players 에서 빠지고 departed 로만 온다 (판단 못 했으면 그대로)', () => {
    const lus = { '1': lineup([
      ['stay', 8, true, null, null, 1, 0, 'CM'],
      ['gone', 6, true, null, 65, 0, 1, 'CM'],
      ['unknown', 4, true, null, null, 0, 0, 'CD'],
    ]) };
    const ath = {
      stay: { ...info('Stay'), onRoster: true },
      gone: { ...info('Enzo Fernández'), onRoster: false },
      unknown: info('Unknown'),            // 대표팀·응답 실패 — 판단 없음
    };
    const { players, departed } = buildSquad([match('1')], lus, ath, '363');
    expect(players.map((p) => p.id).sort()).toEqual(['stay', 'unknown']);
    expect(departed.map((p) => p.id)).toEqual(['gone']);
    expect(departed[0].assists).toBe(1);   // 이 팀에서 올린 기록은 남는다
  });
});

describe('lineKind — 줄 성격', () => {
  const kinds = (shape: number[]) => [1, ...shape].map((n, i, a) => lineKind(i, a.length, n));
  it('필드 줄이 셋이면 가운데는 중원이다 (4-4-2 · 3-5-2 · 4-3-3)', () => {
    expect(kinds([4, 4, 2])).toEqual(['GK', 'DEF', 'MID', 'FW']);
    expect(kinds([3, 5, 2])).toEqual(['GK', 'DEF', 'MID', 'FW']);
    expect(lineLabels('MID', 4)).toEqual(['LM', 'LCM', 'RCM', 'RM']);
    expect(lineLabels(lineKind(2, 4, 3), 3)).toEqual(['LCM', 'CM', 'RCM']);
  });
  it('2선은 필드 줄이 넷 이상이고 셋 이하일 때만', () => {
    expect(kinds([4, 2, 3, 1])).toEqual(['GK', 'DEF', 'MID', 'AM', 'FW']);
    expect(kinds([3, 4, 2, 1])).toEqual(['GK', 'DEF', 'MID', 'AM', 'FW']);
    expect(kinds([4, 1, 4, 1])).toEqual(['GK', 'DEF', 'MID', 'MID', 'FW']);
  });
});

describe('buildSquad — 평점', () => {
  it('시즌 평균은 선수 정보에서, 경기 평점은 그 경기 라인업 ratings 에서', () => {
    const lu = { ...lineup([['1', 1, true, null, null, 0, 0, 'F'], ['2', 0, false, 70, null, 0, 0, 'F']]), ratings: { 1: 7.4 } };
    const { players } = buildSquad([match('1')], { 1: lu }, { 1: { ...info('A', 'F'), rating: 7.05 }, 2: info('B', 'F') }, '363');
    const by = Object.fromEntries(players.map((p) => [p.name, p]));
    expect(by.A.rating).toBe(7.05);
    expect(by.A.recent[0].rating).toBe(7.4);
    expect(by.B.rating).toBeUndefined();
    expect(by.B.recent[0].rating).toBeUndefined();
  });

});
