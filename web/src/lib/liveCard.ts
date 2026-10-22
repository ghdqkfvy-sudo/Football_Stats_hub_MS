import type { LiveEvent, LiveMatch, LivePlayer, LiveSide } from '../types/feedTypes';

/**
 * 오늘의 경기 호버 카드 · 칩 전환에 쓰는 계산 (2026-10-22). 화면 없는 순수 함수만.
 */
type Goal = Extract<LiveEvent, { t: 'goal' }>;

/** 지금 경기 시계(분) — 끝났으면 90, 킥오프 전이면 0, 진행 중이면 "67'" · "45+2'" 의 앞 숫자 */
export function clockMin(live: Pick<LiveMatch, 'phase' | 'clock'>): number {
  if (live.phase === 'done') return 90;
  if (live.phase !== 'live') return 0;
  const n = parseInt(String(live.clock ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

/** 이 경기에서 뛴 분 — 선발이면 0분부터, 교체면 들어온 분부터 나간 분(없으면 지금)까지. 안 뛰었으면 null */
export function playedMin(p: LivePlayer, starter: boolean, live: Pick<LiveMatch, 'phase' | 'clock'>): number | null {
  const from = starter ? 0 : p.in;
  if (from == null) return null;
  const to = p.out ?? Math.max(clockMin(live), from);
  return Math.max(0, Math.min(to, 90) - Math.min(from, 90));
}

/** 그 분까지의 스코어 [홈, 원정] — 골 사건의 newScore 를 믿고, 없으면 쪽별로 센다 */
export function scoreAt(events: LiveEvent[], min: number): [number, number] {
  let s: [number, number] = [0, 0];
  const goals = events.filter((e): e is Goal => e.t === 'goal' && e.min <= min);
  for (const g of goals) {
    if (Array.isArray(g.score) && g.score.length === 2) s = [g.score[0], g.score[1]];
    else s = g.side === 'home' ? [s[0] + 1, s[1]] : [s[0], s[1] + 1];
  }
  return s;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** 그 선수의 골 · 도움 분 — 골은 선수 id 로, 도움은 이름(FotMob 이 도움을 이름으로만 준다)으로 */
export function contributions(events: LiveEvent[], p: Pick<LivePlayer, 'id' | 'name' | 'last'>): { goals: Goal[]; assists: Goal[] } {
  const goals = events.filter((e): e is Goal => e.t === 'goal' && !e.og && e.pid === p.id);
  const full = norm(p.name), last = norm(p.last);
  const assists = events.filter((e): e is Goal => e.t === 'goal' && !!e.assist && (norm(e.assist) === full || (!!last && norm(e.assist).endsWith(last))));
  return { goals, assists };
}

/** 그 자리를 거쳐 간 선수 — 선발 → 교체 → (또 교체) 순 */
export function slotChain(starter: LivePlayer, side: LiveSide, subs: Extract<LiveEvent, { t: 'sub' }>[]): LivePlayer[] {
  const out: LivePlayer[] = [starter];
  let cur = starter;
  for (let i = 0; i < 5; i++) {
    const s = subs.find((x) => x.outId === cur.id || (!x.outId && x.out === cur.name));
    const nxt = s && side.bench.find((b) => b.id === s.inId || b.name === s.in);
    if (!nxt || out.includes(nxt)) break;
    out.push(nxt);
    cur = nxt;
  }
  return out;
}

/** 경기 기록 — [이름, 값] 줄들(있는 것만). 호버 카드의 2열 표로 그린다 */
export function statPairs(st: LivePlayer['st']): [string, string][] {
  if (!st) return [];
  const out: [string, string][] = [];
  if (st.sh != null) out.push(['슈팅', `${st.sh}${st.sot != null ? ` (유효 ${st.sot})` : ''}`]);
  if (st.kp != null) out.push(['키패스', `${st.kp}`]);
  if (st.pa) out.push(['패스', `${st.pa[0]}/${st.pa[1]}${st.pa[1] ? ` · ${Math.round((st.pa[0] / st.pa[1]) * 100)}%` : ''}`]);
  if (st.xg != null) out.push(['xG', st.xg.toFixed(2)]);
  if (st.xa != null) out.push(['xA', st.xa.toFixed(2)]);
  if (st.tk != null) out.push(['태클', `${st.tk}`]);
  if (st.du) out.push(['경합 승', `${st.du[0]}/${st.du[1]}`]);
  if (st.rec != null) out.push(['리커버리', `${st.rec}`]);
  if (st.sv != null) out.push(['선방', `${st.sv}`]);
  if (st.dist != null) out.push(['뛴 거리', `${(st.dist / 1000).toFixed(1)}km`]);
  if (st.spd != null) out.push(['최고 속도', `${st.spd.toFixed(1)}km/h`]);
  return out;
}
