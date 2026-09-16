/**
 * 스쿼드 집계와 베스트 11 자동 선정.
 *
 * 원칙: "실제로 뛴 기록"만 근거로 삼는다. 출전·선발·출전시간은 라인업에서,
 * 득점·도움은 경기 득점 이벤트에서 가져오고, 자리는 그 선수가 실제로
 * 가장 많이 선 formationPlace 로 정한다. 포메이션도 그 팀이 실제로 가장
 * 많이 쓴 것을 쓴다.
 */
import type { Match } from './types';
import type { AthleteInfo, Lineup } from '../types/feedTypes';

export interface CompSplit {
  competition: string;
  apps: number;
  /** 그 대회 선발 출전 수 */
  starts: number;
  goals: number;
  assists: number;
}

export interface PlayerSeason {
  id: string;
  name: string;
  jersey: number;
  pos: 'G' | 'D' | 'M' | 'F';
  /** 팀 로스터가 알려 준 실제 헤드샷 주소 — 없으면 배지로 그린다 */
  photo?: string;
  apps: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  points: number;
  /** formationPlace → 선발 횟수 */
  slots: Record<number, number>;
  modalSlot: number;
  /** ESPN 포지션 약어 → 선발 횟수 (최다 채택 포메이션 경기만) */
  posPlaces: Record<string, number>;
  /** 같은 집계지만 포메이션을 가리지 않은 것 — posPlaces 가 빌 때의 폴백 */
  posAny: Record<string, number>;
  /** 가장 많이 선 자리의 ESPN 약어 — 베스트 11 배치의 근거 */
  modalPos: string;
  /** 대회별 기록 — 호버 카드에서 "리그 3골 · 챔스 1골" 로 보여준다 */
  byComp: CompSplit[];
  /** 최근 경기 기록 (최신순) */
  recent: RecentGame[];
  /** 경기별 출전 시간이 실제 교체 기록에서 온 것인지 (어림값이 아닌지) */
  realMinutes: boolean;
  score: number;
}

export interface RecentGame {
  matchId: string;
  kickoffUtc: string;
  competition: string;
  opponent: string;
  homeAway: '홈' | '원정';
  scoreline: string;
  result: 'W' | 'D' | 'L';
  minutes: number;
  started: boolean;
  /** 교체 투입 분 (선발이면 undefined) — "교체 60'(30)" 표기에 쓴다 */
  subIn?: number;
  /** 교체 아웃 분 (끝까지 뛰었으면 undefined) */
  subOut?: number;
  goals: number;
  assists: number;
}

const FULL_TIME = 90;

/**
 * 실제 출전 시간(분).
 *
 * ⚠️ 여기에 오래된 버그가 있었다. JSON 배열에서 `undefined` 는 `null` 로
 * 직렬화되는데, 예전 코드가 `inMin !== undefined` 로만 검사해서 **null 이
 * 통과**했다. 그러면 `90 - null` = 90 이 되어, 아예 뛰지 않은 벤치 선수까지
 * 전부 "교체 출전 90분" 으로 기록됐다. `!= null` 로 둘 다 걸러야 한다.
 *
 * 교체 시각은 ESPN 요약에는 없고 core 경기 로스터에만 있다
 * (`subbedOut: {didSub:true, clock:{displayValue:"86'"}}`). 스냅샷이 그걸
 * 받아 넣어 주므로, 값이 없으면 "그 경기는 안 뛰었다" 로 본다.
 */
function minutesOf(
  starter: boolean,
  inMin?: number | null,
  outMin?: number | null,
): number {
  if (starter) return Math.max(0, Math.min(FULL_TIME, outMin ?? FULL_TIME));
  if (inMin != null) return Math.max(0, Math.min(FULL_TIME, (outMin ?? FULL_TIME) - inMin));
  return 0;   // 교체 투입 기록이 없으면 출전하지 않은 것이다
}

export function buildSquad(
  matches: Match[],
  lineups: Record<string, Lineup>,
  athletes: Record<string, AthleteInfo>,
  teamId: string,
): {
  players: PlayerSeason[];
  formation: string | null;
  covered: number;
  /** 포메이션별 채택 경기 수 (많은 순) — 화면에 근거로 보여 준다 */
  formationTally: { shape: string; n: number }[];
  /**
   * 최다 채택 포메이션에서 실제로 쓰인 자리 구성.
   * 예: 3-4-2-1 → [{CD-L,1},{CD,1},{CD-R,1},{LM,1},{CM,2},{RM,1},{AM-L,1},{AM-R,1},{F,1},{G,1}]
   * 베스트 11 은 이 자리들을 "그 자리에서 실제로 가장 많이 선발한 선수" 로 채운다.
   */
  slotShape: { abbr: string; n: number }[];
} {
  const byId = new Map<string, PlayerSeason>();
  let covered = 0;

  const sorted = [...matches].sort((a, b) => b.kickoffUtc.localeCompare(a.kickoffUtc));

  /*
   * 포메이션을 **먼저** 정한다 — 그 팀이 누적으로 가장 많이 채택한 것.
   * 그래야 자리 집계를 그 포메이션 경기들로만 한정할 수 있다. 4-2-3-1 을
   * 주로 쓰는 팀이 가끔 3-4-2-1 을 쓰면, 그 경기의 자리(예: 스리백)가
   * 섞여 들어가 배치가 통째로 흔들린다.
   */
  const formationCount: Record<string, number> = {};
  for (const m of sorted) {
    if (m.competition === 'club.friendly') continue;
    const lu = lineups[m.id];
    if (!lu || lu.teamId !== teamId) continue;
    formationCount[lu.formation] = (formationCount[lu.formation] ?? 0) + 1;
  }
  /* 빈 문자열(포메이션 정보가 없는 경기)은 후보에서 뺀다 — 그게 1등이 되면
     줄 수를 못 구해 배치가 통째로 망가진다.
     동률이면 더 최근에 쓴 쪽이 이긴다(sorted 가 최신순이라 먼저 들어간다). */
  const formationTally = Object.entries(formationCount)
    .filter(([shape]) => shape.trim() !== '')
    .sort((a, b) => b[1] - a[1])
    .map(([shape, n]) => ({ shape, n }));
  const formation = formationTally[0]?.shape ?? null;

  /*
   * 그 포메이션 경기들에서 자리 구성을 뽑는다.
   * 경기마다 선발 자리 약어를 세고, 약어별 **최빈 등장 수**를 자리 수로 본다.
   * (한 경기만 보면 부상·로테이션이 그대로 반영되므로 최빈값을 쓴다)
   */
  const perMatch: Record<string, number>[] = [];
  for (const m of sorted) {
    if (m.competition === 'club.friendly') continue;
    const lu = lineups[m.id];
    if (!lu || lu.teamId !== teamId || lu.formation !== formation) continue;
    const c: Record<string, number> = {};
    for (const e of lu.entries) {
      const starter = e[2];
      const abbr = e[7];
      if (starter && abbr) c[abbr] = (c[abbr] ?? 0) + 1;
    }
    if (Object.keys(c).length) perMatch.push(c);
  }

  const slotShape: { abbr: string; n: number }[] = [];
  for (const abbr of new Set(perMatch.flatMap((c) => Object.keys(c)))) {
    const tally = new Map<number, number>();
    for (const c of perMatch) {
      const v = c[abbr] ?? 0;
      tally.set(v, (tally.get(v) ?? 0) + 1);
    }
    const mode = [...tally.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    if (mode > 0) slotShape.push({ abbr, n: mode });
  }

  for (const m of sorted) {
    // 클럽 친선경기는 팀 컨디션 점검용이라 공식 기록에서 뺀다.
    // (국가대표 친선전(fifa.friendly)은 실제 A매치라 그대로 집계한다)
    if (m.competition === 'club.friendly') continue;
    const lu = lineups[m.id];
    if (!lu || lu.teamId !== teamId) continue;
    covered++;

    const isHome = m.home.id === teamId;
    const opp = isHome ? m.away : m.home;
    const mine = isHome ? m.homeScore : m.awayScore;
    const theirs = isHome ? m.awayScore : m.homeScore;
    const result: 'W' | 'D' | 'L' =
      (mine ?? 0) > (theirs ?? 0) ? 'W' : (mine ?? 0) < (theirs ?? 0) ? 'L' : 'D';

    for (const [id, place, starter, inMin, outMin, eg, ea, abbr] of lu.entries) {
      const info = athletes[id];
      if (!info) continue;                       // 이름을 모르는 선수는 지어내지 않는다
      const mins = minutesOf(starter, inMin, outMin);

      let p = byId.get(id);
      if (!p) {
        p = {
          id, name: info.name, jersey: info.jersey, pos: info.pos, photo: info.photo,
          apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, points: 0,
          slots: {}, modalSlot: 0, posPlaces: {}, posAny: {}, modalPos: '',
          byComp: [], recent: [], score: 0, realMinutes: false,
        };
        byId.set(id, p);
      }

      /* 벤치에만 앉고 끝난 경기는 기록을 올리지 않는다.
         단 **명단에서 지우지는 않는다** — 백업 골키퍼가 통째로 사라지면
         스쿼드가 비어 보인다(루닌이 7경기 전부 미출전이라 사라졌었다).
         출전 0 으로 목록 맨 아래에 남고, 베스트 11 후보에서는 빠진다. */
      if (mins === 0) continue;

      /* 라인업이 선수별 골·도움을 들고 있으면 그걸 쓴다(ESPN 집계 원본).
         없을 때만 예전처럼 득점 이벤트의 이름을 맞춰 본다 — 표기가 달라
         도움이 통째로 비는 일이 있어 어디까지나 폴백이다. */
      const g = lu.hasStats
        ? (eg ?? 0)
        : m.goals.filter((x) => x.teamId === teamId && !x.ownGoal && x.scorer === info.name).length;
      const a = lu.hasStats
        ? (ea ?? 0)
        : m.goals.filter((x) => x.teamId === teamId && x.assist === info.name).length;

      p.apps++;
      if (starter) p.starts++;
      let split = p.byComp.find((c) => c.competition === m.competition);
      if (!split) {
        split = { competition: m.competition, apps: 0, starts: 0, goals: 0, assists: 0 };
        p.byComp.push(split);
      }
      split.apps++;
      if (starter) split.starts++;
      split.goals += g;
      split.assists += a;
      p.minutes += mins;
      if (lu.hasMinutes) p.realMinutes = true;
      p.goals += g;
      p.assists += a;
      if (place > 0) p.slots[place] = (p.slots[place] ?? 0) + 1;
      /* 선발로 선 자리만 센다(교체 투입은 자리 의미가 흐리다).
         그리고 최다 채택 포메이션 경기만 센다 — 다른 포메이션의 자리가
         섞이면 배치가 흔들린다. 그 포메이션 기록이 없는 선수를 위해
         전체 집계(posAny)도 같이 남겨 둔다. */
      if (starter && abbr) {
        p.posAny[abbr] = (p.posAny[abbr] ?? 0) + 1;
        if (lu.formation === formation) p.posPlaces[abbr] = (p.posPlaces[abbr] ?? 0) + 1;
      }
      p.recent.push({
        matchId: m.id,
        kickoffUtc: m.kickoffUtc,
        competition: m.competition,
        opponent: opp.abbr,
        homeAway: isHome ? '홈' : '원정',
        scoreline: `${m.homeScore ?? '-'} : ${m.awayScore ?? '-'}`,
        result,
        minutes: mins,
        started: starter,
        subIn: !starter && inMin != null ? inMin : undefined,
        subOut: outMin != null ? outMin : undefined,
        goals: g,
        assists: a,
      });
    }
  }

  const players = [...byId.values()].map((p) => {
    const entries = Object.entries(p.slots);
    p.modalSlot = entries.length
      ? Number(entries.sort((x, y) => y[1] - x[1])[0][0])
      : 0;
    /* 자리 약어는 경기 요약에 있을 때만 쌓인다 — 같은 팀이라도 대회에 따라
       아예 안 주는 응답이 있다(첼시가 그랬다). 그럴 땐 팀 로스터가 주는
       시즌 포지션(G/D/M/F)이라도 쓴다. 줄은 맞고 좌우만 모르는 상태다. */
    const pickModal = (rec: Record<string, number>) =>
      Object.entries(rec).sort((x, y) => y[1] - x[1])[0]?.[0];
    p.modalPos =
      pickModal(p.posPlaces) ?? pickModal(p.posAny) ?? athletes[p.id]?.posAbbr ?? '';

    /* 화면에 쓰는 큰 분류는 약어에서 다시 뽑는다 — 스냅샷이 예전 규칙으로
       잘못 저장해 둔 값(CM·CAM·CF 를 수비수로 본)을 여기서 바로잡는다. */
    const role = roleOf(p.modalPos);
    if (role) p.pos = role.pos;
    p.points = p.goals + p.assists;
    p.byComp.sort((x, y) => y.goals + y.assists - (x.goals + x.assists) || y.apps - x.apps);
    /*
     * 경기별 교체 시각(subbedIn/OutAtMinute)은 ESPN 응답 필드명이 검증되지
     * 않아 대부분 비어 오고, 그러면 선발은 90분·교체는 0분으로 어림돼
     * "출전시간 = 경기수 × 90분" 처럼 보인다. ESPN 선수 시즌 통계
     * (/athletes/{id}/statistics 의 minutes/timePlayed — 코리안리거 집계에서
     * 이미 검증된 값)가 있으면 그 실제 누적값으로 총 출전시간을 덮어쓴다.
     * (경기별 상세 내역은 실제 기록이 없으므로 여전히 어림값이다)
     */
    /* 경기별 실제 교체 기록이 있으면 그 합이 정답이다(모든 대회 포함).
       없을 때만 시즌 누적값으로 대신한다 — 그 값은 **리그 기록만**이라
       컵·유럽대항전 출전이 빠진다는 점을 감안해야 한다. */
    const real = athletes[p.id]?.minutesSeason;
    if (!p.realMinutes && real !== undefined && real > 0) p.minutes = real;
    // 선발·출전시간을 기본으로 하고 공격포인트를 얹는다
    p.score = p.starts * 3 + p.apps + p.minutes / 90 + p.goals * 2.5 + p.assists * 1.5;
    return p;
  });

  players.sort((a, b) => b.score - a.score);

  return { players, formation, covered, formationTally, slotShape };
}

/**
 * 선수 목록 정렬.
 * 1) 베스트 11 을 먼저 두되 포메이션 위쪽(공격)부터 — FW → MF → DF → GK
 * 2) 나머지는 선발 많은 순 → 출전 많은 순 → 득점 많은 순
 */
export function orderForList(players: PlayerSeason[], slots: Slot[]): PlayerSeason[] {
  const inXi = slots
    .filter((s) => s.player)
    .sort((a, b) => b.row - a.row || a.col - b.col)   // row 가 클수록 공격 쪽
    .map((s) => s.player!);

  const xiIds = new Set(inXi.map((p) => p.id));
  const rest = players
    .filter((p) => !xiIds.has(p.id))
    .sort((a, b) => b.starts - a.starts || b.apps - a.apps || b.goals - a.goals || b.minutes - a.minutes);

  return [...inXi, ...rest];
}

/* ── 베스트 11 ───────────────────────────────────────── */

export interface Slot {
  row: number;
  col: number;
  rowCount: number;
  player: PlayerSeason | null;
  label: string;
}

/**
 * ESPN 포지션 약어 → 배치 정보.
 *
 * ESPN 은 경기별 라인업에 선수마다 **실제 자리 약어**를 준다. 첼시
 * 2026-09-12 헐시티전(4-2-3-1)을 그대로 받아 확인한 값은 다음과 같다.
 *   G / LB / CD-L / CD-R / RB / LM / RM / AM-L / AM / AM-R / F
 * 역할(G·CD·LB·DM·M·AM·F…)과 좌우(`-L`/`-R` 접미, 또는 `L`/`R` 접두)가
 * 약어 안에 그대로 들어 있다.
 *
 * ⚠️ 예전에는 `formationPlace` 숫자를 레알 마드리드 경기로 눈대중해 맞춘
 * 표를 썼다. 그런데 첼시 실데이터와 대보니 같은 4-2-3-1 인데도 센터백
 * 두 자리(5·6)가 좌우 반대였다 — 첼시는 6이 CD-L, 5가 CD-R 이다. 숫자는
 * 팀/데이터 소스마다 뜻이 달라질 수 있다는 뜻이라, 배치 근거를 전부 이
 * 약어로 옮겼다. 그래서 팀별 "검증" 목록도 더 이상 필요 없다 — 새 팀을
 * 추가해도 ESPN 이 준 자리 그대로 그려진다.
 */
interface PosRole {
  /** 0=GK, 1=수비, 2=수비형MF, 3=중앙MF, 4=공격형MF·윙, 5=최전방 */
  depth: number;
  /** 음수=왼쪽, 0=중앙, 양수=오른쪽. 절대값이 클수록 더 바깥이다. */
  lateral: number;
  /** 화면에 쓰는 큰 분류 */
  pos: PlayerSeason['pos'];
}

/**
 * 약어의 "몸통"(좌우 표시를 뗀 부분) → 깊이와 큰 분류.
 *
 * ⚠️ 예전에는 `약어가 C 로 시작하면 수비수` 같은 난폭한 규칙을 썼다.
 * 그래서 CM(중앙 미드필더)·CAM·CF(센터포워드)가 전부 수비수로 분류됐고,
 * 벨링엄이 DF 로, 첼시 스쿼드 대부분이 DF 로 나왔다. 약어는 이렇게
 * 표로 정확히 맞춰야 한다.
 */
const ROLE_BY_CORE: Record<string, { depth: number; pos: PlayerSeason['pos'] }> = {
  G: { depth: 0, pos: 'G' }, GK: { depth: 0, pos: 'G' },
  B: { depth: 1, pos: 'D' }, CB: { depth: 1, pos: 'D' }, CD: { depth: 1, pos: 'D' },
  D: { depth: 1, pos: 'D' }, WB: { depth: 1, pos: 'D' }, SW: { depth: 1, pos: 'D' },
  DEF: { depth: 1, pos: 'D' },
  DM: { depth: 2, pos: 'M' }, CDM: { depth: 2, pos: 'M' }, DMF: { depth: 2, pos: 'M' },
  M: { depth: 3, pos: 'M' }, CM: { depth: 3, pos: 'M' }, MF: { depth: 3, pos: 'M' },
  MID: { depth: 3, pos: 'M' }, CMF: { depth: 3, pos: 'M' }, WM: { depth: 3, pos: 'M' },
  AM: { depth: 4, pos: 'M' }, CAM: { depth: 4, pos: 'M' }, AMF: { depth: 4, pos: 'M' },
  W: { depth: 4, pos: 'F' }, WF: { depth: 4, pos: 'F' },
  F: { depth: 5, pos: 'F' }, FW: { depth: 5, pos: 'F' }, S: { depth: 5, pos: 'F' },
  ST: { depth: 5, pos: 'F' }, CF: { depth: 5, pos: 'F' }, SS: { depth: 5, pos: 'F' },
};

/** 팀 로스터가 주는 큰 분류(G/D/M/F) — 줄은 맞지만 좌우는 알 수 없다 */
const COARSE = new Set(['G', 'D', 'M', 'F']);

/** 'CD-L' → {depth:1, lateral:-1} · 'LB' → {depth:1, lateral:-2} */
export function roleOf(abbr: string): PosRole | null {
  const a = String(abbr ?? '').toUpperCase().trim();
  if (!a) return null;

  let lateral = 0;
  let core = a;

  const suffix = a.match(/-(L|R|C)$/);
  if (suffix) {
    // 'CD-L' 처럼 접미사로 좌우가 붙는 자리 — 같은 줄의 안쪽이다
    lateral = suffix[1] === 'L' ? -1 : suffix[1] === 'R' ? 1 : 0;
    core = a.slice(0, a.length - 2);
  } else if (a.length > 1 && (a[0] === 'L' || a[0] === 'R')) {
    // 'LB' · 'RM' 처럼 접두사로 좌우가 붙는 자리 — 줄의 바깥쪽이다
    lateral = a[0] === 'L' ? -2 : 2;
    core = a.slice(1);
  }

  const hit = ROLE_BY_CORE[core] ?? ROLE_BY_CORE[a];
  return hit ? { depth: hit.depth, lateral, pos: hit.pos } : null;
}

/** 약어가 없을 때의 폴백 — 좌우 정보가 없어 줄 안 순서는 정할 수 없다 */
const DEPTH_BY_POS: Record<PlayerSeason['pos'], number> = { G: 0, D: 1, M: 3, F: 5 };

const roleFor = (p: PlayerSeason): PosRole =>
  roleOf(p.modalPos) ?? { depth: DEPTH_BY_POS[p.pos], lateral: 0, pos: p.pos };

export interface SlotSpec { abbr: string; n: number }

/**
 * 베스트 11 — **실제로 선 자리 기록**으로 채운다.
 *
 * 예전에는 "깊이(수비→공격) 가 비슷하고 시즌 점수가 높은 선수" 를 줄마다
 * 잘라 넣었다. 그러면 그 자리에 한 번도 선 적 없는 선수가 들어간다 —
 * 리그 28분만 뛴 선수가 베스트 11 에 올라오는 식이었다.
 *
 * 지금은 이렇게 한다.
 *  1) 최다 채택 포메이션에서 실제로 쓰인 자리 구성(slotShape)을 받는다.
 *     3-4-2-1 이면 CD-L·CD·CD-R·LM·CM×2·RM·AM-L·AM-R·F·G 같은 목록이다.
 *  2) (선수, 자리) 쌍을 **그 자리 선발 횟수가 많은 순**으로 확정한다.
 *     같은 횟수면 시즌 점수로 가른다.
 *  3) 그래도 빈 자리는 같은 깊이대의 남은 선수로 메운다(마지막 수단).
 *  4) 줄은 자리의 깊이로 묶고, 줄 안 순서는 좌우(-L/-R)로 세운다.
 *
 * 자리 기록이 아예 없으면(포지션 약어를 안 주는 대회) 포메이션 문자열로
 * 줄을 만들고 깊이로 채우는 예전 방식으로 떨어진다.
 */
export function bestEleven(
  players: PlayerSeason[],
  formation: string | null,
  slotShape?: SlotSpec[],
): {
  slots: Slot[];
  formation: string;
  verified: boolean;
} {
  const shape = formation ?? '4-3-3';

  if (slotShape?.length) {
    const byAbbr = fillByActualSlots(players, slotShape, shape);
    if (byAbbr) return { ...byAbbr, formation: shape };
  }
  return { ...fillByDepth(players, shape), formation: shape };
}

/** 실제 자리 기록으로 채우기 */
function fillByActualSlots(
  players: PlayerSeason[],
  slotShape: SlotSpec[],
  shape: string,
): { slots: Slot[]; verified: boolean } | null {
  // 자리 하나하나로 펼친다 (CM 2명이면 CM 자리 두 개)
  const seats: { abbr: string; player: PlayerSeason | null }[] = [];
  for (const { abbr, n } of slotShape) {
    for (let k = 0; k < n; k++) seats.push({ abbr, player: null });
  }
  if (!seats.length) return null;

  /* (선수, 자리) 주장 강도 = 그 자리에서의 선발 횟수.
     강한 주장부터 확정해야 "그 자리 단골" 이 먼저 앉는다. */
  type Claim = { abbr: string; p: PlayerSeason; n: number };
  const claims: Claim[] = [];
  const needed = new Set(slotShape.map((x) => x.abbr));
  for (const p of players) {
    for (const [abbr, n] of Object.entries(p.posPlaces)) {
      if (needed.has(abbr) && n > 0) claims.push({ abbr, p, n });
    }
  }
  claims.sort((a, b) => b.n - a.n || b.p.score - a.p.score);

  const used = new Set<string>();
  for (const c of claims) {
    if (used.has(c.p.id)) continue;
    const seat = seats.find((s) => s.abbr === c.abbr && !s.player);
    if (!seat) continue;
    seat.player = c.p;
    used.add(c.p.id);
  }

  // 남은 빈 자리는 같은 깊이대의 남은 선수 중 점수 순으로 (마지막 수단)
  for (const seat of seats) {
    if (seat.player) continue;
    const want = roleOf(seat.abbr)?.depth ?? 3;
    const cand = players
      .filter((p) => !used.has(p.id) && p.apps > 0)
      .sort(
        (a, b) =>
          Math.abs(roleFor(a).depth - want) - Math.abs(roleFor(b).depth - want) ||
          b.score - a.score,
      )[0];
    if (cand) {
      seat.player = cand;
      used.add(cand.id);
    }
  }

  /*
   * 줄 나누기 — **줄 수는 포메이션 문자열이 정한다**.
   *
   * ⚠️ 자리의 깊이만으로 묶으면 안 된다. 첼시 3-4-2-1 의 실제 자리는
   *   G / CD-L·CD·CD-R / LM·CM-L·CM-R·RM / CF-L·CF-R / F
   * 인데, ESPN 이 2선 두 명을 CF-L/CF-R(센터포워드)로 주기 때문에 최전방 F 와
   * 깊이가 같아진다. 깊이로만 묶으면 셋이 한 줄이 되어 3-4-3 처럼 보였다.
   *
   * 그래서 3-4-2-1 → [1,3,4,2,1] 처럼 줄 크기를 문자열에서 가져오고,
   * 자리들을 (깊이 오름차순, 좌우 치우침 큰 순)으로 세워 앞에서부터 담는다.
   * 같은 깊이면 좌우로 벌어진 자리가 뒤쪽 줄에, 가운데 자리가 맨 앞줄에 간다
   * — CF-L·CF-R 이 2선, F 가 최전방이 되는 이유다.
   */
  const depthOf = (abbr: string) => roleOf(abbr)?.depth ?? 3;
  const lateralOf = (abbr: string) => roleOf(abbr)?.lateral ?? 0;

  const counts = shape.split('-').map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const rowSizes = counts.length ? [1, ...counts] : null;

  const ordered = [...seats].sort(
    (a, b) =>
      depthOf(a.abbr) - depthOf(b.abbr) ||
      Math.abs(lateralOf(b.abbr)) - Math.abs(lateralOf(a.abbr)),
  );

  // 포메이션이 말하는 줄 크기와 실제 인원이 맞을 때만 쓴다
  const sizes =
    rowSizes && rowSizes.reduce((a, b) => a + b, 0) === ordered.length
      ? rowSizes
      : [...new Set(ordered.map((s) => depthOf(s.abbr)))]
          .sort((a, b) => a - b)
          .map((d) => ordered.filter((s) => depthOf(s.abbr) === d).length);

  const slots: Slot[] = [];
  let at = 0;
  sizes.forEach((n, ri) => {
    const row = ordered.slice(at, at + n).sort((a, b) => lateralOf(a.abbr) - lateralOf(b.abbr));
    at += n;
    row.forEach((s, ci) => {
      slots.push({ row: ri, col: ci, rowCount: row.length, player: s.player, label: s.abbr });
    });
  });

  const filled = slots.filter((s) => s.player).length;
  // 좌우까지 아는 상세 약어로 채워졌는지 (G/D/M/F 만으로는 좌우를 장담 못 한다)
  const verified =
    filled === slots.length &&
    slotShape.every((x) => !!roleOf(x.abbr) && !COARSE.has(x.abbr.toUpperCase()));

  return { slots, verified };
}

/** 자리 기록이 없을 때 — 포메이션 문자열의 줄 수에 깊이로 맞춰 채운다 */
function fillByDepth(players: PlayerSeason[], shape: string): { slots: Slot[]; verified: boolean } {
  const counts = shape.split('-').map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const lines = [1, ...counts];

  const used = new Set<string>();
  const slots: Slot[] = [];
  const outfieldRows = lines.length - 1;
  const idealDepth = (ri: number) =>
    outfieldRows <= 1 ? 3 : 1 + ((ri - 1) * 4) / (outfieldRows - 1);

  lines.forEach((n, ri) => {
    const picked: PlayerSeason[] = [];
    if (ri === 0) {
      const gk =
        players.find((p) => roleFor(p).depth === 0 && !used.has(p.id) && p.apps > 0) ??
        players.find((p) => !used.has(p.id) && p.apps > 0);
      if (gk) picked.push(gk);
    } else {
      const want = idealDepth(ri);
      picked.push(
        ...players
          .filter((p) => !used.has(p.id) && roleFor(p).depth !== 0 && p.apps > 0)
          .sort(
            (a, b) =>
              Math.abs(roleFor(a).depth - want) - Math.abs(roleFor(b).depth - want) ||
              b.score - a.score,
          )
          .slice(0, n),
      );
    }
    for (const p of picked) used.add(p.id);
    picked.sort((a, b) => roleFor(a).lateral - roleFor(b).lateral || b.score - a.score);
    for (let ci = 0; ci < n; ci++) {
      slots.push({
        row: ri, col: ci, rowCount: n,
        player: picked[ci] ?? null,
        label: picked[ci]?.modalPos ?? '',
      });
    }
  });

  const filled = slots.map((s) => s.player).filter((p): p is PlayerSeason => !!p);
  const verified =
    filled.length === 11 &&
    filled.every((p) => !!roleOf(p.modalPos) && !COARSE.has(p.modalPos.toUpperCase()));
  return { slots, verified };
}


/* ── 포지션 표기 ────────────────────────────────────────────
   레퍼런스처럼 선수 위에 GK·LB·LCB·CAM·ST 같은 자리 이름을 띄운다.
   ESPN 의 formationPlace 숫자는 포메이션마다 의미가 달라 그대로는
   못 쓰므로, 줄의 성격(수비/중원/공격2선/최전방)과 그 줄의 인원수로
   이름을 만든다. 4-2-3-1 에서 레퍼런스와 같은 표기가 나온다. */

export type LineKind = 'GK' | 'DEF' | 'MID' | 'AM' | 'FW';

export function lineKind(rowIdx: number, rowTotal: number): LineKind {
  if (rowIdx === 0) return 'GK';
  if (rowIdx === 1) return 'DEF';
  if (rowIdx === rowTotal - 1) return 'FW';
  if (rowIdx === rowTotal - 2 && rowTotal >= 4) return 'AM';
  return 'MID';
}

export function lineLabels(kind: LineKind, n: number): string[] {
  const table: Record<LineKind, Record<number, string[]>> = {
    GK: { 1: ['GK'] },
    DEF: {
      3: ['LCB', 'CB', 'RCB'],
      4: ['LB', 'LCB', 'RCB', 'RB'],
      5: ['LWB', 'LCB', 'CB', 'RCB', 'RWB'],
    },
    MID: {
      1: ['CM'],
      2: ['LM', 'RM'],
      3: ['LM', 'CM', 'RM'],
      4: ['LM', 'LCM', 'RCM', 'RM'],
      5: ['LM', 'LCM', 'CM', 'RCM', 'RM'],
    },
    AM: {
      1: ['CAM'],
      2: ['LAM', 'RAM'],
      3: ['LAM', 'CAM', 'RAM'],
    },
    FW: {
      1: ['ST'],
      2: ['LS', 'RS'],
      3: ['LW', 'ST', 'RW'],
    },
  };
  return table[kind][n] ?? Array.from({ length: n }, () => (kind === 'GK' ? 'GK' : kind));
}

/** 자리 성격별 링 색 — 레퍼런스의 빨강(최전방)·초록(2선)·청록(중원)·파랑(수비)·금(GK) */
export const LINE_COLOR: Record<LineKind, string> = {
  FW: '#FF4D5E',
  AM: '#2ED573',
  MID: '#3FD7C0',
  DEF: '#4C8DFF',
  GK: '#F5A524',
};

/**
 * 팀 조직력 — 베스트 11 각 자리 선수의 선발 출전 비율(최대 선발 대비)의
 * 평균 × 100. 같은 11명이 계속 함께 선발될수록 100 에 가까워진다.
 * 분모는 "최대 선발", 즉 라인업이 확보된 경기 수다.
 */
export function teamCohesion(slots: Slot[], covered: number): number {
  const xi = slots.map((s) => s.player).filter((p): p is PlayerSeason => !!p);
  if (!xi.length || !covered) return 0;
  const share = xi.reduce((a, p) => a + Math.min(1, p.starts / covered), 0) / xi.length;
  return Math.round(share * 100);
}
