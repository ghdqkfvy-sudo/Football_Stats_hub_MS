import type { Target } from '../config/targets';
import type { Match } from '../lib/types';
import { kstTime, todayKey } from '../lib/kst';
import { weekKeys, weekLabel, type DayMatch } from '../lib/summary';
import { Crest } from './Crest';

const WEEKDAY = ['월', '화', '수', '목', '금', '토', '일'];

interface Props {
  startKey: string;
  byDay: Map<string, DayMatch[]>;
  targetOf: (id: string) => Target;
  selectedDay: string | null;
  /** 선택된 날짜 안에서 몇 번째 경기인지 (같은 날 여러 경기 순환) */
  selectedIndex: number;
  onPick: (dayKey: string) => void;
  onMove: (delta: number) => void;
  onToday: () => void;
}

/**
 * 주간 캘린더 — 월~일 7열에 모든 팀 경기를 건다.
 *
 * 경기 한 줄은 그 팀 컬러로 왼쪽 띠를 두른다. 일곱 팀이 섞여 있으므로
 * "누구 경기인가" 가 로고보다 먼저 읽혀야 한다.
 */
export function WeekCalendar({
  startKey, byDay, targetOf, selectedDay, selectedIndex, onPick, onMove, onToday,
}: Props) {
  const keys = weekKeys(startKey);
  const today = todayKey();

  return (
    <div className="wcal">
      <div className="wcal__bar">
        <button className="wcal__nav" onClick={() => onMove(-1)} aria-label="이전 주">‹</button>
        <b className="wcal__label num">{weekLabel(startKey)}</b>
        <button className="wcal__nav" onClick={() => onMove(1)} aria-label="다음 주">›</button>
        <span className="wcal__spacer" />
        <button className="wcal__today" onClick={onToday}>오늘</button>
      </div>

      <div className="wcal__grid">
        {keys.map((k, i) => {
          const list = byDay.get(k) ?? [];
          const isToday = k === today;
          const isSel = k === selectedDay;
          return (
            <div
              className="wcal__cell"
              key={k}
              data-today={isToday || undefined}
              data-sel={isSel || undefined}
              data-empty={list.length === 0 || undefined}
              data-weekend={i >= 5 || undefined}
            >
              <div className="wcal__head">
                <span className="wcal__dow">{WEEKDAY[i]}</span>
                <span className="wcal__date num" data-today={isToday || undefined}>
                  {Number(k.slice(8, 10))}
                </span>
              </div>

              <div className="wcal__list">
                {list.map((dm, idx) => {
                  const t = targetOf(dm.teamId);
                  const m = dm.match;
                  const mine = m.home.id === t.espnTeamId;
                  const opp = mine ? m.away : m.home;
                  const done = m.status === 'finished';
                  const on = isSel && idx === selectedIndex;
                  return (
                    <button
                      className="wcal__m"
                      key={m.id}
                      data-on={on || undefined}
                      /* accent — brand 가 거의 검정인 팀은 띠가 안 보인다 */
                      style={{ ['--team' as string]: t.theme.accent, ['--teamfg' as string]: t.theme.accent }}
                      onClick={() => onPick(k)}
                      title={`${t.name} vs ${opp.name}`}
                    >
                      <span className="wcal__mine">
                        <Crest
                          team={{
                            id: t.espnTeamId, name: t.name, shortName: t.name,
                            abbr: t.abbr, logo: t.crest,
                          }}
                          size={14}
                        />
                        <b>{t.abbr}</b>
                        <i data-side={mine ? 'H' : 'A'}>{mine ? 'H' : 'A'}</i>
                      </span>
                      <span className="wcal__opp">
                        <Crest team={opp} size={14} />
                        <span>{opp.abbr}</span>
                      </span>
                      <span className="wcal__t num">
                        {done ? `${m.homeScore}-${m.awayScore}` : (m.timeTBD ? 'TBD' : kstTime(m.kickoffUtc))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 같은 날 경기가 여럿이면 다시 눌러 넘길 수 있다는 안내 */}
      {selectedDay && (byDay.get(selectedDay)?.length ?? 0) > 1 && (
        <p className="wcal__hint num">
          이 날 경기 {byDay.get(selectedDay)!.length}개 · 날짜를 다시 누르면 다음 경기로
          ({selectedIndex + 1}/{byDay.get(selectedDay)!.length})
        </p>
      )}
    </div>
  );
}

export type { Match };
