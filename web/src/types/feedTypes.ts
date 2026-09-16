/** 정적 피드·프록시가 돌려주는 값의 도메인 타입 (데이터 자체는 어디에도 박아 두지 않는다) */

/** [athleteId, formationPlace(0=미출전), starter, 교체투입 분, 교체아웃 분, 골, 도움] */
export type LineupEntry = [string, number, boolean, number?, number?, number?, number?];

export interface AthleteInfo {
  name: string;
  jersey: number;
  pos: 'G' | 'D' | 'M' | 'F';
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
  stats: KoreanStat[];
  recent: KoreanGame[];
}
