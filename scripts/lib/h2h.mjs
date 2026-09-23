/**
 * 상대전적(head-to-head) 파서.
 *
 * ESPN 경기 요약(`summary`)에는 `seasonseries` 가 들어 있고, 그 안에
 * `type: 'head-to-head'` 항목이 **역대 맞대결**을 바로 준다.
 *
 * ```
 * { type: 'head-to-head', summary: 'KOR leads series 1-0',
 *   seriesScore: '1-0', totalCompetitions: 1,
 *   events: [{ id, date, statusType:{completed}, competitors:[{homeAway, team, score}] }] }
 * ```
 *
 * 왜 필요한가: 우리는 팀 일정을 시즌 단위로 거슬러 올라가 맞대결을 추려
 * 왔는데(클럽 3시즌·국가대표 13시즌), 국가대표는 한 상대를 십수 년에 한 번
 * 만난다. 한국-에콰도르는 **2010년**이 마지막이라 13시즌을 뒤져도 0경기였고,
 * 화면 오른쪽 상대전적 칸이 통째로 비었다. ESPN 은 그 경기를 알고 있다.
 *
 * 일정에서 모은 것과 합쳐 쓰되, 경기 id 로 중복을 없앤다.
 */

/** seasonseries 의 head-to-head 항목만 골라 compactGame 과 같은 모양으로 편다 */
export function seriesGames(summary) {
  const out = [];
  for (const s of summary?.seasonseries ?? []) {
    if (String(s?.type ?? '') !== 'head-to-head') continue;
    for (const ev of s?.events ?? []) {
      /* 아직 안 치른 경기(=이번 맞대결 자신)가 섞여 들어온다 */
      if (ev?.statusType?.completed !== true) continue;
      const cs = ev?.competitors ?? [];
      const h = cs.find((x) => x?.homeAway === 'home');
      const a = cs.find((x) => x?.homeAway === 'away');
      if (!h || !a) continue;
      /* 여기서 score 는 문자열이다 (일정 응답의 score.displayValue 와 다르다) */
      const num = (v) => {
        const n = Number(v?.score?.displayValue ?? v?.score);
        return Number.isFinite(n) ? n : undefined;
      };
      out.push({
        id: String(ev.id),
        date: String(ev.date ?? ''),
        /* seasonseries 이벤트에는 대회 정보가 없다 — 화면은 없으면 안 그린다 */
        competition: '',
        homeId: String(h?.team?.id ?? ''),
        awayId: String(a?.team?.id ?? ''),
        homeAbbr: String(h?.team?.abbreviation ?? ''),
        awayAbbr: String(a?.team?.abbreviation ?? ''),
        homeScore: num(h),
        awayScore: num(a),
        done: true,
      });
    }
  }
  return out;
}

/** "KOR leads series 1-0" 같은 ESPN 의 한 줄 요약 (없으면 '') */
export function seriesSummary(summary) {
  const s = (summary?.seasonseries ?? []).find((x) => String(x?.type ?? '') === 'head-to-head');
  return String(s?.summary ?? '').trim();
}

/**
 * 여러 출처의 맞대결을 합친다.
 *
 * ⚠️ 순서가 중요하다: 먼저 온 쪽이 이긴다. 일정 응답이 대회 이름을 갖고
 * 있으므로 그쪽을 앞에 두고, seasonseries 는 **일정에 없는 옛 경기만**
 * 보태는 역할로 뒤에 둔다.
 */
export function mergeH2H(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const g of list ?? []) {
      const id = String(g?.id ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(g);
    }
  }
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
