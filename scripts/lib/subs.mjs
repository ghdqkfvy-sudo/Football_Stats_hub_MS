/**
 * 교체 기록 — "누가 누구 대신 들어왔나".
 *
 * ESPN 라인업(요약 rosters)은 **선발에게만** 자리(AM-L·CD-R …)를 준다. 교체 선수는
 * "SUB" 뿐이라 어느 자리에서 뛰었는지 알 수 없었다. 같은 분에 나간 선발로
 * 짐작하면 두 명이 동시에 바뀐 경우(09-04 리버풀: 이삭·무뇨즈 64분) 가릴 수 없다.
 *
 * 경기 요약에는 교체 사건이 문장으로 들어 있다(Opta 문자중계와 같은 형식):
 *   "Substitution, Liverpool. Bradley Barcola replaces Darwin Núñez."
 *   "Substitution, Liverpool. Víctor Muñoz replaces Cody Gakpo because of an injury."
 * 들어간 선수가 앞, 나간 선수가 뒤다. 문장을 우선 믿고, 참가자(participants)는
 * 문장의 이름을 id 로 맞출 때만 쓴다(참가자 순서는 문서화돼 있지 않다).
 *
 * 네트워크 없이 요약 JSON 만 받는 순수 함수다.
 */

/** 이름 비교용 — 악센트·대소문자·기호를 지운다 (Muñoz = Munoz) */
export function normName(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z]+/g, ' ').trim();
}

/** "Substitution, Team. A replaces B( because of an injury)." → {inName, outName} */
export function parseSubText(text) {
  const t = String(text ?? '').trim();
  const m = t.match(/(?:^|\.\s+)([^.]+?)\s+replaces\s+(.+?)(?:\s+because of an injury)?\.?\s*$/i);
  if (!m) return null;
  return { inName: m[1].trim(), outName: m[2].trim() };
}

/** 요약 안에서 교체 사건이 들어 있을 만한 목록들 (경기마다 채워진 곳이 다르다) */
function eventLists(sum) {
  const lists = [sum?.keyEvents, sum?.commentary, sum?.plays];
  return lists.filter(Array.isArray).flat();
}

const isSubEvent = (ev) => {
  const ty = `${ev?.type?.type ?? ''} ${ev?.type?.text ?? ''}`.toLowerCase();
  const text = String(ev?.text ?? ev?.play?.text ?? '');
  return ty.includes('substitution') || /\breplaces\b/i.test(text);
};

/**
 * @param sum     ESPN 경기 요약 JSON
 * @param roster  그 팀의 요약 로스터 항목들(rosters[].roster)
 * @returns Map<들어간 선수 id, 나간 선수 id>
 */
export function substitutionsFrom(sum, roster) {
  const out = new Map();
  const list = Array.isArray(roster) ? roster : [];

  /* 이름 → id (풀네임·성 둘 다). 성이 겹치는 선수는 성으로는 찾지 않는다. */
  const byFull = new Map();
  const byLast = new Map();
  const dupLast = new Set();
  for (const e of list) {
    const id = String(e?.athlete?.id ?? '');
    if (!id) continue;
    for (const n of [e?.athlete?.displayName, e?.athlete?.fullName, e?.athlete?.shortName]) {
      const k = normName(n);
      if (k) byFull.set(k, id);
    }
    const last = normName(e?.athlete?.lastName ?? String(e?.athlete?.displayName ?? '').split(' ').slice(-1)[0]);
    if (last) {
      if (byLast.has(last) && byLast.get(last) !== id) dupLast.add(last);
      byLast.set(last, id);
    }
  }
  const idOf = (name) => {
    const k = normName(name);
    if (!k) return '';
    if (byFull.has(k)) return byFull.get(k);
    const last = k.split(' ').slice(-1)[0];
    return !dupLast.has(last) && byLast.has(last) ? byLast.get(last) : '';
  };
  const mine = new Set(list.map((e) => String(e?.athlete?.id ?? '')).filter(Boolean));

  /* 1) 로스터 항목이 직접 들고 있으면 그게 제일 확실하다 */
  for (const e of list) {
    const id = String(e?.athlete?.id ?? '');
    const forId = String(e?.subbedInFor?.athlete?.id ?? e?.subbedInFor?.id ?? '');
    if (id && forId && mine.has(forId)) out.set(id, forId);
  }

  /* 2) 사건 문장 — "A replaces B" */
  for (const ev of eventLists(sum)) {
    if (!isSubEvent(ev)) continue;
    const parsed = parseSubText(ev?.text ?? ev?.play?.text);
    const parts = (ev?.participants ?? ev?.play?.participants ?? [])
      .map((p) => String(p?.athlete?.id ?? ''))
      .filter((id) => mine.has(id));
    let inId = '';
    let outId = '';
    if (parsed) {
      inId = idOf(parsed.inName);
      outId = idOf(parsed.outName);
      /* 이름이 하나만 맞으면 참가자 중 나머지 한 명으로 채운다 */
      if (parts.length === 2) {
        if (inId && !outId) outId = parts.find((p) => p !== inId) ?? '';
        if (outId && !inId) inId = parts.find((p) => p !== outId) ?? '';
      }
    }
    if (inId && outId && inId !== outId && mine.has(inId) && mine.has(outId) && !out.has(inId)) {
      out.set(inId, outId);
    }
  }
  return out;
}

/** "67'" · "90'+3'" · "45+2'" → 분(추가시간은 그 정규시간 끝으로: 90'+3' → 90) */
function minuteOf(clock) {
  const d = String(clock?.displayValue ?? '');
  const m = d.match(/\d+/);
  if (m) return Number(m[0]);
  const v = Number(clock?.value);
  return Number.isFinite(v) && v > 0 ? Math.ceil(v / 60) : null;
}

const isRedEvent = (ev) => {
  if (ev?.redCard === true) return true;
  const ty = `${ev?.type?.type ?? ''} ${ev?.type?.text ?? ''}`.toLowerCase();
  return /red[\s-]?card|redcard|second yellow|yellow[\s-]?red/.test(ty);
};

/**
 * 퇴장 시각 (2026-10-19) — 요약 로스터는 퇴장 수(redCards)만 주고 나간 시각이 없어,
 * 선발이 퇴장당하면 90분을 다 뛴 것으로 셌다(뮌헨 올리세 챔스).
 * 사건 목록(keyEvents · commentary · plays)과 스코어보드 details 에서 퇴장 사건의 분을 찾는다.
 * @returns Map<선수 id, 퇴장 분> — 한 선수가 두 번 나오면 이른 쪽
 */
export function redCardMinutes(sum) {
  const out = new Map();
  const details = sum?.header?.competitions?.[0]?.details;
  const list = [...eventLists(sum), ...(Array.isArray(details) ? details : [])];
  for (const ev of list) {
    if (!isRedEvent(ev)) continue;
    const min = minuteOf(ev?.clock ?? ev?.play?.clock);
    if (min == null) continue;
    const ids = [
      ...(ev?.participants ?? ev?.play?.participants ?? []).map((p) => p?.athlete?.id),
      ...(ev?.athletesInvolved ?? []).map((a) => a?.id),
    ].map((x) => String(x ?? '')).filter(Boolean);
    /* 퇴장 사건의 참가자는 보통 한 명 — 여럿이면 누군지 모르니 넘긴다 */
    const uniq = [...new Set(ids)];
    if (uniq.length !== 1) continue;
    const id = uniq[0];
    if (!out.has(id) || min < out.get(id)) out.set(id, min);
  }
  return out;
}
