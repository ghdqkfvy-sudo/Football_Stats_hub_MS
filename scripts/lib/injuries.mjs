/**
 * 부상 정보 — FotMob 팀 API 의 스쿼드 `injury` (2026-10-17 소스 비교에서 9팀 모두 응답).
 *
 * ESPN · SofaScore · Transfermarkt · 판타지들은 비었거나 막혔다(scripts/probe-injuries.mjs).
 * FotMob 은 선수 이름 · 부상 종류 번호 · 복귀 예상("Mid November 2026") 을 준다.
 * 우리 데이터는 ESPN 선수 id 라서 **이름으로** 맞춘다.
 *
 * 네트워크 없이 도는 순수 함수만 여기 둔다.
 */

/** 이름 비교용 — 악센트·대소문자·기호를 지운다 (Álex Baena → alex baena) */
export function normName(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o').replace(/ß/g, 'ss').replace(/ł/gi, 'l')
    .toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/[-\s]+/g, ' ').trim();
}

const lastOf = (n) => n.split(' ').slice(-1)[0];
const firstOf = (n) => n.split(' ')[0];

/**
 * FotMob 부상 선수 → ESPN 선수 id.
 *  1) 이름 전체가 같다
 *  2) 성이 같고 이름 첫 글자가 같다 (Vini Jr. 같은 예외는 놓쳐도 된다 — 지어내지 않는다)
 *  3) 성이 같은 선수가 그 팀에 한 명뿐이다
 * @param injured  [{ name, injury: { expectedReturn } }]
 * @param athletes { espnId: { name } }
 * @returns Map<espnId, member>
 */
export function matchInjured(injured, athletes) {
  const rows = Object.entries(athletes ?? {}).map(([id, a]) => ({ id, n: normName(a?.name) })).filter((r) => r.n);
  const out = new Map();
  for (const m of injured ?? []) {
    const n = normName(m?.name);
    if (!n) continue;
    let hit = rows.find((r) => r.n === n);
    if (!hit) {
      const sameLast = rows.filter((r) => lastOf(r.n) === lastOf(n));
      hit = sameLast.find((r) => firstOf(r.n)[0] === firstOf(n)[0]) ?? (sameLast.length === 1 ? sameLast[0] : undefined);
    }
    if (hit && !out.has(hit.id)) out.set(hit.id, m);
  }
  return out;
}

const MONTH = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const PART = { early: '초', mid: '중순', late: '말' };

/**
 * 복귀 예상 문구 → 한국어.
 * @returns { ko, doubtful } — doubtful 이면 "출전 불투명"(다쳤지만 뛸 수도 있다)
 */
export function returnKo(text) {
  const t = String(text ?? '').trim();
  if (!t) return { ko: '복귀 시점 미정', doubtful: false };
  const m = t.match(/^(early|mid|late)\s+([a-z]+)(?:\s+(\d{4}))?$/i);
  if (m && MONTH[m[2].toLowerCase()]) return { ko: `${MONTH[m[2].toLowerCase()]}월 ${PART[m[1].toLowerCase()]} 복귀 예상`, doubtful: false };
  if (/^doubtful/i.test(t)) return { ko: '출전 불투명', doubtful: true };
  if (/few days/i.test(t)) return { ko: '며칠 뒤 복귀 예상', doubtful: false };
  if (/few weeks/i.test(t)) return { ko: '몇 주 뒤 복귀 예상', doubtful: false };
  if (/few months/i.test(t)) return { ko: '몇 달 뒤 복귀 예상', doubtful: false };
  if (/season/i.test(t)) return { ko: '시즌 아웃', doubtful: false };
  if (/unknown|no return/i.test(t)) return { ko: '복귀 시점 미정', doubtful: false };
  return { ko: t, doubtful: false };
}

/** FotMob 팀 응답 → 부상 표시가 있는 스쿼드 선수들 */
export function injuredMembers(json) {
  const groups = json?.squad?.squad ?? json?.squad ?? [];
  const out = [];
  for (const g of Array.isArray(groups) ? groups : []) {
    for (const m of g?.members ?? []) if (m?.injury) out.push(m);
  }
  return out;
}

/** 스쿼드 응답이 정상인가 — 선수가 너무 적으면(응답 모양이 바뀜) 판단하지 않는다 */
export function squadSize(json) {
  const groups = json?.squad?.squad ?? json?.squad ?? [];
  return (Array.isArray(groups) ? groups : []).reduce((s, g) => s + (g?.members?.length ?? 0), 0);
}
