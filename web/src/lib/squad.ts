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
  apps: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  points: number;
  /** formationPlace → 선발 횟수 */
  slots: Record<number, number>;
  modalSlot: number;
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

    for (const [id, place, starter, inMin, outMin, eg, ea] of lu.entries) {
      const info = athletes[id];
      if (!info) continue;                       // 이름을 모르는 선수는 지어내지 않는다
      const mins = minutesOf(place, starter, inMin, outMin);
      if (mins === 0) continue;                  // 미출전 벤치는 집계하지 않는다

      let p = byId.get(id);
      if (!p) {
        p = {
          id, name: info.name, jersey: info.jersey, pos: info.pos,
          apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, points: 0,
          slots: {}, modalSlot: 0, byComp: [], recent: [], score: 0,
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
 * 검증된 ESPN 슬롯 배치. ESPN의 formationPlace 번호가 어떤 자리를 뜻하는지는
 * 팀마다(어쩌면 팀의 데이터 소스마다) 다를 수 있어, 실제 경기로 맞춰본 팀에만
 * 적용한다 — 레알 마드리드 6경기로 4-2-3-1 을 확인했다.
 * 배열은 뒤에서 앞으로(골키퍼 → 공격), 각 줄은 화면 왼쪽부터의 순서다.
 *
 * 새 팀을 추가했는데 같은 포메이션이라고 이 번호가 그대로 맞으리라는 보장이
 * 없다. 그래서 팀 단위로 "검증됨"을 명시하지 않는 한, 다른 팀은 항상 아래
 * 포지션 그룹 기준 배치(verified: false)로 떨어진다 — 틀린 자리를 확신 있게
 * 보여주는 것보다, 부정확할 수 있다고 정직하게 표시하는 편이 낫다.
 */
const SLOT_ROWS: Record<string, number[][]> = {
  '4-2-3-1': [[1], [3, 5, 6, 2], [4, 8], [11, 10, 7], [9]],
};

/** 위 SLOT_ROWS 의 자리 번호가 실제로 확인된 팀 (espnTeamId) */
const VERIFIED_TEAMS: Record<string, Set<string>> = {
  '4-2-3-1': new Set(['86']), // Real Madrid
};

const POS_ORDER: PlayerSeason['pos'][] = ['G', 'D', 'M', 'F'];

export function bestEleven(players: PlayerSeason[], formation: string | null, teamId?: string): {
  slots: Slot[];
  formation: string;
  verified: boolean;
} {
  const shape = formation ?? '4-3-3';
  const rows = teamId && VERIFIED_TEAMS[shape]?.has(teamId) ? SLOT_ROWS[shape] : undefined;

  if (rows) {
    /* 슬롯 의미가 검증된 포메이션.
       선정 가중치는 사용자가 지정한 순서를 그대로 따른다.
         1) 그 자리(포메이션 슬롯)에서의 선발 출전 수
         2) 총 출전 경기 수
         3) 리그 총 출전 시간
         4) 공격 포인트
       중앙 미드필더 줄은 좌/우를 나누지 않고 한 묶음으로 집계한다
       (4-2-3-1 의 4·8 처럼 좌우가 사실상 같은 자리인 경우). */
    const used = new Set<string>();
    const slots: Slot[] = [];

    rows.forEach((row, ri) => {
      const pooled = lineKind(ri, rows.length) === 'MID' ? row : null;
      const startsAt = (p: PlayerSeason, place: number) =>
        pooled
          ? pooled.reduce((a, k) => a + (p.slots[k] ?? 0), 0)
          : (p.slots[place] ?? 0);

      row.forEach((place, ci) => {
        const cand = players
          .filter((p) => !used.has(p.id) && startsAt(p, place) > 0)
          .sort(
            (a, b) =>
              startsAt(b, place) - startsAt(a, place) ||
              b.apps - a.apps ||
              b.minutes - a.minutes ||
              b.points - a.points,
          )[0];
        if (cand) used.add(cand.id);
        slots.push({ row: ri, col: ci, rowCount: row.length, player: cand ?? null, label: String(place) });
      });
    });
    // 빈 자리는 남은 선수 중 점수순으로 채운다
    for (const s of slots) {
      if (s.player) continue;
      const cand = players.find((p) => !used.has(p.id));
      if (cand) { used.add(cand.id); s.player = cand; }
    }
    return { slots, formation: shape, verified: true };
  }

  // 검증되지 않은 포메이션 — 슬롯 번호를 추측하지 않고 포지션 그룹으로 채운다
  const counts = shape.split('-').map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const lines = [1, ...counts];
  const pools: Record<string, PlayerSeason[]> = { G: [], D: [], M: [], F: [] };
  for (const p of players) pools[p.pos].push(p);

  const slots: Slot[] = [];
  const midLines = lines.length - 3; // GK, DEF, ... , FWD
  lines.forEach((n, ri) => {
    const group: PlayerSeason['pos'] =
      ri === 0 ? 'G' : ri === 1 ? 'D' : ri === lines.length - 1 ? 'F' : 'M';
    for (let ci = 0; ci < n; ci++) {
      const cand = pools[group].shift() ?? pools[POS_ORDER.find((k) => pools[k].length)!]?.shift() ?? null;
      slots.push({ row: ri, col: ci, rowCount: n, player: cand, label: '' });
    }
  });
  void midLines;
  return { slots, formation: shape, verified: false };
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
