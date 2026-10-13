/**
 * 주소(#해시) ↔ 화면 상태.
 *
 *   #/                     Summary
 *   #/chelsea/standings    첼시 · 팀 순위
 *
 * 왜 필요한가
 *  · 친구에게 "첼시 순위" 화면을 그대로 보낼 수 있다(링크를 열면 그 화면).
 *  · 새로고침해도 보던 화면에 남는다(예전에는 늘 Summary 로 돌아갔다).
 *  · 폰의 뒤로 가기가 **앱을 닫지 않고** 직전 화면으로 돌아간다.
 * 해시만 쓰므로 GitHub Pages 에서 서버 설정 없이 동작한다.
 */
export interface Route {
  targetId: string | null;   // null = Summary
  tab: string | null;
}

export function parseRoute(hash: string = typeof location !== 'undefined' ? location.hash : ''): Route {
  const [team, tab] = hash.replace(/^#\/?/, '').split('/').map((x) => decodeURIComponent(x || ''));
  return { targetId: team || null, tab: tab || null };
}

export function formatRoute(targetId: string | null, tab: string | null): string {
  return targetId ? `#/${targetId}${tab ? `/${tab}` : ''}` : '#/';
}

/*
 * 마지막으로 본 화면 기억 — 주소 없이(홈 화면 아이콘, 즐겨찾기한 첫 주소) 들어오면
 * 매번 Summary 에서 시작해 내 팀까지 다시 눌러 들어가야 했다.
 * 링크로 연 주소(#/chelsea/standings)가 있으면 그쪽이 언제나 이긴다.
 * 저장소는 사생활 모드 등에서 막힐 수 있다 — 실패하면 조용히 기억하지 않는다.
 */
const LAST_KEY = 'msh:last-route';

export function rememberRoute(hash: string): void {
  try { localStorage.setItem(LAST_KEY, hash); } catch { /* 저장 불가 — 기억하지 않는다 */ }
}

/** 시작 화면의 주소 — 지금 주소가 있으면 그것, 없으면 마지막으로 본 화면 */
export function startHash(): string {
  if (typeof location === 'undefined') return '';
  if (location.hash && location.hash !== '#') return location.hash;
  try { return localStorage.getItem(LAST_KEY) ?? ''; } catch { return ''; }
}
