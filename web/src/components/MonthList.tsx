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
  /**
   * 그 경기에서 **상대 팀**을 칠할 색 (Summary).
   * Summary 는 늘 흰색(targets 의 SUMMARY_OPP)을 넘긴다.
   */
  oppColorOf?: (m: Match) => string | undefined;
}

const CLOCK = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export function MonthList({
  matches, focusTeamId, nextMatchId, loadingGoals, openId, onToggle, selectedDay,
  focusFor, barColorOf, oppColorOf,
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
        /* focusFor 가 있을 때(= 여러 팀이 섞인 목록)만 좌우를 우리 기준으로 뒤집는다 */
        const ours = focusFor && (m.home.id === mine || m.away.id === mine)
          ? (m.home.id === mine
            ? { us: m.home, opp: m.away, home: true, usScore: m.homeScore, oppScore: m.awayScore }
            : { us: m.away, opp: m.home, home: false, usScore: m.awayScore, oppScore: m.homeScore })
          : null;
        const isOpen = openId === m.id;
        const onSelectedDay = selectedDay !== null && dayKey(m.kickoffUtc) === selectedDay;
        const c = barColorOf?.(m) ?? palette.color(m.competition);
        /* 펼친 득점 기록도 이 경기의 우리 팀 색으로 읽히게 한다.
           Summary 는 일곱 팀이 섞여 있어 앱 전역 --accent 로는 "누가 우리인지"
           가 표현되지 않는다. 상대 색(--opp)도 팀별로 갈아 끼운다. */
        const teamVars = barColorOf
          ? { ['--accent']: c, ['--opp']: oppColorOf?.(m) ?? '#FFFFFF' }
          : null;

        return (
          <div
            className="ml__item"
            key={m.id}
            id={`match-${m.id}`}
            data-open={isOpen}
            data-next={m.id === nextMatchId}
            data-sel={onSelectedDay}
            style={{ ['--c' as string]: c, ...(teamVars ?? {}) } as React.CSSProperties}
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

              {/*
                * 여러 팀이 섞인 목록(Summary)에서는 **우리 팀을 항상 왼쪽**에
                * 둔다. 홈/원정에 따라 자리가 바뀌면 줄마다 눈이 좌우를 다시
                * 찾아야 해서 스무 줄을 훑는 데 방해가 된다. 대신 H/A 배지로
                * 어느 쪽이었는지 알려 준다.
                * 한 팀만 보는 팀 탭에서는 예전처럼 홈-원정 순서를 지킨다.
                */}
              {ours ? (
                <span className="ml__match" data-ours="true">
                  <span className="ml__side r">
                    <i className="ml__ha" data-home={ours.home || undefined}>
                      <span className="ml__long">{ours.home ? 'HOME' : 'AWAY'}</span>
                      <span className="ml__short">{ours.home ? 'H' : 'A'}</span>
                    </i>
                    <b className="ml__long">{ours.us.shortName || ours.us.abbr}</b>
                    <b className="ml__short">{ours.us.abbr}</b>
                    <Crest team={ours.us} size={22} />
                  </span>

                  {done ? (
                    /* 스코어는 승패색이 아니라 **누구 골인가**로 칠한다 —
                       우리 득점은 팀 컬러, 상대 득점은 흰색(뉴캐슬은 하늘색).
                       승패는 오른쪽 W/D/L 칩이 따로 말해 준다. */
                    <span className="ml__score num" data-res={res ?? undefined}>
                      <b className="ml__su">{ours.usScore}</b>
                      <i>-</i>
                      <b className="ml__so">{ours.oppScore}</b>
                    </span>
                  ) : (
                    <span className="ml__vs">vs</span>
                  )}

                  <span className="ml__side">
                    <Crest team={ours.opp} size={22} />
                    <b className="ml__long">{ours.opp.shortName || ours.opp.abbr}</b>
                    <b className="ml__short">{ours.opp.abbr}</b>
                    {/* 승패는 한 글자 칩으로 — 스무 줄을 훑을 때 색만 봐도 잡힌다 */}
                    {done && res
                      ? <i className="fchip ml__res" data-r={res}>{res}</i>
                      : <i className="ml__res" aria-hidden="true" />}
                  </span>
                </span>
              ) : (
                <span className="ml__match">
                  <span className="ml__side r">
                    <Crest team={m.home} size={20} />
                    <b>{m.home.abbr}</b>
                  </span>

                  {done ? (
                    /* 팀 탭도 같은 규칙 — 우리 득점은 팀 컬러, 상대는 흰색.
                       여기서는 홈-원정 순서를 지키므로 색으로만 가른다. */
                    <span className="ml__score num" data-res={res ?? undefined}>
                      <b className={m.home.id === mine ? 'ml__su' : 'ml__so'}>{m.homeScore}</b>
                      <i>-</i>
                      <b className={m.home.id === mine ? 'ml__so' : 'ml__su'}>{m.awayScore}</b>
                    </span>
                  ) : (
                    <span className="ml__vs">vs</span>
                  )}

                  <span className="ml__side">
                    <Crest team={m.away} size={20} />
                    <b>{m.away.abbr}</b>
                  </span>
                </span>
              )}

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
