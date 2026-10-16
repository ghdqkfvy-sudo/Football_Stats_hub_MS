/**
 * 사진 소스 비교 (시험) — FotMob · SofaScore 선수 이미지를 지금 사진과 나란히 띄워 본다.
 *
 * ⚠️ **보기 전용**이다. 수집기·데이터 파일을 전혀 건드리지 않는다 — 지금 받아 둔
 * 컷아웃(TheSportsDB)은 그대로다. 대안 소스가 쓸 만한지 폰에서 눈으로 확인하려는 것.
 *
 * 두 서비스 모두 이미지 주소는 단순하지만 **선수 ID** 가 필요하다. 그 ID 를 찾는 각
 * 서비스의 API 는 비공식이고 잘 막히므로, 공식 API 인 위키데이터에서 찾는다:
 *   1) 선수 이름 → 위키데이터 항목(축구 선수만)
 *   2) 항목의 외부 ID 속성 → FotMob · SofaScore 선수 ID
 * 속성 번호(P…)는 박아 두지 않는다 — 실행할 때 속성 이름으로 찾는다.
 */

const WD = 'https://www.wikidata.org/w/api.php';

export const fotmobImage = (id: string) => `https://images.fotmob.com/image_resources/playerimages/${id}.png`;
export const sofascoreImage = (id: string) => `https://img.sofascore.com/api/v1/player/${id}/image`;

interface WdSearchHit { id: string; label?: string; description?: string }

/** 이름 검색 결과에서 축구 선수 항목을 고른다 (설명에 football/soccer) */
export function pickFootballer(hits: WdSearchHit[] | undefined): string | null {
  const list = hits ?? [];
  const hit = list.find((h) => /football|soccer|축구/i.test(h.description ?? ''));
  return hit?.id ?? null;
}

/** 항목의 claims 에서 그 속성의 첫 문자열 값 */
export function claimValue(entity: unknown, prop: string | null): string | null {
  if (!prop) return null;
  const claims = (entity as { claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]> })?.claims;
  const v = claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

const wd = async (params: Record<string, string>, signal?: AbortSignal): Promise<any> => {
  const q = new URLSearchParams({ format: 'json', origin: '*', ...params });
  const res = await fetch(`${WD}?${q}`, { signal });
  if (!res.ok) throw new Error(`위키데이터 HTTP ${res.status}`);
  return res.json();
};

export interface ProbeProps { fotmob: string | null; sofascore: string | null }

/** 외부 ID 속성 번호를 이름으로 찾는다 (예: "FotMob player ID" → P…) */
export async function findProps(signal?: AbortSignal): Promise<ProbeProps> {
  const find = async (label: string, must: RegExp) => {
    const j = await wd({ action: 'wbsearchentities', type: 'property', language: 'en', limit: '7', search: label }, signal);
    const hit = (j?.search as WdSearchHit[] | undefined)?.find((h) => must.test(h.label ?? ''));
    return hit?.id ?? null;
  };
  const [fotmob, sofascore] = await Promise.all([
    find('FotMob player ID', /fotmob.*player/i),
    find('Sofascore player ID', /sofascore.*player/i),
  ]);
  return { fotmob, sofascore };
}

export interface ProbeIds { qid: string | null; fotmob: string | null; sofascore: string | null }

/** 선수 한 명 — 위키데이터 항목과 두 서비스 ID */
export async function findIds(name: string, props: ProbeProps, signal?: AbortSignal): Promise<ProbeIds> {
  const s = await wd({ action: 'wbsearchentities', type: 'item', language: 'en', limit: '7', search: name }, signal);
  const qid = pickFootballer(s?.search);
  if (!qid) return { qid: null, fotmob: null, sofascore: null };
  const e = await wd({ action: 'wbgetentities', ids: qid, props: 'claims' }, signal);
  const ent = e?.entities?.[qid];
  return { qid, fotmob: claimValue(ent, props.fotmob), sofascore: claimValue(ent, props.sofascore) };
}
