/**
 * Future Resources — 임대·바이백·셀온 조항으로 "미래에 돌아올 수 있는" 선수들.
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
 *   2. athleteId 를 모르면 `/api/v1/find?q=이름` 으로 찾는다
 *      (응답의 uid `s:600~a:337970` 에서 뒤 숫자가 athleteId).
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
    note: '레알 마드리드 유스 출신. 이적 당시 단계별 바이백 조항이 보도됐다. 정확한 금액은 공식 확인된 바 없다.',
    checked: '2026-09-16',
  },
  {
    /* ESPN 검색으로 확인: uid s:600~a:380318 · 현 소속 Serie A */
    id: '380318', name: 'Jacobo Ramón', parentTeamId: '86', kind: 'buyback',
    club: 'Como', league: 'ita.1', pos: 'D',
    note: '카스티야 출신 센터백. 이적 시 바이백 조항이 보도됐다.',
    checked: '2026-09-16',
  },
  {
    id: '297360', name: 'Rafa Marín', parentTeamId: '86', kind: 'sellon',
    club: 'Napoli', league: 'ita.1', pos: 'D',
    note: '레알 마드리드 카스티야 출신 센터백. 매각 시 재판매 이익 배분 조항이 있는 것으로 보도됐다.',
    checked: '2026-09-16',
  },

  /* ── Chelsea ────────────────────────────────────── */
  {
    id: '314858', name: 'Andrey Santos', parentTeamId: '363', kind: 'sellon',
    club: 'Manchester United', league: 'eng.1', pos: 'M',
    note: '첼시에서 이적. 재판매 조항 보유 여부는 구단 공시가 없어 확인 필요.',
    checked: '2026-09-16',
  },
  {
    id: '363038', name: 'Marc Guiu', parentTeamId: '363', kind: 'buyback',
    club: 'RB Leipzig', league: 'ger.1', pos: 'F',
    note: '첼시가 바르셀로나 바이백 조항을 지불하고 영입했던 공격수. 현재 소속과 조항은 실시간 조회로 확인한다.',
    checked: '2026-09-16',
  },
  {
    id: '336394', name: 'Cesare Casadei', parentTeamId: '363', kind: 'sellon',
    club: 'Torino', league: 'ita.1', pos: 'M',
    note: '첼시 유스 이후 세리에A 로 이적. 재판매 조항 보도 있음.',
    checked: '2026-09-16',
  },
  {
    id: '363218', name: 'Aarón Anselmino', parentTeamId: '363', kind: 'loan',
    club: 'Chelsea', league: 'eng.1', pos: 'D',
    note: '보카 주니어스에서 영입한 센터백. 임대로 경험을 쌓는 단계.',
    checked: '2026-09-16',
  },
  {
    id: '332343', name: 'Mike Penders', parentTeamId: '363', kind: 'loan',
    club: 'Chelsea', league: 'eng.1', pos: 'G',
    note: '헹크에서 영입한 골키퍼. 임대 출전으로 성장 중.',
    checked: '2026-09-16',
  },
  {
    id: '358746', name: 'Kendry Páez', parentTeamId: '363', kind: 'loan',
    club: 'Chelsea U21', league: 'eng.1', pos: 'M',
    note: '인디펜디엔테 델 바예에서 영입한 공격형 미드필더.',
    checked: '2026-09-16',
  },
];

export const futureFor = (teamId: string) => FUTURE.filter((p) => p.parentTeamId === teamId);
