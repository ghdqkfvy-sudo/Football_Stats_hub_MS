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

  /* 어시스트는 골과 짝지어 오지 않는다 — ESPN 은 "이 경기에서 이 선수가
     도움 n" 형태로만 준다. 그래서 골 목록 아래에 팀별로 모아 적는다. */
  const assisters = (m.playerStats ?? []).filter((s) => s.a > 0);

  return (
    <>
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

    {assisters.length > 0 && (
      <div className="gl__assists">
        <span className="gl__alabel">도움</span>
        {assisters.map((s, i) => (
          <span className="gl__aname" key={`${s.name}-${i}`}>
            <i>{abbrOf(s.teamId)}</i>
            {s.name}
            {s.a > 1 && <b className="num">×{s.a}</b>}
          </span>
        ))}
      </div>
    )}
    </>
  );
}
