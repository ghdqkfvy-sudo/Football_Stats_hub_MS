import type { Article } from '../types/feedTypes';

/**
 * 같은 소식을 다룬 기사 묶기.
 *
 * 한국어 피드는 같은 보도자료가 매체마다 거의 같은 제목으로 여러 번 들어온다
 * ("SC제일은행, 리버풀 FC와 자산관리 캠페인" × 3). 목록이 같은 말로 채워지면
 * 나머지 기사가 밀려 내려간다.
 *
 * 제목의 글자 2-그램 자카드 유사도로 잰다 — 띄어쓰기·조사가 달라도, 한글·영어
 * 어느 쪽이든 같은 방식으로 동작한다. 기준 0.5 는 실제 피드 7개(280건)에서 잰 값이다:
 * 0.5 이상은 전부 같은 기사(재전송·보도자료)였고, 0.3~0.45 에는 "같은 경기를 다룬
 * 다른 기사"(감독 인터뷰 vs 경기 리뷰)가 섞여 있어 묶으면 기사를 숨기게 된다.
 */
export const SAME_STORY = 0.5;

function bigrams(s: string): Set<string> {
  const t = s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

export function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const x of A) if (B.has(x)) both++;
  return both / (A.size + B.size - both);
}

export interface Story {
  /** 대표 기사 — 묶음에서 가장 먼저 온(=최신) 기사 */
  lead: Article;
  /** 같은 소식을 다룬 나머지 기사 */
  related: Article[];
}

/** 순서(최신순)를 지키며 묶는다. 각 기사는 앞에 나온 묶음의 대표 기사와만 비교한다. */
export function groupStories(list: Article[], threshold = SAME_STORY): Story[] {
  const out: (Story & { grams: string })[] = [];
  for (const a of list) {
    const hit = out.find((s) => similarity(s.grams, a.headline) >= threshold);
    if (hit) hit.related.push(a);
    else out.push({ lead: a, related: [], grams: a.headline });
  }
  return out.map(({ lead, related }) => ({ lead, related }));
}
