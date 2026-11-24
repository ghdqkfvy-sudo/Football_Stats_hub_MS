/**
 * FotMob 경기 상세의 포메이션 · 선수 좌표 → ESPN 식 자리 약어 (2026-11-25).
 *
 * 왜: 선수 탭(베스트 11)은 ESPN 라인업의 포메이션 · 자리 약어로 집계하는데, ESPN 이 대형을
 * 틀리게 줄 때가 있다. 레알 vs PSV(2026-11-24)를 ESPN 은 4-3-3(추아메니 CM)으로,
 * FotMob 은 4-2-3-1(추아메니 왼쪽 볼란치)로 줬다 — 오늘의 경기 탭(FotMob)과 선수 탭이 어긋났다.
 * 앱의 집계 로직은 ESPN 약어를 기준으로 짜여 있어서, FotMob 좌표를 같은 약어로 옮겨 쓴다.
 *
 * FotMob verticalLayout: y 가 작을수록 우리 골문 쪽(같은 줄은 y 가 같다), x 가 클수록 **왼쪽**
 * (레알 vs PSV: 왼쪽 풀백 쿠쿠레야 x .88, 오른쪽 풀백 발베르데 x .13).
 *
 * 약어는 ESPN 이 같은 대형에 주는 값에 맞춘다 — 특히 4-2-3-1 의 더블 볼란치는 ESPN 처럼 LM · RM
 * (앱이 이것을 LDM · RDM 으로 읽고, 두 자리를 한 묶음으로 센다).
 */

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** 줄 하나의 약어 — 왼쪽부터 */
function rowAbbrs(kind, n, ctx) {
  if (kind === 'G') return n === 1 ? ['G'] : null;
  if (kind === 'D') {
    return { 3: ['CD-L', 'CD', 'CD-R'], 4: ['LB', 'CD-L', 'CD-R', 'RB'], 5: ['LB', 'CD-L', 'CD', 'CD-R', 'RB'] }[n] ?? null;
  }
  if (kind === 'F') return { 1: ['F'], 2: ['CF-L', 'CF-R'], 3: ['LF', 'F', 'RF'] }[n] ?? null;
  /* 미드필드 줄 — 몇 번째 중원 줄인가(deep: 맨 아래, top: 맨 위, only: 하나뿐) */
  const { place } = ctx;
  if (n === 1) return place === 'top' ? ['AM'] : place === 'deep' ? ['DM'] : ['CM'];
  if (n === 2) {
    if (place === 'top') return ['AM-L', 'AM-R'];
    /* 더블 볼란치 — ESPN 과 같은 LM · RM */
    if (place === 'deep') return ['LM', 'RM'];
    return ['CM-L', 'CM-R'];
  }
  if (n === 3) return place === 'top' ? ['AM-L', 'AM', 'AM-R'] : ['CM-L', 'CM', 'CM-R'];
  if (n === 4) return ['LM', 'CM-L', 'CM-R', 'RM'];
  if (n === 5) return ['LM', 'CM-L', 'CM', 'CM-R', 'RM'];
  return null;
}

/**
 * @param details FotMob matchDetails 응답
 * @param fm 우리 팀 FotMob id
 * @returns {{ formation: string, players: { id: string, name: string, abbr: string }[] } | null}
 *   선발 11명 전원의 약어를 정할 수 없으면 null — 어설프게 섞지 않는다.
 */
export function lineupShape(details, fm) {
  const lu = details?.content?.lineup ?? details?.lineup;
  const side = [lu?.homeTeam, lu?.awayTeam].find((s) => s && String(s.id) === String(fm));
  const formation = String(side?.formation ?? '').trim();
  const parts = formation.split('-').map(Number);
  if (!formation || !parts.length || parts.some((n) => !Number.isInteger(n) || n < 1)) return null;

  const starters = (side?.starters ?? [])
    .map((p) => ({ id: String(p?.id ?? ''), name: String(p?.name ?? ''), x: num(p?.verticalLayout?.x), y: num(p?.verticalLayout?.y) }))
    .filter((p) => p.name && p.x != null && p.y != null);
  const sizes = [1, ...parts];
  if (starters.length !== 11 || sizes.reduce((a, b) => a + b, 0) !== 11) return null;

  /* y 로 줄을 나눈다 — 같은 줄은 y 가 같다(조금의 차이는 허용) */
  starters.sort((a, b) => a.y - b.y);
  const rows = [];
  for (const p of starters) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].y - p.y) < 0.02) last.push(p);
    else rows.push([p]);
  }
  if (rows.length !== sizes.length || rows.some((r, i) => r.length !== sizes[i])) return null;

  const mids = rows.length - 3;   // 골키퍼 · 수비 · 최전방을 뺀 중원 줄 수
  const players = [];
  for (let i = 0; i < rows.length; i++) {
    const kind = i === 0 ? 'G' : i === 1 ? 'D' : i === rows.length - 1 ? 'F' : 'M';
    const mi = i - 2;
    const place = mids === 1 ? 'only' : mi === 0 ? 'deep' : mi === mids - 1 ? 'top' : 'mid';
    const abbrs = rowAbbrs(kind, rows[i].length, { place });
    if (!abbrs) return null;
    /* x 가 클수록 왼쪽 — 왼쪽부터 약어를 붙인다 */
    [...rows[i]].sort((a, b) => b.x - a.x).forEach((p, k) => players.push({ id: p.id, name: p.name, abbr: abbrs[k] }));
  }
  return { formation, players };
}
