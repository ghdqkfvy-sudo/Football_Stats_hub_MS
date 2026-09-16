/** 정규화된 도메인 타입 — ESPN 원본 스키마를 앱 전체에서 격리한다. */

export type CompetitionKey =
  | 'esp.1' | 'eng.1'
  | 'uefa.champions' | 'uefa.europa' | 'uefa.europa.conf'
  | 'esp.copa_del_rey' | 'esp.super_cup'
  | 'eng.fa' | 'eng.league_cup'
  | 'fifa.friendly' | 'club.friendly'
  | 'fifa.world' | 'fifa.worldq.afc' | 'afc.asian.cup'
  | 'uefa.super_cup' | 'fifa.cwc'
  | (string & {});

export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed';

export interface TeamRef {
  id: string;
  name: string;        // 표시용 (한국어 우선)
  shortName: string;
  abbr: string;
  logo: string;
  rank?: number;       // 해당 대회 순위 (있을 때)
  record?: string;     // "3승 1무 0패"
}

export interface GoalEvent {
  minute: number;
  clock: string;       // "45+2'"
  teamId: string;
  scorer: string;
  assist?: string;
  ownGoal: boolean;
  penalty: boolean;
}

export interface Match {
  id: string;
  /** ESPN이 주는 UTC ISO 문자열. 표시 직전에만 KST로 변환한다. */
  kickoffUtc: string;
  competition: CompetitionKey;
  competitionName: string;
  round?: string;      // "MATCHDAY 4", "League Phase 2"
  venue?: string;
  status: MatchStatus;
  statusDetail?: string;
  home: TeamRef;
  away: TeamRef;
  homeScore?: number;
  awayScore?: number;
  homePens?: number;
  awayPens?: number;
  goals: GoalEvent[];
  /** 득점 이벤트를 아직 못 불러온 상태 (지연 로딩용) */
  goalsLoaded: boolean;
  /**
   * 킥오프 시각이 아직 정해지지 않았다(ESPN `competitions[0].timeValid === false`).
   * 이때 ESPN 은 날짜만 맞추고 시각은 임의값으로 채워 보내므로, 그대로
   * 표시하면 "전부 오후 5시" 처럼 보인다. 이런 경기는 TBD 로 적는다.
   */
  timeTBD?: boolean;
  /**
   * 경기별 선수 기록(양 팀) — ESPN 요약 응답의 rosters 에서 모은 값이다.
   * 스코어보드 details 는 득점자만 주므로, **도움**은 이 경로에서만 온다.
   */
  playerStats?: {
    id?: string;
    teamId: string;
    name: string;
    g: number;
    a: number;
    /** 투입 분 (선발 0, 모르면 null) — 도움을 골에 배정할 때 쓴다 */
    in?: number | null;
    /** 교체 아웃 분 (끝까지 뛰었으면 null) */
    out?: number | null;
  }[];
}

export interface StandingRow {
  rank: number;
  team: TeamRef;
  played: number;
  win: number;
  draw: number;
  loss: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  form: ('W' | 'D' | 'L')[];
}

export interface StandingTable {
  competition: CompetitionKey;
  competitionName: string;
  groupName?: string;
  rows: StandingRow[];
  /** ESPN 원본이 불완전해 경기 결과로 재계산했는지 여부 */
  derived: boolean;
  updatedAt: string;
}

export type ResultOf = 'W' | 'D' | 'L';
