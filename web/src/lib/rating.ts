/**
 * FotMob 평점 표시 규칙 — 색 구간은 FotMob 과 같은 감각으로:
 * 8.0 이상 파랑 · 7점대 초록 · 6점대 주황 · 6.0 미만 빨강.
 */
export type RatingTier = 'top' | 'good' | 'mid' | 'low';

export function ratingTier(v: number): RatingTier {
  if (v >= 8) return 'top';
  if (v >= 7) return 'good';
  if (v >= 6) return 'mid';
  return 'low';
}

/** 7.05 → "7.1" · 경기 평점 7 → "7.0" */
export const fmtRating = (v: number) => v.toFixed(1);
