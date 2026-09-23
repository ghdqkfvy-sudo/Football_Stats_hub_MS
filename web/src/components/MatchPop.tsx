import type { Match } from '../lib/types';
import { kstTime } from '../lib/kst';
import { Crest } from './Crest';
import { CompBadge } from './Bits';

/**
 * 호버 미리보기 카드 한 건 — 결과와 득점자를 바로 보여 준다.
 *
 * 원래 Calendar.tsx 안에만 있던 것을 꺼냈다. 주간 캘린더(Summary)에도
 * 같은 미리보기가 필요한데, 같은 모양을 두 번 적으면 한쪽만 고쳐지는 날이
 * 반드시 온다. 위치 잡는 방식(월간은 날짜 칸 기준 absolute, 주간은 타일
 * 기준 fixed)만 부르는 쪽이 정하고, **안에 무엇을 그리는지는 여기 하나**다.
 */
export function MatchPopCard({ m, focusTeamId }: { m: Match; focusTeamId?: string }) {
  const done = m.status === 'finished';

  /* 득점자가 어느 팀인지 한 눈에 — 우리 팀은 팀 컬러, 상대는 흰색.
     이름만 있으면 5-2 경기에서 누가 누구 팀인지 읽을 수가 없다. */
  const abbrOf = (teamId: string) =>
    teamId === m.home.id ? m.home.abbr : teamId === m.away.id ? m.away.abbr : '';
  const homeLost = done && (m.homeScore ?? 0) < (m.awayScore ?? 0);
  const awayLost = done && (m.awayScore ?? 0) < (m.homeScore ?? 0);

  return (
    <>
      <div className="pop__h">
        <CompBadge k={m.competition} dot={false} />
        <span className="eyebrow">
          {done ? '경기 종료' : m.timeTBD ? '시각 미정 (TBD)' : kstTime(m.kickoffUtc) + ' KST'}
        </span>
      </div>

      <div className="pop__row" data-lost={homeLost}>
        <Crest team={m.home} size={18} />
        <span>{m.home.shortName}</span>
        <b className="num">{done ? m.homeScore : '-'}</b>
      </div>
      <div className="pop__row" data-lost={awayLost}>
        <Crest team={m.away} size={18} />
        <span>{m.away.shortName}</span>
        <b className="num">{done ? m.awayScore : '-'}</b>
      </div>

      {done && m.goals.length > 0 && (
        <div className="pop__g">
          {m.goals.map((g, i) => (
            <div className="pop__gi" key={i}>
              <span className="pop__gt num">{g.clock}</span>
              <span
                className="pop__gteam num"
                data-opp={focusTeamId && g.teamId ? g.teamId !== focusTeamId : undefined}
              >
                {abbrOf(g.teamId)}
              </span>
              <span className="pop__gn">
                {g.scorer}
                {g.penalty ? ' (PK)' : ''}
                {g.ownGoal ? ' (OG)' : ''}
                {g.assist && <i className="pop__ga">A {g.assist}</i>}
              </span>
            </div>
          ))}
        </div>
      )}
      {done && m.goals.length === 0 && (
        <div className="pop__g">
          <div className="pop__gi" style={{ color: 'var(--text-lo)' }}>
            <span>득점 상세 기록 없음</span>
          </div>
        </div>
      )}
      {!done && m.venue && (
        <div className="pop__g">
          <div className="pop__gi">
            <span>{m.venue}</span>
          </div>
        </div>
      )}
    </>
  );
}
