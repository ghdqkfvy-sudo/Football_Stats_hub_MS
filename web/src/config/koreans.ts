/**
 * 코리안리거 — **명단과 정렬 규칙만** 둔다. 기록은 하나도 두지 않는다.
 *
 * "누구를 코리안리거로 볼 것인가" 는 API 가 답해 주지 않는 편집 판단이라
 * 설정으로 남기고, 소속팀·출전·골·도움·최근 경기는 전부 athleteId 로
 * ESPN 에서 받아 온다(`scripts/snapshot.mjs` → `/data/koreans.json`).
 *
 * ID 찾는 법 (실제로 되는 경로):
 *   https://site.web.api.espn.com/apis/search/v2?query=Hwang%20Hee-Chan
 * 결과의 `uid: "s:600~a:237224"` 에서 뒤 숫자가 athleteId 이고,
 * `subtitle` 이 현재 소속팀이라 동명이인을 가려낼 수 있다.
 * (팀 로스터 응답으로 찾으려 하면 20명에서 잘려 수비수·공격수가 빠진다)
 *
 * ⚠️ 이 목록은 2026-09-16 에 위 검색으로 **한 명씩 다시 확인**했다.
 * 그 전 값은 대부분 틀려 있었다 — 297985 는 이재성이 아니라 Imam Jagne,
 * 310166 은 정우영이 아니라 Melih Aşkar 였다. 이름만 보고 짐작하면 안 된다.
 */

export interface KoreanSeed {
  id: string;
  /** 한국어 표기 — ESPN 은 로마자만 준다 */
  nameKo: string;
}

export const KOREAN_SEEDS: KoreanSeed[] = [
  { id: '149945', nameKo: '손흥민' },
  { id: '274197', nameKo: '이강인' },
  { id: '157688', nameKo: '김민재' },
  { id: '237224', nameKo: '황희찬' },
  { id: '134103', nameKo: '이재성' },
  { id: '276323', nameKo: '정우영' },
  { id: '271701', nameKo: '홍현석' },
  { id: '303464', nameKo: '조규성' },
  { id: '280061', nameKo: '황인범' },
  { id: '302434', nameKo: '오현규' },
  { id: '256598', nameKo: '백승호' },
  { id: '362208', nameKo: '배준호' },
  { id: '302793', nameKo: '설영우' },
  { id: '304793', nameKo: '옌스 카스트로프' },
  { id: '297791', nameKo: '엄지성' },
  { id: '297788', nameKo: '이한범' },
  { id: '346774', nameKo: '이현주' },
  { id: '371578', nameKo: '양민혁' },
  { id: '350711', nameKo: '양현준' },
  { id: '388617', nameKo: '김민수' },
  { id: '362203', nameKo: '김지수' },
];

/** 상단 고정 — 손흥민 · 이강인 · 김민재 */
export const PINNED = ['149945', '274197', '157688'];

/**
 * 리그 강도 순서. 분데스리가를 먼저 두고 그다음부터 강한 리그 → 약한 리그.
 * 같은 리그 선수끼리 붙어서 나온다.
 */
export const LEAGUE_ORDER: Record<string, number> = {
  'ger.1': 0, 'esp.1': 1, 'eng.1': 2, 'ita.1': 3, 'fra.1': 4,
  'por.1': 5, 'ned.1': 6, 'bel.1': 7, 'tur.1': 8, 'sco.1': 9,
  'den.1': 10, 'eng.2': 11, 'usa.1': 12,
};

/**
 * ESPN 선수 헤드샷의 관용 주소.
 * 팀 로스터가 알려 준 실제 주소(`AthleteInfo.photo`)가 없을 때만 쓰는
 * 추측값이다 — 사진이 없는 선수는 404 가 나고 배지로 떨어진다.
 */
export const headshot = (athleteId: string) =>
  `https://a.espncdn.com/i/headshots/soccer/players/full/${athleteId}.png`;
