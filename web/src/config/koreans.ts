/**
 * 코리안리거 — **명단과 정렬 규칙만** 둔다. 기록은 하나도 두지 않는다.
 *
 * "누구를 코리안리거로 볼 것인가" 는 API 가 답해 주지 않는 편집 판단이라
 * 설정으로 남기고, 소속팀·출전·골·도움·최근 경기는 전부 athleteId 로
 * ESPN 에서 받아 온다(`scripts/snapshot.mjs` → `/data/koreans.json`).
 *
 * ID 찾는 법: `/api/v1/find?q=이름` 의 uid `s:600~a:274197` 에서 뒤 숫자.
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
  { id: '297985', nameKo: '이재성' },
  { id: '310166', nameKo: '정우영' },
  { id: '346613', nameKo: '홍현석' },
  { id: '302132', nameKo: '황인범' },
  { id: '235297', nameKo: '황희찬' },
  { id: '311486', nameKo: '오현규' },
  { id: '256598', nameKo: '백승호' },
  { id: '362208', nameKo: '배준호' },
  { id: '303016', nameKo: '조규성' },
  { id: '321923', nameKo: '이한범' },
  { id: '347512', nameKo: '이현주' },
  { id: '393410', nameKo: '양민혁' },
  { id: '354283', nameKo: '양현준' },
  { id: '403147', nameKo: '김민수' },
  { id: '298402', nameKo: '김지수' },
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

/** ESPN 선수 헤드샷 */
export const headshot = (athleteId: string) =>
  `https://a.espncdn.com/i/headshots/soccer/players/full/${athleteId}.png`;
