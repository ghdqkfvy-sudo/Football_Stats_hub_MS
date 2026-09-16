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
}

const CLOCK = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export function MonthList({
  matches, focusTeamId, nextMatchId, loadingGoals, openId, onToggle, selectedDay,
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
      <div className="ml__legend">
        {comps.map((c) => (
          <span key={c} style={{ ['--c' as string]: palette.color(c) }}>
            <CompCrest k={c} size={16} />
            {palette.name(c)}
          </span>
        ))}
      </div>

      {matches.map((m) => {
        const p = kstParts(m.kickoffUtc);
        const done = m.status === 'finished';
        const res = resultFor(m, focusTeamId);
        const isOpen = openId === m.id;
        const onSelectedDay = selectedDay !== null && dayKey(m.kickoffUtc) === selectedDay;
        const c = palette.color(m.competition);

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
                    <GoalSheet m={m} loading={loadingGoals.has(m.id)} focusTeamId={focusTeamId} />
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
