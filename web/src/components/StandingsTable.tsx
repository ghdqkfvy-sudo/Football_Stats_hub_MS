import { useState } from 'react';
import type { Match, StandingTable } from '../lib/types';
import { kstShortDate } from '../lib/kst';
import { resultOf, teamResults } from '../lib/league';
import { Crest } from './Crest';

interface Props {
  table: StandingTable;
  matches: Match[];
  /** 이 팀 행을 강조한다 */
  focusTeamId: string;
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

export function StandingsTable({ table, matches, focusTeamId }: Props) {
  const [open, setOpen] = useState<string | null>(null);

  const zoneOf = (rank: number) => table.zones?.[rank];

  /* 범례는 표에 실제로 들어 있는 구분만 모아 만든다 —
     같은 설명끼리 묶고, 가장 높은 순위가 앞에 오게 세운다. */
  const legend = (() => {
    const by = new Map<string, { color: string; ranks: number[] }>();
    for (const [rank, z] of Object.entries(table.zones ?? {})) {
      const hit = by.get(z.text) ?? { color: z.color, ranks: [] };
      hit.ranks.push(Number(rank));
      by.set(z.text, hit);
    }
    return [...by.entries()]
      .map(([text, v]) => ({ text, color: v.color, ranks: v.ranks }))
      .sort((a, b) => Math.min(...a.ranks) - Math.min(...b.ranks));
  })();

  return (
    <div className="tbl">
      {/* 색 띠가 무엇을 뜻하는지 표 위에 적어 둔다 —
          색만 칠해 두면 마우스를 올려 보기 전에는 알 수가 없다. */}
      {legend.length > 0 && (
        <div className="tbl__legend">
          {legend.map((z) => (
            <span className="tbl__lg" key={z.text} style={{ ['--zone' as string]: z.color }}>
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
        const focus = r.team.id === focusTeamId;
        const zone = zoneOf(r.rank);
        return (
          <div className="tbl__row" key={r.team.id} data-open={isOpen} data-focus={focus}>
            <button
              className="tbl__line"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : r.team.id)}
              style={zone ? ({ ['--zone' as string]: zone.color } as React.CSSProperties) : undefined}
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

  const Col = ({ title, list, rec }: { title: string; list: Match[]; rec: { w: number; d: number; l: number } }) => (
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

  return (
    <div className="split">
      <Col title="홈" list={r.home} rec={r.homeRecord} />
      <div className="split__div" />
      <Col title="원정" list={r.away} rec={r.awayRecord} />
    </div>
  );
}
