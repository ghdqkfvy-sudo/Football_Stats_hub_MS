/** 정적 피드·프록시가 돌려주는 값의 도메인 타입 (데이터 자체는 어디에도 박아 두지 않는다) */

/**
 * [athleteId, formationPlace(0=미출전), starter, 교체투입 분, 교체아웃 분, 골, 도움, 포지션약어]
 *
 * 마지막 칸은 ESPN 이 경기별 로스터에 주는 실제 자리 약어다
 * (`G` / `LB` / `CD-L` / `CD-R` / `RB` / `LM` / `RM` / `AM-L` / `AM` / `AM-R` / `F` …).
 * 역할과 좌우가 약어 안에 그대로 들어 있어, 팀마다 뜻이 달라지는
 * formationPlace 숫자보다 훨씬 믿을 만한 배치 근거다.
 */
export type LineupEntry = [
  string,                 // athleteId
  number,                 // formationPlace (0 = 미출전)
  boolean,                // starter
  (number | null)?,       // 교체 투입 분 — core 로스터의 subbedIn.clock (없으면 null)
  (number | null)?,       // 교체 아웃 분 — core 로스터의 subbedOut.clock (없으면 null)
  number?,                // 골
  number?,                // 도움
  string?,                // 포지션 약어
];

export interface AthleteInfo {
  name: string;
  jersey: number;
  pos: 'G' | 'D' | 'M' | 'F';
  /**
   * ESPN 선수 시즌 통계(`/athletes/{id}/statistics`)의 실제 누적 출전 시간(분).
   * 경기별 교체 시각(subbedIn/OutAtMinute)은 필드명이 검증되지 않아 신뢰할 수
   * 없으므로, 이미 검증된(코리안리거 집계에도 쓰는) 이 값이 있으면 우선한다.
   */
  minutesSeason?: number;
  /**
   * ESPN 팀 로스터(`/teams/{id}/roster`)가 알려 준 실제 헤드샷 주소.
   * 축구는 **일부 선수만** 사진이 있고, 그 사실을 알려 주는 응답이 여기
   * 하나뿐이다(경기 로스터·선수 프로필에는 사진 필드 자체가 없다).
   */
  photo?: string;
  /**
   * 팀 로스터가 주는 시즌 포지션 약어(대개 G/D/M/F).
   * 경기 요약이 자리 약어(CD-L 등)를 안 주는 팀·대회가 있어서, 그때
   * 줄 배치라도 맞추기 위한 대비책이다.
   */
  posAbbr?: string;
}

export interface Lineup {
  teamId: string;
  formation: string;
  entries: LineupEntry[];
  /**
   * 선수별 골·도움을 직접 들고 있는지.
   * false 면 집계가 득점 이벤트 이름 매칭으로 내려간다(정확도가 떨어진다).
   */
  hasStats?: boolean;
  /**
   * 교체 시각(core 경기 로스터)을 실제로 받아 넣었는지.
   * false 면 경기별 출전 시간은 어림값이므로 시즌 누적값을 대신 쓴다.
   */
  hasMinutes?: boolean;
}

export interface Article {
  id: string;
  headline: string;
  description: string;
  published: string;
  type: string;
  byline?: string;
  href: string;
  image?: string;
  source: 'espn' | 'ko';
  publisher?: string;
}

export interface KoreanStat {
  competition: string;
  label: string;
  apps: number; starts: number; minutes: number;
  goals: number; assists: number; yellow: number; red: number;
}

export interface KoreanGame {
  competition: string;
  result: 'W' | 'D' | 'L';
  opponentId: string;
  opponent: string;
  score: string;
  started: boolean;
  minutes: number;
  goals: number;
  assists: number;
  yellow?: boolean;
}

export interface KoreanPlayer {
  id: string;
  name: string;
  nameKo: string;
  pos: 'G' | 'D' | 'M' | 'F';
  age: number;
  clubId: string;
  club: string;
  league: string;
  leagueName: string;
  /** 소속팀 로스터가 알려 준 실제 헤드샷 주소 (없는 선수도 많다) */
  photo?: string;
  stats: KoreanStat[];
  recent: KoreanGame[];
}
