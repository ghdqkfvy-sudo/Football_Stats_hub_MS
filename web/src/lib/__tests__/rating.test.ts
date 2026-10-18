import { describe, expect, it } from 'vitest';
import { fmtRating, ratingTier } from '../rating';

describe('평점 색 구간', () => {
  it('보이는 숫자 기준 — 6.96 은 "7.0" 이고 초록', () => {
    expect(fmtRating(6.96)).toBe('7.0');
    expect(ratingTier(6.96)).toBe('good');
    expect(ratingTier(6.94)).toBe('mid');
    expect(ratingTier(7.96)).toBe('top');
    expect(ratingTier(8.96)).toBe('elite');
    expect(ratingTier(9.4)).toBe('elite');
    expect(ratingTier(5.94)).toBe('low');
  });
});
