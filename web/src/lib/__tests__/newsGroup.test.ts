import { describe, expect, it } from 'vitest';
import { groupStories, similarity } from '../newsGroup';
import type { Article } from '../../types/feedTypes';

const art = (id: string, headline: string): Article => ({
  id, headline, description: '', published: '', type: 'Story', href: '#', source: 'ko',
});

describe('similarity', () => {
  it('띄어쓰기·문장부호가 달라도 같은 제목은 높다', () => {
    expect(similarity('SC제일은행, 리버풀 FC와 자산관리 캠페인', 'SC제일은행 리버풀FC와 자산관리 캠페인')).toBeGreaterThan(0.8);
  });
  it('다른 소식은 낮다', () => {
    expect(similarity('Vinicius red card vs Villarreal', 'Bellingham hits new heights for England')).toBeLessThan(0.3);
  });
});

describe('groupStories', () => {
  it('같은 소식은 최신 기사 아래로 묶고 순서는 지킨다', () => {
    const g = groupStories([
      art('1', 'SC제일은행, 리버풀 FC와 자산관리 캠페인'),
      art('2', '리버풀, 맨시티에 0-3 패배'),
      art('3', 'SC제일은행, 리버풀 FC와 자산관리 캠페인...12개 시장서 동시 진행'),
    ]);
    expect(g.map((s) => s.lead.id)).toEqual(['1', '2']);
    expect(g[0].related.map((a) => a.id)).toEqual(['3']);
  });
});
