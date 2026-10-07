/**
 * 국가대표(A매치) 경기별 출전 기록 — 코리안리거 카드의 "A매치" 줄과 호버의
 * "국가대표 최근 3경기" 에 쓴다.
 *
 * 왜 summary 인가: 클럽 기록은 core eventlog(athlete.mjs)로 받는데, 그건
 * **리그 하나·시즌 하나** 단위다. A매치는 한 해에 친선·월드컵 예선·본선·
 * 아시안컵이 섞여 리그 슬러그가 경기마다 다르다. 대표팀 일정은 이미
 * schedule-korea.json 에 있으므로, 경기마다 summary 를 한 번 받아 우리 팀
 * 로스터를 읽는 쪽이 요청 수도 적고(경기당 1건) 대회가 섞여도 상관없다.
 *
 * summary 의 rosters[].roster[] 항목 하나에 필요한 게 다 있다(2026-10 실측):
 *   starter / subbedIn / subbedOut       선발·교체 여부
 *   plays[] { clock.displayValue, substitution }   교체 시각 ("75'", "45'+1'")
 *   stats[] appearances / totalGoals / goalAssists / yellowCards / redCards
 *
 * 이 파일은 순수 함수만 둔다 — national.test.mjs 가 실제 응답 조각으로 검증한다.
 */

/** "75'" · "45'+1'" · "90'+3'" → 분(추가시간은 버린다). 못 읽으면 undefined */
export function clockMinute(dv) {
  const m = String(dv ?? '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : undefined;
}

function statOf(entry, name) {
  const hit = (entry?.stats ?? []).find((x) => x?.name === name);
  const v = Number(hit?.value ?? hit?.displayValue);
  return Number.isFinite(v) ? v : 0;
}

/** 연장전까지 갔으면 120분 — summary 머리의 상태 문구로 가른다 */
export function fullLength(summary) {
  const t = summary?.header?.competitions?.[0]?.status?.type ?? {};
  const s = `${t.detail ?? ''} ${t.shortDetail ?? ''} ${t.description ?? ''}`.toUpperCase();
  return /AET|PEN|EXTRA/.test(s) ? 120 : 90;
}

/**
 * summary → 그 팀에서 **실제로 뛴** 선수들의 출전 요약 {athleteId: line}.
 * 명단에만 든 선수(starter·subbedIn 둘 다 false)는 넣지 않는다.
 */
export function nationalLineup(summary, teamId) {
  const out = {};
  const me = String(teamId);
  const full = fullLength(summary);
  const block = (summary?.rosters ?? []).find((r) => String(r?.team?.id ?? '') === me);
  for (const e of block?.roster ?? []) {
    const id = String(e?.athlete?.id ?? '');
    if (!id) continue;
    const started = e?.starter === true;
    const subbedIn = e?.subbedIn === true;
    if (!started && !subbedIn) continue;

    /* 교체 시각은 plays 의 substitution 항목에 있다. 교체로 들어와 다시
       나간 선수는 substitution 이 두 번 — 앞이 투입, 뒤가 교체 아웃이다. */
    const subs = (e?.plays ?? [])
      .filter((p) => p?.substitution === true)
      .map((p) => clockMinute(p?.clock?.displayValue))
      .filter((n) => n !== undefined);
    const inMin = started ? 0 : subs[0];
    const outMin = e?.subbedOut === true ? subs[started ? 0 : 1] : undefined;
    const end = outMin ?? full;
    const minutes = inMin === undefined ? undefined : Math.max(0, end - inMin);

    out[id] = {
      started,
      ...(started ? {} : { subIn: inMin }),
      ...(minutes === undefined ? {} : { minutes }),
      goals: statOf(e, 'totalGoals'),
      assists: statOf(e, 'goalAssists'),
      yellow: statOf(e, 'yellowCards') > 0,
      red: statOf(e, 'redCards') > 0,
    };
  }
  return out;
}

/**
 * 경기 목록(최신순) → 선수 한 명의 A매치 요약.
 *
 * 합계는 **올해(year)** 경기만 센다. 데이터에 남아 있는 대표팀 일정의 범위는
 * 회차마다 조금씩 달라서, "전체" 로 세면 같은 선수의 숫자가 이유 없이 흔들린다.
 * 연도는 화면에도 같이 적어(2026 A매치) 무엇을 센 것인지 숨기지 않는다.
 * 최근 경기는 연도와 상관없이 마지막으로 뛴 take 경기다.
 */
export function nationalFor(games, athleteId, year, take = 3) {
  const id = String(athleteId);
  const played = games.filter((g) => g?.lineup?.[id]);
  const thisYear = played.filter((g) => String(g.date ?? '').startsWith(String(year)));
  const sum = (k) => thisYear.reduce((a, g) => a + (g.lineup[id][k] ?? 0), 0);
  return {
    year,
    apps: thisYear.length,
    starts: thisYear.filter((g) => g.lineup[id].started).length,
    goals: sum('goals'),
    assists: sum('assists'),
    recent: played.slice(0, take).map((g) => {
      const l = g.lineup[id];
      return {
        eventId: g.eventId,
        competition: g.competition,
        date: g.date,
        opponent: g.opponent,
        opponentId: g.opponentId,
        score: g.score,
        result: g.result,
        started: l.started,
        ...(l.minutes === undefined ? {} : { minutes: l.minutes }),
        ...(l.subIn === undefined ? {} : { subIn: l.subIn }),
        goals: l.goals,
        assists: l.assists,
        yellow: l.yellow,
      };
    }),
  };
}
