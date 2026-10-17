/**
 * SofaScore 선수 ID — 위키데이터에서 찾는다.
 *
 * 2026-10-16 폰 시험(숨은 시트의 "사진 소스 비교"): 코리안리거 + 레알 30명 중
 * SofaScore 이미지 27장이 떴고, 위키데이터에서 ID 를 27명 찾았다(속성 P12302).
 * TheSportsDB 는 같은 날 시간 초과·404 로 사실상 못 쓰게 됐다.
 *
 * 그래서 사진 1순위가 SofaScore 다(2순위가 지금까지 받아 둔 컷아웃 · ESPN · 위키).
 * 수집기는 **ID 만** 찾아 두고, 사진은 브라우저가 SofaScore CDN 에서 바로 받는다 —
 * 수집 서버가 SofaScore 에 직접 붙지 않으니 그쪽 차단과 무관하다.
 *
 * ⚠️ 동명이인 — 이름 검색 첫 결과를 믿으면 리스 제임스 사고(셰필드 웬즈데이의
 * 동명이인 얼굴)가 그대로 재현된다. 축구 선수 항목만, 그리고 ESPN 나이와 위키데이터
 * 생년이 맞는 항목만 받는다(나이를 모르면 막지 않는다 — plausibleBirthYear 와 같은 규칙).
 *
 * 네트워크 없이 도는 순수 함수만 여기 둔다.
 */
import { birthYearOf, plausibleBirthYear } from './photos.mjs';

/** 위키데이터 속성 — SofaScore 선수 ID · 생년월일 */
export const P_SOFASCORE = 'P12302';
export const P_BIRTH = 'P569';

export const sofascoreImage = (id) => `https://img.sofascore.com/api/v1/player/${id}/image`;

/**
 * ESPN 이름으로는 위키데이터에서 못 찾는 선수의 다른 이름 (2026-10-17 점검).
 * 사비우(토트넘)는 맨시티 시절 이름 "Savinho" 로 올라 있고, "Sávio" 로 찾으면
 * 1974년생 사비우만 나온다. 키는 normName 과 같은 모양(소문자 · 발음기호 없음).
 */
export const NAME_ALIASES = {
  savio: ['Savinho'],
};

/** 위키데이터에서 찾아 볼 이름들 — ESPN 이름 다음에 다른 이름 */
export function searchNames(name, norm) {
  return [name, ...(NAME_ALIASES[norm(name)] ?? [])];
}

/** 이름 검색 결과에서 축구 선수 항목 id 들 (순서 유지) */
export function footballerIds(hits) {
  return (Array.isArray(hits) ? hits : [])
    .filter((h) => /football|soccer/i.test(String(h?.description ?? '')))
    .map((h) => String(h?.id ?? ''))
    .filter(Boolean);
}

const firstValue = (entity, prop) => entity?.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;

/**
 * 후보 항목들 중 그 선수를 고른다 — SofaScore ID 가 있고, 생년이 나이와 맞는 첫 항목.
 * @param ids       후보 항목 id (검색 순서)
 * @param entities  wbgetentities 의 entities
 * @returns { qid, ss } 또는 null
 */
export function pickSofascore(ids, entities, age, today = new Date()) {
  for (const qid of ids) {
    const e = entities?.[qid];
    const raw = firstValue(e, P_SOFASCORE);
    const ss = typeof raw === 'string' ? raw.trim() : '';
    if (!/^\d+$/.test(ss)) continue;
    const by = birthYearOf(firstValue(e, P_BIRTH)?.time);
    if (!plausibleBirthYear(by, age, today)) continue;
    return { qid, ss };
  }
  return null;
}

/** 지난 회차 기록으로 다시 찾을 필요가 있는가 — 찾은 건 그대로, 못 찾은 건 며칠 뒤 다시 */
export function needsLookup(entry, now = Date.now(), retryDays = 7) {
  if (!entry) return true;
  if (entry.ss) return false;
  const at = Date.parse(entry.at ?? '');
  return !Number.isFinite(at) || now - at > retryDays * 86_400_000;
}

/**
 * ID 기록 두 개를 합친다 — **찾은 ID 는 절대 잃지 않는다.**
 *
 * 2026-10-16: 두 회차가 겹쳐 돌았는데, 뒤 회차가 ID 기록 파일이 생기기 전의 체크아웃에서
 * 시작해 전부 다시 찾다가 위키데이터 한도에 걸렸고, 그 작은 기록(223건)으로 앞 회차의
 * 기록(329건)을 덮어써 레알·뉴캐슬·리버풀·Future 의 ID 가 사라졌다.
 * 그래서 시작할 때와 저장 직전에 main 에 올라가 있는 기록과 합친다.
 *  · 한쪽만 있으면 그것
 *  · 한쪽만 ID 가 있으면 ID 있는 쪽
 *  · 둘 다 ID 가 있거나 둘 다 없으면 더 최근(at) 쪽
 */
export function mergeIdMaps(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, vb] of Object.entries(b ?? {})) {
    const va = out[k];
    if (!va) { out[k] = vb; continue; }
    if (!va.ss && vb?.ss) { out[k] = vb; continue; }
    if (va.ss && !vb?.ss) continue;
    if (Date.parse(vb?.at ?? '') > Date.parse(va.at ?? '')) out[k] = vb;
  }
  return out;
}
