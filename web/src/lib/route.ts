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
