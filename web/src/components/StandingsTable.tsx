import { useState } from 'react';
import type { Match, StandingTable, StandingZone } from '../lib/types';
import { kstShortDate } from '../lib/kst';
import { resultOf, teamResults } from '../lib/league';
import { Crest } from './Crest';

interface Props {
  table: StandingTable;
  matches: Match[];
  /** 이 팀 행을 강조한다 */
  focusTeamId: string;
  /**
   * 여러 팀을 **각자 팀 컬러로** 강조한다 (Summary 탭).
   * 한 팀만 볼 때는 accent 하나로 충분하지만, 우리 팀이 여럿 섞인 표에서는
   * 어느 줄이 누구인지 색으로 갈려야 한다.
   */
  focusTeams?: Record<string, string>;
}

/**
 * ESPN 이 주는 영문 구분을 한국어로만 옮긴다.
 * **어느 순위가 어디에 해당하는지는 옮기지 않는다** — 그건 ESPN 이 정한다.
 * 모르는 문구는 원문 그대로 보여 준다(새 대회가 생겨도 안 깨지게).
 */
const ZONE_KO: Record<string, string> = {
  'champions league': '챔피언스리그 진출',
  'champions league qualifying': '챔피언스리그 예선',
  'europa league': '유로파리그 진출',
  'europa league qualifying': '유로파리그 예선',
  'conference league': '컨퍼런스리그 진출',
  'conference league qualifying': '컨퍼런스리그 예선',
  'uefa conference league qualifying': '컨퍼런스리그 예선',
  'relegation': '강등',
  'relegation playoff': '강등 플레이오프',
  'promotion': '승격',
  'promotion playoff': '승격 플레이오프',
  'qualifies for round of 16': '16강 직행',
  'qualifies for knockout round playoffs': '16강 플레이오프',
  'qualifies for knockout play-offs': '16강 플레이오프',
  'knockout phase playoffs - seeded': '16강 PO (시드)',
  'knockout phase playoffs - unseeded': '16강 PO (비시드)',
  'knockout phase play-offs - seeded': '16강 PO (시드)',
  'knockout phase play-offs - unseeded': '16강 PO (비시드)',
  'eliminated': '탈락',
  'group stage': '조별리그',
};
const zoneLabel = (text: string) => ZONE_KO[text.toLowerCase()] ?? text;

/*
 * 띠 색만 우리가 정한다.
 * "몇 위가 어디" 인지는 여전히 ESPN 이 정하지만, ESPN 이 주는 색은
 * #81D6AC · #c6d1e0 · #B2BFD0 처럼 서로 거의 구분이 안 되는 연한 색이라
 * 표 왼쪽에서 무엇이 무엇인지 알아볼 수가 없다.
 * 대회별로 쓰는 관용색(챔스 하늘색 · 유로파 주황 · 컨퍼런스 초록)으로 바꾼다.
 * 모르는 구분은 ESPN 색을 그대로 쓴다.
 */
const ZONE_COLOR: { match: RegExp; color: string }[] = [
  /* 챔스 조별리그 표 — 네 구간이 서로 확실히 갈려야 한다.
     ⚠️ 순서가 중요하다: "unseeded" 를 "seeded" 보다 먼저 본다
     (문자열 'unseeded' 안에 'seeded' 가 들어 있다). */
  { match: /round of 16/i, color: '#2ED573' },          // 16강 직행 — 초록
  { match: /un-?seeded/i, color: '#C46BFF' },           // PO 비시드 — 보라
  { match: /seeded/i, color: '#4CC9F0' },               // PO 시드 — 하늘
  { match: /knockout|play-?off/i, color: '#4CC9F0' },
  { match: /eliminated/i, color: '#FF5C6C' },           // 탈락 — 빨강
  // 리그 표
  { match: /champions league/i, color: '#4CC9F0' },
  { match: /europa/i, color: '#FF9F2E' },
  { match: /conference/i, color: '#2ED573' },
  { match: /relegation/i, color: '#FF5C6C' },
  { match: /promotion/i, color: '#C084FC' },
];
const zoneColor = (z: { color: string; text: string }) =>
  ZONE_COLOR.find((c) => c.match.test(z.text))?.color ?? z.color;

/** 연속된 순위는 "1–4위", 떨어져 있으면 "5위 · 10위" 로 적는다 */
function rankRange(ranks: number[]): string {
  const sorted = [...ranks].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(i === j ? `${sorted[i]}위` : `${sorted[i]}–${sorted[j]}위`);
    i = j + 1;
  }
  return parts.join(' · ');
}

export function StandingsTable({ table, matches, focusTeamId, focusTeams }: Props) {
  const [open, setOpen] = useState<string | null>(null);

  /*
   * 같은 설명이 붙은 순위를 모으고, **가장 높은 순위에서 이어지는 구간만**
   * 남긴다.
   *
   * 왜 거르나: 라리가 응답에 10위가 "Europa League" 로 하나 더 들어 있었다.
   * 6위에 이미 제대로 된 유로파 자리가 있는데도 그렇고, 결정적으로 그 항목만
   * 색이 `##c6d1e0` (샵이 두 개) 로 깨져 있다 — ESPN 쪽에서 손으로 넣다 남은
   * 줄로 보인다. 그대로 두면 범례가 "6위 · 10위 유로파" 가 되어, 규정을
   * 아는 사람일수록 더 헷갈린다. 떨어져 있는 순위가 **유일한** 경우
   * (컵 우승팀 자리처럼 진짜로 하나만 있는 경우)는 그대로 남긴다.
   */
  const { zones, legend } = (() => {
    const by = new Map<string, { color: string; ranks: number[] }>();
    for (const [rank, z] of Object.entries(table.zones ?? {})) {
      const hit = by.get(z.text) ?? { color: z.color, ranks: [] };
      hit.ranks.push(Number(rank));
      by.set(z.text, hit);
    }

    const keptZones: Record<number, StandingZone> = {};
    const rows: { text: string; color: string; ranks: number[] }[] = [];
    for (const [text, v] of by) {
      const sorted = [...v.ranks].sort((a, b) => a - b);
      const run = [sorted[0]];
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== run[run.length - 1] + 1) break;
        run.push(sorted[i]);
      }
      const keep = sorted.length === 1 ? sorted : run;
      for (const r of keep) keptZones[r] = { color: v.color, text };
      rows.push({ text, color: v.color, ranks: keep });
    }
    rows.sort((a, b) => Math.min(...a.ranks) - Math.min(...b.ranks));
    return { zones: keptZones, legend: rows };
  })();

  const zoneOf = (rank: number) => zones[rank];

  return (
    <div className="tbl">
      {/* 색 띠가 무엇을 뜻하는지 표 위에 적어 둔다 —
          색만 칠해 두면 마우스를 올려 보기 전에는 알 수가 없다. */}
      {legend.length > 0 && (
        <div className="tbl__legend">
          {legend.map((z) => (
            <span className="tbl__lg" key={z.text} style={{ ['--zone' as string]: zoneColor(z) }}>
              <i aria-hidden="true" />
              <b className="num">{rankRange(z.ranks)}</b>
              {zoneLabel(z.text)}
            </span>
          ))}
        </div>
      )}

      <div className="tbl__head" role="row">
        <span className="tbl__rank">#</span>
        <span className="tbl__team">TEAM</span>
        <span className="num">P</span>
        <span className="num">W</span>
        <span className="num">D</span>
        <span className="num">L</span>
        <span className="num tbl__g">GF</span>
        <span className="num tbl__g">GA</span>
        <span className="num tbl__gd">GD</span>
        <span className="num tbl__pts">PTS</span>
        <span className="tbl__form">FORM</span>
      </div>

      {table.rows.map((r) => {
        const isOpen = open === r.team.id;
        const teamColor = focusTeams?.[r.team.id];
        const focus = teamColor ? true : r.team.id === focusTeamId;
        const zone = zoneOf(r.rank);
        return (
          <div
            className="tbl__row"
            key={r.team.id}
            data-open={isOpen}
            data-focus={focus}
            /* 우리 팀이 여럿 섞인 표(Summary)에서는 강조색을 팀 컬러로 바꾼다 */
            style={teamColor ? ({ ['--accent']: teamColor } as React.CSSProperties) : undefined}
            /* 우리 팀 줄은 색뿐 아니라 이름까지 팀 컬러로 — 스무 줄짜리 표에서
               "우리가 어디 있나" 를 색 하나로 찾게 한다 */
            data-mine={teamColor ? true : undefined}
          >
            <button
              className="tbl__line"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : r.team.id)}
              style={zone ? ({ ['--zone' as string]: zoneColor(zone) } as React.CSSProperties) : undefined}
              data-zone={!!zone}
              title={zone ? zoneLabel(zone.text) : undefined}
            >
              <span className="tbl__rank num">{r.rank}</span>
              <span className="tbl__team">
                <Crest team={r.team} size={20} />
                <b className="tbl__full">{r.team.name}</b>
                <b className="tbl__short">{r.team.shortName}</b>
              </span>
              <span className="num">{r.played}</span>
              <span className="num">{r.win}</span>
              <span className="num">{r.draw}</span>
              <span className="num">{r.loss}</span>
              <span className="num tbl__g">{r.gf}</span>
              <span className="num tbl__g">{r.ga}</span>
              <span className="num tbl__gd" data-sign={r.gd > 0 ? 'p' : r.gd < 0 ? 'n' : 'z'}>
                {r.gd > 0 ? `+${r.gd}` : r.gd}
              </span>
              <span className="num tbl__pts">{r.points}</span>
              <span className="tbl__form">
                {r.form.length === 0 ? (
                  <i className="tbl__nof">—</i>
                ) : (
                  r.form.map((f, i) => (
                    <i key={i} className="fchip" data-r={f}>
                      {f}
                    </i>
                  ))
                )}
              </span>
            </button>

            <div className="tbl__panel">
              <div className="tbl__panelIn">
                {isOpen && <TeamSplit matches={matches} teamId={r.team.id} />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 홈/원정 경기 결과 */
function TeamSplit({ matches, teamId }: { matches: Match[]; teamId: string }) {
  // 이 어코디언은 "결과"를 보는 자리다 — 아직 안 치른 예정 경기는 빼고
  // 실제로 끝난 경기만 남긴다(일정은 일정 탭에 있다).
  const r = teamResults(matches.filter((m) => m.status === 'finished'), teamId);

  if (!r.home.length && !r.away.length) {
    return <p className="nogoal" style={{ padding: '4px 0 10px' }}>이 대회 경기 기록이 아직 없습니다.</p>;
  }

  return (
    <div className="split">
      <SplitCol title="홈" list={r.home} rec={r.homeRecord} teamId={teamId} />
      <div className="split__div" />
      <SplitCol title="원정" list={r.away} rec={r.awayRecord} teamId={teamId} />
    </div>
  );
}

/**
 * 홈 또는 원정 한 칸.
 *
 * ⚠️ 모듈 바깥에 있어야 한다 — TeamSplit 안에서 만들면 렌더마다 새
 * 컴포넌트 타입이 되어 펼칠 때마다 통째로 다시 마운트된다.
 */
function SplitCol({
  title, list, rec, teamId,
}: {
  title: string;
  list: Match[];
  rec: { w: number; d: number; l: number };
  teamId: string;
}) {
  return (
    <div className="split__col">
      <div className="split__h">
        <span>{title}</span>
        <b className="num">
          {rec.w}승 {rec.d}무 {rec.l}패
        </b>
      </div>
      {list.length === 0 ? (
        <p className="nogoal">경기 없음</p>
      ) : (
        list.map((m) => {
          const res = resultOf(m, teamId);
          const opp = m.home.id === teamId ? m.away : m.home;
          const done = m.status === 'finished';
          return (
            <div className="split__row" key={m.id}>
              <span className="split__d num">{kstShortDate(m.kickoffUtc)}</span>
              <Crest team={opp} size={17} />
              <span className="split__o">{opp.shortName}</span>
              <span className="split__s num" data-res={res ?? undefined}>
                {done ? `${m.homeScore} : ${m.awayScore}` : '예정'}
              </span>
              {res && (
                <i className="fchip" data-r={res}>
                  {res}
                </i>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
