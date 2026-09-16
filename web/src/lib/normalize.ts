/**
 * ESPN 원본 JSON → 앱 도메인 모델.
 *
 * ESPN 비공식 API는 문서도 버전도 없고, 같은 경기라도 응답마다
 * 채워지는 필드가 다르다(검증 중 실제로 details[]가 비어 오는 경기를 확인).
 * 따라서 이 레이어는 전부 "있으면 쓰고 없으면 넘어간다" 방어적 파싱이며,
 * 어떤 필드도 필수로 가정하지 않는다.
 */
import type { GoalEvent, Match, MatchStatus, StandingRow, StandingTable, TeamRef } from './types';
import { teamName } from '../config/names';
import { CREST, TEAM_OVERRIDE } from '../config/targets';

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const pick = <T,>(...vals: (T | undefined | null)[]): T | undefined =>
  vals.find((v) => v !== undefined && v !== null) as T | undefined;

/* ── 팀 ─────────────────────────────────────────────── */

export function teamFrom(raw: any, rank?: number): TeamRef {
  const t = raw?.team ?? raw ?? {};
  const id = String(pick(t.id, raw?.id, '') ?? '');
  const en = String(pick(t.displayName, t.name, t.shortDisplayName, 'Unknown'));
  const [full, short] = teamName(id, en, t.shortDisplayName ? String(t.shortDisplayName) : undefined);
  const override = TEAM_OVERRIDE[id];
  return {
    id,
    name: full,
    shortName: short,
    abbr: override?.abbr ?? String(pick(t.abbreviation, t.shortDisplayName, short.slice(0, 3))),
    logo: override?.logo ?? pick<string>(t.logos?.[0]?.href, t.logo) ?? (id ? CREST(id) : ''),
    rank,
  };
}

/* ── 경기 상태 ───────────────────────────────────────── */

function statusFrom(raw: any): { status: MatchStatus; detail?: string } {
  const s = raw?.type ?? {};
  const state = String(s.state ?? '').toLowerCase();
  const name = String(s.name ?? '').toUpperCase();
  if (name.includes('POSTPONED') || name.includes('CANCELED')) return { status: 'postponed', detail: s.shortDetail };
  if (s.completed === true || state === 'post') return { status: 'finished', detail: s.shortDetail };
  if (state === 'in') return { status: 'live', detail: pick(raw?.displayClock, s.shortDetail) };
  return { status: 'scheduled', detail: s.shortDetail };
}

/* ── 득점 이벤트 ─────────────────────────────────────── */

/** 분(minute) 추출: "45+2'" → 45 (정렬용), 표시는 clock 문자열 그대로 쓴다. */
function minuteOf(clock: any): number {
  const dv = String(clock?.displayValue ?? '');
  const m = dv.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  const v = num(clock?.value);
  return v !== undefined ? Math.floor(v / 60) : 0;
}

/** scoreboard / summary 의 competitions[].details[] 에서 골 추출. */
export function goalsFromDetails(details: any[] | undefined): GoalEvent[] {
  if (!Array.isArray(details)) return [];
  return details
    .filter((d) => d?.scoringPlay === true)
    .map((d): GoalEvent => {
      const people: any[] = Array.isArray(d.athletesInvolved) ? d.athletesInvolved : [];
      return {
        minute: minuteOf(d.clock),
        clock: String(d.clock?.displayValue ?? `${minuteOf(d.clock)}'`),
        teamId: String(d.team?.id ?? ''),
        scorer: String(people[0]?.displayName ?? people[0]?.shortName ?? '—'),
        // ESPN details[]는 보통 득점자만 준다. 어시스트는 core /plays 에서 보강.
        assist: people[1]?.displayName ? String(people[1].displayName) : undefined,
        ownGoal: d.ownGoal === true,
        penalty: d.penaltyKick === true,
      };
    })
    .sort((a, b) => a.minute - b.minute);
}

/**
 * core API /plays 응답에서 골 + 어시스트를 조합한다.
 * 어시스트는 골과 별개의 play("Assists Shot")로 들어오므로
 * 같은 시계값(clock)으로 조인해야 한다.
 */
export function goalsFromPlays(items: any[] | undefined): GoalEvent[] {
  if (!Array.isArray(items)) return [];
  const assistsByClock = new Map<number, string>();
  for (const p of items) {
    const text = String(p?.type?.text ?? '');
    if (!/assist/i.test(text)) continue;
    const who = p?.participants?.find((x: any) => /assist/i.test(String(x?.type ?? '')))?.athlete;
    const name = who?.displayName ?? p?.participants?.[0]?.athlete?.displayName;
    if (name) assistsByClock.set(num(p?.clock?.value) ?? -1, String(name));
  }
  return items
    .filter((p) => p?.scoringPlay === true && p?.shootout !== true)
    .map((p): GoalEvent => {
      const clockVal = num(p?.clock?.value) ?? -1;
      const scorer =
        p?.participants?.find((x: any) => /scorer/i.test(String(x?.type ?? '')))?.athlete
          ?.displayName ?? p?.participants?.[0]?.athlete?.displayName;
      return {
        minute: minuteOf(p.clock),
        clock: String(p.clock?.displayValue ?? `${minuteOf(p.clock)}'`),
        teamId: String(p?.team?.id ?? ''),
        scorer: String(scorer ?? '—'),
        assist: assistsByClock.get(clockVal),
        ownGoal: p?.ownGoal === true,
        penalty: p?.penaltyKick === true,
      };
    })
    .sort((a, b) => a.minute - b.minute);
}

/* ── 경기 ───────────────────────────────────────────── */

export function matchFrom(ev: any): Match | null {
  const c = ev?.competitions?.[0];
  if (!c) return null;
  const comps: any[] = Array.isArray(c.competitors) ? c.competitors : [];
  const homeRaw = comps.find((x) => x?.homeAway === 'home') ?? comps[0];
  const awayRaw = comps.find((x) => x?.homeAway === 'away') ?? comps[1];
  if (!homeRaw || !awayRaw) return null;

  const { status, detail } = statusFrom(pick(c.status, ev.status));
  /*
   * 정적 스냅샷(scripts/snapshot.mjs)이 종료된 경기마다 core API /plays 로
   * 득점자+어시스트를 미리 구워서 competitions[0].__goals 에 넣어 둔다.
   * ESPN 스케줄 응답 자체에는 details[]가 아예 없어(요약 엔드포인트 전용)
   * 이게 없으면 정적 피드만 쓰는 배포(Worker 프록시 없음)에서는 득점 기록이
   * 통째로 빈다. 있으면 그걸 쓰고, 없으면(Worker 응답 등) 기존 방식대로.
   */
  const goals = Array.isArray((c as any).__goals) ? ((c as any).__goals as GoalEvent[]) : goalsFromDetails(c.details);

  return {
    id: String(ev.id),
    kickoffUtc: String(pick(ev.date, c.date)),
    competition: String(pick(ev.league?.slug, c.league?.slug, ev.season?.slug, 'unknown')),
    competitionName: String(pick(ev.league?.name, c.league?.name, '')),
    round: pick<string>(c.notes?.[0]?.headline, ev.week?.text),
    venue: pick<string>(c.venue?.fullName, ev.venue?.fullName),
    status,
    statusDetail: detail,
    home: teamFrom(homeRaw, num(homeRaw?.curatedRank?.current) ?? undefined),
    away: teamFrom(awayRaw, num(awayRaw?.curatedRank?.current) ?? undefined),
    homeScore: num(pick(homeRaw?.score?.displayValue, homeRaw?.score)),
    awayScore: num(pick(awayRaw?.score?.displayValue, awayRaw?.score)),
    homePens: num(homeRaw?.shootoutScore),
    awayPens: num(awayRaw?.shootoutScore),
    goals,
    goalsLoaded: goals.length > 0,
    timeTBD: c.timeValid === false,
    playerStats: Array.isArray((c as any).__stats) ? (c as any).__stats : undefined,
  };
}

export function matchesFromSchedule(json: any): Match[] {
  const events: any[] = Array.isArray(json?.events) ? json.events : [];
  return events
    .map(matchFrom)
    .filter((m): m is Match => !!m)
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
}

/* ── 순위표 ─────────────────────────────────────────── */

const statOf = (entry: any, name: string): number => {
  const s = (entry?.stats ?? []).find((x: any) => x?.name === name);
  return num(pick(s?.value, s?.displayValue)) ?? 0;
};

function formOf(entry: any): ('W' | 'D' | 'L')[] {
  const s = (entry?.stats ?? []).find((x: any) => x?.name === 'overall' || x?.name === 'form');
  const raw = String(s?.displayValue ?? '');
  return raw
    .split(/[^WDL]/)
    .join('')
    .split('')
    .filter((ch): ch is 'W' | 'D' | 'L' => ch === 'W' || ch === 'D' || ch === 'L')
    .slice(-5);
}

export function standingsFrom(json: any, competition: string, competitionName: string): StandingTable[] {
  const groups: any[] = Array.isArray(json?.children) && json.children.length
    ? json.children
    : [json];

  return groups
    .map((g): StandingTable => {
      const entries: any[] = g?.standings?.entries ?? [];
      const rows: StandingRow[] = entries.map((e) => ({
        rank: statOf(e, 'rank'),
        team: teamFrom(e),
        played: statOf(e, 'gamesPlayed'),
        win: statOf(e, 'wins'),
        draw: statOf(e, 'ties'),
        loss: statOf(e, 'losses'),
        gf: statOf(e, 'pointsFor'),
        ga: statOf(e, 'pointsAgainst'),
        gd: statOf(e, 'pointDifferential'),
        points: statOf(e, 'points'),
        form: formOf(e),
      }));
      rows.sort((a, b) => a.rank - b.rank || b.points - a.points);
      return {
        competition,
        competitionName: String(pick(g?.name, competitionName)),
        groupName: g?.name && json?.children?.length > 1 ? String(g.name) : undefined,
        rows,
        derived: false,
        updatedAt: new Date().toISOString(),
      };
    })
    .filter((t) => t.rows.length > 0);
}

/**
 * ESPN standings 응답이 시즌 초반에 낡은 값을 주는 사례를 실제로 확인했다
 * (레알 마드리드가 5경기를 치렀는데 gamesPlayed=0). 그래서 경기 결과로
 * 순위를 직접 계산하는 경로를 항상 갖춰 두고, 불일치가 감지되면 이쪽을 쓴다.
 */
export function deriveStandings(
  matches: Match[],
  competition: string,
  competitionName: string,
): StandingTable {
  type Acc = Omit<StandingRow, 'rank'>;
  const acc = new Map<string, Acc>();
  const ensure = (t: TeamRef): Acc => {
    let a = acc.get(t.id);
    if (!a) {
      a = { team: t, played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0, gd: 0, points: 0, form: [] };
      acc.set(t.id, a);
    }
    return a;
  };

  for (const m of matches) {
    if (m.status !== 'finished' || m.homeScore === undefined || m.awayScore === undefined) continue;
    const h = ensure(m.home);
    const a = ensure(m.away);
    h.played++; a.played++;
    h.gf += m.homeScore; h.ga += m.awayScore;
    a.gf += m.awayScore; a.ga += m.homeScore;
    if (m.homeScore > m.awayScore) { h.win++; h.points += 3; a.loss++; h.form.push('W'); a.form.push('L'); }
    else if (m.homeScore < m.awayScore) { a.win++; a.points += 3; h.loss++; a.form.push('W'); h.form.push('L'); }
    else { h.draw++; a.draw++; h.points++; a.points++; h.form.push('D'); a.form.push('D'); }
  }

  const rows = [...acc.values()]
    .map((a) => ({ ...a, gd: a.gf - a.ga, form: a.form.slice(-5) }))
    .sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return { competition, competitionName, rows, derived: true, updatedAt: new Date().toISOString() };
}

/** ESPN 원본이 신뢰할 만한지 판단 — 아니면 derive 로 대체한다. */
export function standingsLookStale(table: StandingTable, playedHint: number): boolean {
  if (!table.rows.length) return true;
  const maxPlayed = Math.max(...table.rows.map((r) => r.played));
  return maxPlayed + 1 < playedHint;
}
