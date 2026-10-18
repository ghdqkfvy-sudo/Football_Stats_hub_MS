/**
 * FotMob 평점 표시 규칙 — 색 구간:
 * 9.0 이상 보라(빛) · 8점대 파랑(빛) · 7점대 초록 · 6점대 주황 · 6.0 미만 빨강.
 * 시즌 평균 · 경기 평점 모두 같은 구간이다(2026-10-18 요청: 8 · 9 이상을 따로 강조).
 */
export type RatingTier = 'elite' | 'top' | 'good' | 'mid' | 'low';

export function ratingTier(raw: number): RatingTier {
  /* 보이는 숫자(소수 한 자리)로 가른다 — 6.96 이 "7.0" 으로 보이면서 주황이면 어긋난다 */
  const v = Math.round(raw * 10) / 10;
  if (v >= 9) return 'elite';
  if (v >= 8) return 'top';
  if (v >= 7) return 'good';
  if (v >= 6) return 'mid';
  return 'low';
}

/** 시즌 평점 마우스 올림 문구 — 경기 평점 평균으로 채운 것이면 그렇게 적는다 */
export const seasonRatingTitle = (p: { rating?: number; ratingGames?: number }) =>
  p.ratingGames ? `FotMob 경기 평점 평균 (${p.ratingGames}경기) ${p.rating}` : `FotMob 시즌 평균 평점 ${p.rating}`;

/** 7.05 → "7.1" · 경기 평점 7 → "7.0" */
export const fmtRating = (v: number) => v.toFixed(1);
