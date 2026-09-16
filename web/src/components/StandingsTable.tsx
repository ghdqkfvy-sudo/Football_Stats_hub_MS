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
  /** 상위 N위까지 별도 색 띠 (챔스 진출권 등) */
  zones?: { upTo: number; color: string; label: string }[];
}

export function StandingsTable({ table, matches, focusTeamId, zones = [] }: Props) {
  const [open, setOpen] = useState<string | null>(null);

  const zoneOf = (rank: number) => zones.find((z) => rank <= z.upTo);

  return (
    <div className="tbl">
      {/* 색 띠가 무엇을 뜻하는지 표 위에 적어 둔다 —
          색만 칠해 두면 마우스를 올려 보기 전에는 알 수가 없다. */}
      {zones.length > 0 && (
        <div className="tbl__legend">
          {zones.map((z, i) => {
            const from = i === 0 ? 1 : zones[i - 1].upTo + 1;
            return (
              <span className="tbl__lg" key={z.label} style={{ ['--zone' as string]: z.color }}>
                <i aria-hidden="true" />
                <b className="num">{from === z.upTo ? `${z.upTo}위` : `${from}–${z.upTo}위`}</b>
                {z.label}
              </span>
            );
          })}
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
              title={zone?.label}
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
