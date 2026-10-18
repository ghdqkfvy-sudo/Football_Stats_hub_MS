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
  number?,                // 경고
  number?,                // 퇴장
  (string | null)?,       // 교체 선수가 **누구 대신** 들어왔나 (나간 선수 id · 경기 요약의 교체 기록)
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
   * 지금 팀 로스터(ESPN /teams/{id}/roster)에 있나. false = 시즌 중 떠난 선수(이적·임대)나
   * 1군 밖 유스 — 선수 목록·베스트 11 에서 뺀다. 판단할 수 없었으면(대표팀·응답 실패) 없다.
   */
  onRoster?: boolean;
  /**
   * ESPN 팀 로스터(`/teams/{id}/roster`)가 알려 준 실제 헤드샷 주소.
   * 축구는 **일부 선수만** 사진이 있고, 그 사실을 알려 주는 응답이 여기
   * 하나뿐이다(경기 로스터·선수 프로필에는 사진 필드 자체가 없다).
   */
  photo?: string;
  /**
   * 그 사진이 어디서 온 것인지.
   *
   * ⚠️ 이게 필요한 이유: 위키백과 대표 이미지는 **헤드샷이 아니다**.
   * 250px 경기 사진이라 44px 원형 칩에 `object-fit: cover` 로 넣으면
   * 얼굴이 아니라 잔디와 유니폼이 보인다(뉴캐슬·맨유가 그랬다).
   * TheSportsDB 컷아웃은 배경을 딴 상반신이라 가운데 정렬이 맞고,
   * 경기 사진은 위쪽을 보여 줘야 얼굴이 걸린다 — 화면이 그걸 구분해야 한다.
   */
  photoKind?: 'cutout' | 'thumb' | 'espn' | 'wiki';
  /** SofaScore 선수 ID — 있으면 사진 1순위(앱이 주소를 만든다). 안 뜨면 photo 로 */
  sofascoreId?: string;
  /**
   * 팀 로스터가 주는 시즌 포지션 약어(대개 G/D/M/F).
   * 경기 요약이 자리 약어(CD-L 등)를 안 주는 팀·대회가 있어서, 그때
   * 줄 배치라도 맞추기 위한 대비책이다.
   */
  posAbbr?: string;
  /** 팀 로스터가 주는 나이 */
  age?: number;
  /** 팀 로스터가 주는 국적 — 이름 · 3글자 약어 · 국기 주소 (2026-10 부터 수집) */
  nat?: Nationality;
  /** 부상 — FotMob 스쿼드의 injury (2026-10 부터 수집). 없으면 정상 */
  inj?: Injury;
  /** FotMob 시즌 평균 평점 */
  rating?: number;
  /** 다음 경기 징계 — FotMob 결장자 type=suspension (경기 시각 utc 로 일정과 맞춘다) */
  sus?: {
    ret?: string | null; utc?: string | null; league?: string | null; source?: string;
    /** 징계로 못 뛰는 경기들 (FotMob 앞으로 4경기 결장자에서) */
    games?: { utc: string | null; league?: string | null }[];
    /** 확인한 마지막 경기 시각 — 그 뒤는 정지인지 모른다 */
    checkedUntil?: string | null;
  };
}

export interface Nationality { name?: string; code?: string; flag?: string }

/** 부상 — 수집기가 복귀 예상 문구를 한국어로 옮겨 둔다(scripts/lib/injuries.mjs) */
export interface Injury {
  /** 원문 — "Mid November 2026" · "Doubtful" */
  ret?: string | null;
  /** 한국어 — "11월 중순 복귀 예상" · "출전 불투명" */
  ko: string;
  /** 다쳤지만 뛸 수도 있다 */
  doubtful?: boolean;
  /** 장기 부상 — 복귀 예상까지 4주 넘게 남음 · 몇 달 · 시즌 아웃 */
  long?: boolean;
  /** FotMob 부상 종류 번호 */
  kind?: string | null;
  /** 부상명 — 번호를 한국어로(햄스트링 · 십자인대 …), 표에 없는 번호는 FotMob 영어 이름 */
  injName?: string | null;
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
  /** 그 경기 FotMob 평점 (선수 id → 평점) — 정적 피드의 matchRatings 를 앱이 붙인다 */
  ratings?: Record<string, number>;
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
  /** 대회 앰블럼 (API 가 준 주소) */
  logo?: string;
  apps: number; starts: number; minutes: number;
  goals: number; assists: number; yellow: number; red: number;
}

export interface KoreanGame {
  /** ESPN 경기 id — 선발/교체 시각을 경기 로스터에서 채울 때 쓴다 */
  eventId?: string;
  competition: string;
  result: 'W' | 'D' | 'L';
  opponentId: string;
  opponent: string;
  score: string;
  /**
   * 선발 여부 · 출전 시간 · 교체 투입 분.
   * gamelog 에는 이 정보가 없어서 경기 로스터에서 따로 채운다.
   * 못 채우면 undefined — 화면은 "기록 없음" 으로 둔다(0분으로 꾸미지 않는다).
   */
  started?: boolean;
  minutes?: number;
  subIn?: number;
  goals: number;
  assists: number;
  yellow?: boolean;
  /** FotMob 경기 평점 */
  rating?: number;
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
  /** 사진 출처 — 경기 사진은 위쪽을 보여 줘야 얼굴이 걸린다 (AthleteInfo 참고) */
  photoKind?: 'cutout' | 'thumb' | 'espn' | 'wiki';
  /** SofaScore 선수 ID — 있으면 사진 1순위(앱이 주소를 만든다). 안 뜨면 photo 로 */
  sofascoreId?: string;
  /** 소속 리그 앰블럼 — core 리그 객체의 logos(dark) 에서 받아 온다 */
  leagueLogo?: string;
  stats: KoreanStat[];
  recent: KoreanGame[];
  /** FotMob 시즌 평균 평점 */
  rating?: number;
  /** A매치 — 스냅샷이 대표팀 경기 라인업에서 모은다 (scripts/lib/national.mjs) */
  national?: KoreanNational;
}

/** 대표팀 기록 — 합계는 그해(year) 경기만, 최근 경기는 연도 무관 마지막 3경기 */
export interface KoreanNational {
  year: number;
  apps: number;
  starts: number;
  goals: number;
  assists: number;
  recent: KoreanGame[];
}

/** 부상자 명단 한 줄 — 팀의 FotMob 부상 선수 전부(경기에 안 나온 장기 부상자 포함) */
export interface InjuryEntry extends Injury {
  name: string;
  /** 우리(ESPN) 선수와 맞춘 경우 — 상세 카드를 열 수 있다 */
  espnId?: string | null;
  /** FotMob 선수 id — 사진 대비책 */
  fm?: string | null;
  jersey?: number | null;
  pos?: 'G' | 'D' | 'M' | 'F' | null;
  age?: number | null;
  nat?: Nationality | null;
}
