/**
 * 일정 · 리그 파일 다이어트 — ESPN 이벤트에서 **앱이 읽지 않는 덩어리**를 떼고 저장한다.
 *
 * schedule-*.json 한 개가 500KB 였는데 그 3분의 2가 링크 목록이었다(경기마다 ESPN 기사 · 팀 페이지
 * 주소 수십 개). 배당 · 중계 · 티켓도 화면 어디에도 쓰이지 않는다. Summary 는 이런 파일을 열 개 받는다.
 *
 * 뗄 것만 이름으로 적는다(남길 것을 적는 방식이면 ESPN 이 필드를 더할 때마다 화면이 깨진다).
 * 원본은 건드리지 않고 복사본을 돌려준다 — 수집기가 같은 객체를 뒤에서 더 쓴다.
 */
const EVENT_DROP = new Set(['links']);
const COMPETITION_DROP = new Set(['odds', 'broadcasts', 'geoBroadcasts', 'tickets', 'highlights', 'headlines']);
const TEAM_DROP = new Set(['links']);

const without = (obj, drop) => Object.fromEntries(Object.entries(obj).filter(([k]) => !drop.has(k)));

export function slimEvent(ev) {
  if (!ev || typeof ev !== 'object') return ev;
  const out = without(ev, EVENT_DROP);
  if (Array.isArray(ev.competitions)) {
    out.competitions = ev.competitions.map((c) => {
      if (!c || typeof c !== 'object') return c;
      const cc = without(c, COMPETITION_DROP);
      if (Array.isArray(c.competitors)) {
        cc.competitors = c.competitors.map((x) => (x?.team && typeof x.team === 'object'
          ? { ...x, team: without(x.team, TEAM_DROP) }
          : x));
      }
      return cc;
    });
  }
  return out;
}

/** 저장 직전에 — events 배열이 있는 파일만 줄인다. 나머지 파일은 그대로 */
export function slimFeed(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.events)) return data;
  return { ...data, events: data.events.map(slimEvent) };
}
