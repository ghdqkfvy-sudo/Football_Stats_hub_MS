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
  /** ESPN 포지션 약어 → 선발 횟수 ('CD-L', 'AM-R', 'LB' …) */
  posPlaces: Record<string, number>;
  /** 가장 많이 선 자리의 ESPN 약어 — 베스트 11 배치의 근거 */
  modalPos: string;
  /** 대회별 기록 — 호버 카드에서 "리그 3골 · 챔스 1골" 로 보여준다 */
  byComp: CompSplit[];
  /** 최근 경기 기록 (최신순) */
  recent: RecentGame[];
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
  goals: number;
  assists: number;
}

const FULL_TIME = 90;

/** 교체 정보로 출전 시간을 계산한다 */
function minutesOf(place: number, starter: boolean, inMin?: number, outMin?: number): number {
  if (starter) return Math.min(FULL_TIME, outMin ?? FULL_TIME);
  if (inMin !== undefined) return Math.max(0, Math.min(FULL_TIME, (outMin ?? FULL_TIME) - inMin));
  return place > 0 ? FULL_TIME : 0;
}

export function buildSquad(
  matches: Match[],
  lineups: Record<string, Lineup>,
  athletes: Record<string, AthleteInfo>,
  teamId: string,
): { players: PlayerSeason[]; formation: string | null; covered: number } {
  const byId = new Map<string, PlayerSeason>();
  const formationCount: Record<string, number> = {};
  let covered = 0;

  const sorted = [...matches].sort((a, b) => b.kickoffUtc.localeCompare(a.kickoffUtc));

  for (const m of sorted) {
    // 클럽 친선경기는 팀 컨디션 점검용이라 공식 기록에서 뺀다.
    // (국가대표 친선전(fifa.friendly)은 실제 A매치라 그대로 집계한다)
    if (m.competition === 'club.friendly') continue;
    const lu = lineups[m.id];
    if (!lu || lu.teamId !== teamId) continue;
    covered++;
    formationCount[lu.formation] = (formationCount[lu.formation] ?? 0) + 1;

    const isHome = m.home.id === teamId;
    const opp = isHome ? m.away : m.home;
    const mine = isHome ? m.homeScore : m.awayScore;
    const theirs = isHome ? m.awayScore : m.homeScore;
    const result: 'W' | 'D' | 'L' =
      (mine ?? 0) > (theirs ?? 0) ? 'W' : (mine ?? 0) < (theirs ?? 0) ? 'L' : 'D';

    for (const [id, place, starter, inMin, outMin, eg, ea, abbr] of lu.entries) {
      const info = athletes[id];
      if (!info) continue;                       // 이름을 모르는 선수는 지어내지 않는다
      const mins = minutesOf(place, starter, inMin, outMin);
      if (mins === 0) continue;                  // 미출전 벤치는 집계하지 않는다

      let p = byId.get(id);
      if (!p) {
        p = {
          id, name: info.name, jersey: info.jersey, pos: info.pos, photo: info.photo,
          apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, points: 0,
          slots: {}, modalSlot: 0, posPlaces: {}, modalPos: '',
          byComp: [], recent: [], score: 0,
        };
        byId.set(id, p);
      }

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
        split = { competition: m.competition, apps: 0, goals: 0, assists: 0 };
        p.byComp.push(split);
      }
      split.apps++;
      split.goals += g;
      split.assists += a;
      p.minutes += mins;
      p.goals += g;
      p.assists += a;
      if (place > 0) p.slots[place] = (p.slots[place] ?? 0) + 1;
      // 선발로 선 자리만 센다 — 교체 투입은 자리 의미가 흐리다
      if (starter && abbr) p.posPlaces[abbr] = (p.posPlaces[abbr] ?? 0) + 1;
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
    const posEntries = Object.entries(p.posPlaces);
    p.modalPos = posEntries.length ? posEntries.sort((x, y) => y[1] - x[1])[0][0] : '';
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
    const real = athletes[p.id]?.minutesSeason;
    if (real !== undefined && real > 0) p.minutes = real;
    // 선발·출전시간을 기본으로 하고 공격포인트를 얹는다
    p.score = p.starts * 3 + p.apps + p.minutes / 90 + p.goals * 2.5 + p.assists * 1.5;
    return p;
  });

  players.sort((a, b) => b.score - a.score);

  const formation =
    Object.entries(formationCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return { players, formation, covered };
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
}

const DEPTH_BY_CORE: Record<string, number> = {
  G: 0, GK: 0,
  B: 1, CB: 1, CD: 1, D: 1, WB: 1, SW: 1, DEF: 1,
  DM: 2, CDM: 2, DMF: 2,
  M: 3, CM: 3, MF: 3, MID: 3, CMF: 3,
  AM: 4, CAM: 4, AMF: 4, W: 4, WF: 4, WM: 4,
  F: 5, FW: 5, S: 5, ST: 5, CF: 5, SS: 5,
};

/** 'CD-L' → {depth:1, lateral:-1} · 'LB' → {depth:1, lateral:-2} */
function roleOf(abbr: string): PosRole | null {
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

  const depth = DEPTH_BY_CORE[core] ?? DEPTH_BY_CORE[a];
  return depth === undefined ? null : { depth, lateral };
}

/** 약어가 없을 때의 폴백 — 좌우 정보가 없어 줄 안 순서는 정할 수 없다 */
const DEPTH_BY_POS: Record<PlayerSeason['pos'], number> = { G: 0, D: 1, M: 3, F: 5 };

const roleFor = (p: PlayerSeason): PosRole =>
  roleOf(p.modalPos) ?? { depth: DEPTH_BY_POS[p.pos], lateral: 0 };

export function bestEleven(players: PlayerSeason[], formation: string | null): {
  slots: Slot[];
  formation: string;
  verified: boolean;
} {
  const shape = formation ?? '4-3-3';
  const counts = shape.split('-').map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const lines = [1, ...counts]; // 골키퍼 한 줄 + 포메이션이 말하는 줄들

  const used = new Set<string>();
  const slots: Slot[] = [];

  /* 골키퍼 줄은 골키퍼 중에서, 나머지 줄은 "뒤에서부터 차례로" 채운다.
     같은 깊이 안에서는 시즌 점수가 높은 선수가 먼저 들어간다. */
  const outfield = players
    .filter((p) => roleFor(p).depth !== 0)
    .sort((a, b) => roleFor(a).depth - roleFor(b).depth || b.score - a.score);

  lines.forEach((n, ri) => {
    const picked: PlayerSeason[] = [];

    if (ri === 0) {
      const gk =
        players.find((p) => roleFor(p).depth === 0 && !used.has(p.id)) ??
        players.find((p) => !used.has(p.id));
      if (gk) picked.push(gk);
    } else {
      for (const p of outfield) {
        if (picked.length >= n) break;
        if (used.has(p.id)) continue;
        picked.push(p);
      }
    }
    for (const p of picked) used.add(p.id);

    // 줄 안에서는 왼쪽 → 중앙 → 오른쪽 순으로 세운다
    picked.sort((a, b) => roleFor(a).lateral - roleFor(b).lateral || b.score - a.score);

    for (let ci = 0; ci < n; ci++) {
      const player = picked[ci] ?? null;
      slots.push({
        row: ri,
        col: ci,
        rowCount: n,
        player,
        label: player?.modalPos ?? '',
      });
    }
  });

  /* ESPN 자리 약어를 실제로 가진 선수로만 채워졌는지 — 하나라도 비면
     좌우 순서를 장담할 수 없으므로 화면에 "포지션 그룹 배치"라고 알린다. */
  const filled = slots.map((s) => s.player).filter((p): p is PlayerSeason => !!p);
  const verified = filled.length === 11 && filled.every((p) => !!roleOf(p.modalPos));

  return { slots, formation: shape, verified };
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
