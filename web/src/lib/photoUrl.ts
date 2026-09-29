/**
 * 사진 주소를 지금 살아 있는 호스트로 — 수집기(scripts/lib/photos.mjs
 * canonicalPhotoUrl)와 **같은 규칙**을 화면에서도 한 번 더 건다.
 *
 * 왜 두 번인가: 수집기를 고쳐도 이미 배포된 JSON 은 다음 회차까지 옛 주소를
 * 들고 있다. 2026-09-28 `www.thesportsdb.com/images/…` 가 브라우저에서 로드되지
 * 않게 되자(같은 파일이 r2.thesportsdb.com 에서는 뜬다) 맨유·뉴캐슬·토트넘
 * 헤드샷이 통째로 깨졌는데, 화면 쪽 규칙이 있으면 데이터가 늦어도 바로 산다.
 */
export function canonicalPhotoUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(/^https?:\/\/(www\.)?thesportsdb\.com\/images\//, 'https://r2.thesportsdb.com/images/');
}
