/**
 * 컵·유럽대항전 라운드 이름(ESPN calendar 라벨) → 한국어.
 * CupPath(컵 대진표)와 Summary 팀 비교(챔스 단계)가 같이 쓴다.
 * ESPN 은 같은 라운드를 "Round of 16" · "Rd of 16" 두 가지로 적는다(챔스 2026-27 실측).
 */
const ROUND_KO: Record<string, string> = {
  'preliminary round': '예선',
  'qualifying round': '예선',
  'first round': '1라운드',
  'second round': '2라운드',
  'third round': '3라운드',
  'fourth round': '4라운드',
  'fifth round': '5라운드',
  'sixth round': '6라운드',
  'league phase': '리그 페이즈',
  'knockout round playoffs': '플레이오프',
  'knockout round play-offs': '플레이오프',
  'round of 32': '32강',
  'rd of 32': '32강',
  'round of 16': '16강',
  'rd of 16': '16강',
  'quarterfinals': '8강',
  'quarter-finals': '8강',
  'semifinals': '4강',
  'semi-finals': '4강',
  'final': '결승',
  'third place': '3위 결정전',
};

export const roundKo = (label: string): string => ROUND_KO[label.trim().toLowerCase()] ?? label;

export const isLeaguePhase = (label: string): boolean => /league phase|group stage/i.test(label);
