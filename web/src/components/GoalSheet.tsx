import type { Match } from '../lib/types';

/**
 * 종료 경기의 득점 기록 — 시간순 한 줄씩.
 * `14'  RMA  Kylian Mbappé   A Brahim Díaz` 형태로, 분·팀·득점자·어시스트가
 * 같은 열에 정렬돼 여러 골이 있어도 눈이 한 줄로 흐른다.
 */
export function GoalSheet({ m, loading }: { m: Match; loading?: boolean }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="skel" style={{ height: 13, width: '42%' }} />
        <div className="skel" style={{ height: 13, width: '56%' }} />
      </div>
    );
  }

  if (!m.goals.length) {
    return (
      <p className="nogoal">
        {m.homeScore === 0 && m.awayScore === 0
          ? '양 팀 모두 득점이 없었습니다.'
          : '이 경기의 득점 상세 기록이 제공되지 않습니다.'}
      </p>
    );
  }

  const abbrOf = (teamId: string) =>
    teamId === m.home.id ? m.home.abbr : teamId === m.away.id ? m.away.abbr : '—';

  return (
    <ul className="gl">
      {m.goals.map((g, i) => (
        <li className="gl__row" key={i}>
          <span className="gl__m num">{g.clock}</span>
          <span className="gl__t">{abbrOf(g.teamId)}</span>
          <span className="gl__s">
            {g.scorer}
            {g.penalty && <em className="gl__tag">PK</em>}
            {g.ownGoal && <em className="gl__tag">OG</em>}
          </span>
          {g.assist && (
            <span className="gl__a">
              <i>A</i>
              {g.assist}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
