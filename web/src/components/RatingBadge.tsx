import { fmtRating, ratingTier } from '../lib/rating';

/** 평점 배지 — 숫자 + 구간 색 (lib/rating.ts) */
export function RatingBadge({ v, cls, title }: { v?: number; cls?: string; title?: string }) {
  if (v == null || !Number.isFinite(v)) return null;
  return (
    <span className={`rtg${cls ? ` ${cls}` : ''}`} data-tier={ratingTier(v)} title={title}>
      {fmtRating(v)}
    </span>
  );
}
