/**
 * 시즌 추이 — 라운드가 지날 때마다 순위 · 승점이 어떻게 움직였나.
 *
 * 순위표는 "지금 몇 위" 만 말한다. 같은 경기 기록으로 "어떻게 여기까지 왔나" 를 만든다.
 *
 * "라운드" 는 달력의 매치데이가 아니라 **그 팀의 n 번째 경기**다. 연기된 경기 때문에
 * 팀마다 치른 경기 수가 다른데, 매치데이 번호로 자르면 덜 치른 팀이 그 주에만
 * 순위가 꺼졌다가 나중에 튀어 오른다. n 번째 경기 기준이면 모든 팀을 같은 경기 수에서
 * 견준다 — r 라운드의 순위는 "모든 팀이 r 경기를 치른 시점의 표" 다(덜 치른 팀은
 * 지금까지의 기록으로 견주고, 그 팀의 선은 치른 경기까지만 그린다).
 */
import type { Match, TeamRef } from './types';

export interface TrendPoint {
  /** 그 팀의 몇 번째 경기인가 (1 부터) */
  round: number;
  rank: number;
  points: number;
  /** 이 라운드 경기 — 툴팁용 */
  result: 'W' | 'D' | 'L';
  opponent: TeamRef;
  home: boolean;
  gf: number;
  ga: number;
  kickoffUtc: string;
}

export interface TrendData {
  /** 가장 많이 치른 팀의 경기 수 */
  rounds: number;
  /** 대회 참가 팀 수 (순위 축의 바닥) */
  teams: number;
  series: Map<string, TrendPoint[]>;
  /** 라운드마다 1위 팀의 승점 — 승점 그래프의 기준선 */
  leaderPoints: number[];
}

interface Step { pts: number; gd: number; gf: number; point: Omit<TrendPoint, 'rank'> }

export function buildTrend(matches: Match[], teamIds?: Iterable<string>): TrendData {
  const steps = new Map<string, Step[]>();
  const names = new Map<string, string>();
  const allow = teamIds ? new Set(teamIds) : null;

  const done = matches
    .filter((m) => m.status === 'finished' && m.homeScore !== undefined && m.awayScore !== undefined)
    /* 시드(순위표)에 없는 팀이 낀 경기는 다른 대회 경기다 — 순위표와 같은 규칙 */
    .filter((m) => !allow || (allow.has(m.home.id) && allow.has(m.away.id)))
    .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));

  for (const m of done) {
    for (const home of [true, false]) {
      const me = home ? m.home : m.away;
      const opp = home ? m.away : m.home;
      const gf = (home ? m.homeScore : m.awayScore) as number;
      const ga = (home ? m.awayScore : m.homeScore) as number;
      const list = steps.get(me.id) ?? [];
      const prev = list[list.length - 1];
      const result = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
      const pts = (prev?.pts ?? 0) + (result === 'W' ? 3 : result === 'D' ? 1 : 0);
      list.push({
        pts,
        gd: (prev?.gd ?? 0) + gf - ga,
        gf: (prev?.gf ?? 0) + gf,
        point: { round: list.length + 1, points: pts, result, opponent: opp, home, gf, ga, kickoffUtc: m.kickoffUtc },
      });
      steps.set(me.id, list);
      names.set(me.id, me.name);
    }
  }

  /* 아직 한 경기도 안 치른 팀도 순위에는 든다(0점) */
  if (allow) for (const id of allow) if (!steps.has(id)) steps.set(id, []);

  const rounds = Math.max(0, ...[...steps.values()].map((l) => l.length));
  const series = new Map<string, TrendPoint[]>();
  for (const id of steps.keys()) series.set(id, []);
  const leaderPoints: number[] = [];

  for (let r = 1; r <= rounds; r++) {
    const at = [...steps.entries()].map(([id, list]) => {
      const s = list[Math.min(r, list.length) - 1];
      return { id, pts: s?.pts ?? 0, gd: s?.gd ?? 0, gf: s?.gf ?? 0 };
    });
    /* 순위표(lib/league.ts finish)와 같은 순서 — 승점 → 득실 → 다득점 → 이름 */
    at.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf
      || (names.get(x.id) ?? '').localeCompare(names.get(y.id) ?? ''));
    leaderPoints.push(at[0]?.pts ?? 0);
    at.forEach((row, i) => {
      const list = steps.get(row.id)!;
      if (r <= list.length) series.get(row.id)!.push({ ...list[r - 1].point, rank: i + 1 });
    });
  }

  return { rounds, teams: steps.size, series, leaderPoints };
}

/** 축 눈금 — 1 과 끝은 항상, 사이는 step 간격 (끝과 붙는 눈금은 뺀다) */
export function axisTicks(max: number, step: number, min = 1): number[] {
  if (max <= min) return [min];
  const out = [min];
  for (let v = step; v < max; v += step) if (v > min && max - v >= step / 2.5) out.push(v);
  out.push(max);
  return out;
}
