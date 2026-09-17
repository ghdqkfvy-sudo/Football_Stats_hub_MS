/**
 * Future Resources — 임대·바이백·셀온 조항으로 "미래에 돌아올 수 있는" 선수들.
 *
 * 화면에는 **조항의 종류만** 나온다. 금액·비율·기한처럼 출처를 댈 수 없는
 * 값은 적지 않기로 했다.
 *
 * ⚠️ 왜 손으로 관리하는가.
 * 이적 조항(바이백 금액, 셀온 비율, 임대 의무구매 조건)은 어떤 무료 API 에도
 * 없다. ESPN 은 물론이고 유료 API 도 대부분 안 준다. 그래서 **조항 정보만**
 * 이 파일에 적어 두고, 나머지(현 소속팀·시즌 스탯·최근 경기)는 athleteId 로
 * ESPN 에서 실시간으로 붙인다. 선수가 다른 팀으로 옮겨도 ID 만 맞으면
 * 화면은 저절로 따라간다.
 *
 * 고치는 법
 *   1. 아래 배열에 한 줄 추가한다.
 *   2. athleteId 는 ESPN 검색으로 찾는다 —
 *      https://site.web.api.espn.com/apis/search/v2?query=Fran%20Garcia
 *      결과의 uid `s:600~a:213050` 에서 뒤 숫자가 athleteId 이고,
 *      subtitle 이 현 소속팀이라 동명이인을 가려낼 수 있다.
 *   3. league 는 그 선수가 지금 뛰는 리그 slug (esp.1 / eng.1 / ita.1 / ger.1 …).
 *
 * 조항 문구는 확인된 사실만 적는다. 금액·비율을 모르면 비워 두는 게 낫다 —
 * 지어낸 숫자가 들어가면 이 탭 전체를 믿을 수 없게 된다.
 */

export type ClauseKind = 'buyback' | 'sellon' | 'loan';

export interface FuturePlayer {
  /** ESPN athleteId */
  id: string;
  name: string;
  /** 조항을 가진 원 소속 구단 (TARGETS 의 espnTeamId) */
  parentTeamId: string;
  kind: ClauseKind;
  /** 마지막으로 확인된 소속팀 — 실시간 조회가 되면 그 값으로 덮인다 */
  club: string;
  /** 지금 뛰는 리그 slug (스탯 조회에 쓴다) */
  league: string;
  pos?: 'G' | 'D' | 'M' | 'F';
  /**
   * 조항 설명 — **화면에는 쓰지 않는다.**
   * 금액·비율·기한처럼 출처를 댈 수 없는 값은 보여 주지 않기로 했다
   * (화면에는 조항 종류만 뜬다). 근거 메모로만 남긴다.
   */
  note?: string;
  /** 사실 확인 기준일 (메모) */
  checked?: string;
}

export const CLAUSE_LABEL: Record<ClauseKind, string> = {
  buyback: '바이백',
  sellon: '셀온',
  loan: '임대',
};

export const CLAUSE_COLOR: Record<ClauseKind, string> = {
  buyback: '#FFCF3D',
  sellon: '#2ED573',
  loan: '#4C8DFF',
};

export const FUTURE: FuturePlayer[] = [
  /* ── Real Madrid ────────────────────────────────── */
  {
    id: '337970', name: 'Nico Paz', parentTeamId: '86', kind: 'buyback',
    club: 'Como', league: 'ita.1', pos: 'M',
  },
  {
    id: '380318', name: 'Jacobo Ramón', parentTeamId: '86', kind: 'buyback',
    club: 'Como', league: 'ita.1', pos: 'D',
  },
  {
    id: '297360', name: 'Rafa Marín', parentTeamId: '86', kind: 'buyback',
    club: 'Napoli', league: 'ita.1', pos: 'D',
  },
  {
    id: '87297', name: 'Gonzalo García', parentTeamId: '86', kind: 'sellon',
    club: 'Fulham', league: 'eng.1', pos: 'F',
  },
  {
    id: '12172', name: 'César Palacios', parentTeamId: '86', kind: 'sellon',
    club: 'Fulham', league: 'eng.1', pos: 'M',
  },
  {
    id: '213050', name: 'Fran García', parentTeamId: '86', kind: 'sellon',
    club: 'Real Betis', league: 'esp.1', pos: 'D',
  },
  {
    id: '376473', name: 'Franco Mastantuono', parentTeamId: '86', kind: 'loan',
    club: 'Fiorentina', league: 'ita.1', pos: 'M',
  },

  /* ── Chelsea ────────────────────────────────────── */
  {
    id: '314858', name: 'Andrey Santos', parentTeamId: '363', kind: 'sellon',
    club: 'Manchester United', league: 'eng.1', pos: 'M',
  },
  {
    id: '227784', name: 'Trevoh Chalobah', parentTeamId: '363', kind: 'sellon',
    club: 'Como', league: 'ita.1', pos: 'D',
  },
  {
    id: '325555', name: 'Alejandro Garnacho', parentTeamId: '363', kind: 'loan',
    club: 'Aston Villa', league: 'eng.1', pos: 'F',
  },
  {
    id: '299911', name: 'Mykhailo Mudryk', parentTeamId: '363', kind: 'loan',
    club: 'Tottenham Hotspur', league: 'eng.1', pos: 'F',
  },
  {
    id: '231718', name: 'Axel Disasi', parentTeamId: '363', kind: 'loan',
    club: 'Crystal Palace', league: 'eng.1', pos: 'D',
  },
];

/** 그 팀의 조항 선수들 (등록 순서 그대로) */
export const futureFor = (parentTeamId: string): FuturePlayer[] =>
  FUTURE.filter((p) => p.parentTeamId === parentTeamId);
