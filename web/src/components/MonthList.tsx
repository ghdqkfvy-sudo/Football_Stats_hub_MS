import type { Match } from '../lib/types';
import { dayKey, kstParts, kstTime } from '../lib/kst';
import { usePalette } from '../lib/palette';
import { Crest } from './Crest';
import { resultFor } from './Bits';
import { GoalSheet } from './GoalSheet';
import { CompCrest } from './CompCrest';

interface Props {
  matches: Match[];
  focusTeamId: string;
  nextMatchId?: string;
  loadingGoals: Set<string>;
  openId: string | null;
  onToggle: (m: Match) => void;
  selectedDay: string | null;
  /**
   * 경기마다 "우리 팀" 이 다를 때 (Summary 탭은 일곱 팀이 섞인다).
   * 승패와 득점자 색을 이 팀 기준으로 읽는다. 없으면 focusTeamId 를 쓴다.
   */
  focusFor?: (m: Match) => string;
  /**
   * 왼쪽 띠 색을 대회 색 대신 팀 색으로 바꾼다 (Summary 탭).
   * 한 팀만 볼 때는 대회로 나누는 게 맞지만, 여러 팀이 섞이면
   * "누구 경기인가" 가 먼저 읽혀야 한다.
   */
  barColorOf?: (m: Match) => string | undefined;
}

const CLOCK = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export function MonthList({
  matches, focusTeamId, nextMatchId, loadingGoals, openId, onToggle, selectedDay,
  focusFor, barColorOf,
}: Props) {
  const palette = usePalette();

  if (!matches.length) {
    return (
      <div className="empty">
        <h3>이 달에는 경기가 없습니다</h3>
        <p>캘린더에서 다른 달로 이동해 보세요.</p>
      </div>
    );
  }

  const comps = [...new Set(matches.map((m) => m.competition))];

  return (
    <div className="ml">
      {/* 띠가 팀 색을 뜻할 때는 대회 범례가 오히려 오해를 만든다 */}
      {!barColorOf && (
        <div className="ml__legend">
          {comps.map((c) => (
            <span key={c} style={{ ['--c' as string]: palette.color(c) }}>
              <CompCrest k={c} size={16} />
              {palette.name(c)}
            </span>
          ))}
        </div>
      )}

      {matches.map((m) => {
        const p = kstParts(m.kickoffUtc);
        const done = m.status === 'finished';
        const mine = focusFor ? focusFor(m) : focusTeamId;
        const res = resultFor(m, mine);
        const isOpen = openId === m.id;
        const onSelectedDay = selectedDay !== null && dayKey(m.kickoffUtc) === selectedDay;
        const c = barColorOf?.(m) ?? palette.color(m.competition);

        return (
          <div
            className="ml__item"
            key={m.id}
            id={`match-${m.id}`}
            data-open={isOpen}
            data-next={m.id === nextMatchId}
            data-sel={onSelectedDay}
            style={{ ['--c' as string]: c }}
          >
            <button
              className="ml__row"
              aria-expanded={done ? isOpen : undefined}
              onClick={() => onToggle(m)}
              style={!done ? { cursor: 'default' } : undefined}
            >
              <span className="ml__date">
                <b className="num">{p.date}</b>
                <i>{p.weekdayKo}</i>
              </span>

              {/* 참가 대회 구별 택 */}
              <span className="ml__tick" aria-hidden="true" />

              <span className="ml__match">
                <span className="ml__side r">
                  <Crest team={m.home} size={20} />
                  <b>{m.home.abbr}</b>
                </span>

                {done ? (
                  <span className="ml__score num" data-res={res ?? undefined}>
                    {m.homeScore}<i>-</i>{m.awayScore}
                  </span>
                ) : (
                  <span className="ml__vs">vs</span>
                )}

                <span className="ml__side">
                  <Crest team={m.away} size={20} />
                  <b>{m.away.abbr}</b>
                </span>
              </span>

              <span className="ml__meta">
                <span className="ml__comp">
                  <CompCrest k={m.competition} size={16} />
                  {palette.name(m.competition)}
                </span>
                {done ? (
                  <span className="ml__status" data-open={isOpen}>
                    종료
                    {(m.goals.length > 0 || isOpen) && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                        <path d={isOpen ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
                      </svg>
                    )}
                  </span>
                ) : (
                  <span className="ml__ko num" data-tbd={m.timeTBD}>
                    {CLOCK}
                    {m.timeTBD ? 'TBD' : kstTime(m.kickoffUtc)}
                  </span>
                )}
              </span>
            </button>

            {done && (
              <div className="ml__panel">
                <div className="ml__panelIn">
                  <div className="ml__goals">
                    <GoalSheet m={m} loading={loadingGoals.has(m.id)} focusTeamId={mine} />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
