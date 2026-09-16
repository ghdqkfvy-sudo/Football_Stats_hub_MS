import type { Match } from '../lib/types';
import { assignAssists, leftoverAssists } from '../lib/assists';

/**
 * 종료 경기의 득점 기록 — 시간순 한 줄씩.
 * `14'  RMA  Kylian Mbappé   A Brahim Díaz` 형태로, 분·팀·득점자·어시스트가
 * 같은 열에 정렬돼 여러 골이 있어도 눈이 한 줄로 흐른다.
 */
export function GoalSheet({
  m, loading, focusTeamId,
}: {
  m: Match;
  loading?: boolean;
  /** 우리가 보고 있는 팀 — 상대 팀 득점은 흰색으로 구분한다 */
  focusTeamId?: string;
}) {
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

  /* 1순위는 API 가 직접 준 도움이다 — core /plays 의 득점 play 가
     participants 에 type:"assister" 를 같이 준다(스냅샷이 미리 붙여 둔다).
     아직 안 받은 경기만 시간 추론으로 메우고(lib/assists.ts), 그것도
     애매하면 아래 "도움" 줄에 따로 적는다. */
  const guessed = assignAssists(
    m.goals.map((g) => (g.assist ? { ...g, ownGoal: true } : g)), // 이미 붙은 골은 후보에서 뺀다
    m.playerStats,
  );
  /** i번째 골의 도움 이름 — API 값이 있으면 그것, 없으면 추론값 */
  const assistOf = (i: number) => m.goals[i].assist ?? guessed.get(i);

  // 남은 도움 줄을 셀 때는 API 값도 "이미 쓴 도움" 으로 세야 중복이 안 생긴다
  const used = new Map<number, string>();
  m.goals.forEach((_, i) => {
    const a = assistOf(i);
    if (a) used.set(i, a);
  });
  const assisters = leftoverAssists(m.playerStats, used);

  return (
    <>
    <ul className="gl">
      {m.goals.map((g, i) => (
        <li
          className="gl__row"
          key={i}
          data-opp={focusTeamId && g.teamId ? g.teamId !== focusTeamId : undefined}
        >
          <span className="gl__m num">{g.clock}</span>
          <span className="gl__t">{abbrOf(g.teamId)}</span>
          <span className="gl__s">
            {g.scorer}
            {g.penalty && <em className="gl__tag">PK</em>}
            {g.ownGoal && <em className="gl__tag">OG</em>}
          </span>
          {assistOf(i) && (
            <span
              className="gl__a"
              // 추론으로 붙인 도움은 살짝 흐리게 — 근거가 다르다는 걸 숨기지 않는다
              data-guess={g.assist ? undefined : true}
              title={g.assist ? undefined : '출전 시간으로 좁힌 추정 도움'}
            >
              <i>A</i>
              {assistOf(i)}
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
