import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Match } from '../lib/types';
import { dayKey, kstParts, kstTime, monthGrid, todayKey } from '../lib/kst';
import { usePalette } from '../lib/palette';
import { Crest } from './Crest';
import { CompBadge } from './Bits';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

interface Props {
  matches: Match[];
  year: number;
  month: number;
  onMove: (year: number, month: number) => void;
  /** 선택된 날짜(KST dayKey). 하이라이트·펄스닷이 이 칸으로 이동한다. */
  selectedDay: string | null;
  onSelectDay: (key: string) => void;
  /** 칩을 눌렀을 때 — 모바일은 바텀시트, 데스크톱은 아래 목록 펼치기 */
  onPick: (m: Match) => void;
  /** 다음 경기 날짜(KST dayKey) — 그 칸 숫자에 골드 원이 채워진다 */
  nextDay?: string | null;
}

interface Box { x: number; y: number; w: number; h: number }

export function Calendar({ matches, year, month, onMove, selectedDay, onSelectDay, onPick, nextDay }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const palette = usePalette();

  const byDay = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of matches) {
      const k = dayKey(m.kickoffUtc);
      const arr = map.get(k);
      arr ? arr.push(m) : map.set(k, [m]);
    }
    return map;
  }, [matches]);

  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  const today = todayKey();

  /* ── 하이라이트 마커: 선택된 칸으로 실제로 미끄러져 이동한다 ───────── */
  const gridRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  const [box, setBox] = useState<Box | null>(null);
  const [settled, setSettled] = useState(false); // 첫 배치는 애니메이션 없이

  useLayoutEffect(() => {
    const measure = () => {
      const el = selectedDay ? cellRefs.current.get(selectedDay) : null;
      if (!el || !gridRef.current) return setBox(null);
      setBox({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (gridRef.current) ro.observe(gridRef.current);
    return () => ro.disconnect();
  }, [selectedDay, cells]);

  useEffect(() => {
    if (box && !settled) {
      const id = requestAnimationFrame(() => setSettled(true));
      return () => cancelAnimationFrame(id);
    }
  }, [box, settled]);

  const step = (delta: number) => {
    const m = month + delta;
    if (m < 1) onMove(year - 1, 12);
    else if (m > 12) onMove(year, 1 + 11);
    else onMove(year, m);
  };

  return (
    <div className="cal">
      <div className="cal__bar">
        <div className="cal__title num">
          {year}년 {month}월
        </div>
        <div className="cal__nav">
          <button onClick={() => (month === 1 ? onMove(year - 1, 12) : step(-1))} aria-label="이전 달">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button onClick={() => (month === 12 ? onMove(year + 1, 1) : onMove(year, month + 1))} aria-label="다음 달">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      </div>

      <div className="cal__dow" aria-hidden="true">
        {DOW.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="cal__grid" ref={gridRef}>
        {/* 선택 하이라이트 — 노란 음영 + 펄스닷이 한 덩어리로 움직인다 */}
        {box && (
          <div
            className="cal__marker"
            style={{
              transform: `translate(${box.x}px, ${box.y}px)`,
              width: box.w,
              height: box.h,
              transition: settled ? undefined : 'none',
            }}
            aria-hidden="true"
          >
            <span className="cal__pulse" />
          </div>
        )}

        {cells.map((cell, i) => {
          const list = byDay.get(cell.key) ?? [];
          const dow = i % 7;
          const dnum = parseInt(cell.key.slice(8), 10);
          const selected = cell.key === selectedDay;
          return (
            <div
              key={cell.key + i}
              ref={(el) => {
                if (el) cellRefs.current.set(cell.key, el);
                else cellRefs.current.delete(cell.key);
              }}
              className="day"
              data-out={!cell.inMonth}
              data-today={cell.key === today}
              data-next={cell.key === nextDay}
              data-selected={selected}
              data-has={list.length > 0}
              data-dow={dow}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`${dnum}일${list.length ? ` 경기 ${list.length}건` : ''}`}
              onClick={() => onSelectDay(cell.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectDay(cell.key);
                }
              }}
            >
              <div className="day__n num">{dnum}</div>
              <div className="day__bars">
              {list.map((m) => {
                const done = m.status === 'finished';
                const label = done
                  ? `${m.home.abbr} ${m.homeScore}-${m.awayScore} ${m.away.abbr}`
                  : `${m.home.abbr} vs ${m.away.abbr} ${kstTime(m.kickoffUtc)} KST`;
                return (
                  <div key={m.id} className="barwrap">
                    <button
                      className="bar"
                      data-done={done}
                      style={{ ['--c' as string]: palette.color(m.competition) }}
                      title={label}
                      aria-label={label}
                      onMouseEnter={() => setHover(m.id)}
                      onMouseLeave={() => setHover((h) => (h === m.id ? null : h))}
                      onFocus={() => setHover(m.id)}
                      onBlur={() => setHover((h) => (h === m.id ? null : h))}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDay(cell.key);
                        onPick(m);
                      }}
                    />
                    {hover === m.id && <MatchPopover m={m} col={dow} />}
                  </div>
                );
              })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 캘린더 호버 미리보기 — 결과와 득점자를 바로 보여준다. */
function MatchPopover({ m, col }: { m: Match; col: number }) {
  const done = m.status === 'finished';
  const shift = col <= 1 ? 'calc(-50% + 64px)' : col >= 5 ? 'calc(-50% - 64px)' : '-50%';
  const homeLost = done && (m.homeScore ?? 0) < (m.awayScore ?? 0);
  const awayLost = done && (m.awayScore ?? 0) < (m.homeScore ?? 0);

  return (
    <div className="pop" style={{ transform: `translateX(${shift})` }} role="tooltip">
      <div className="pop__h">
        <CompBadge k={m.competition} dot={false} />
        <span className="eyebrow">{done ? '경기 종료' : kstTime(m.kickoffUtc) + ' KST'}</span>
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
              <span className="num">{g.clock}</span>
              <span>
                {g.scorer}
                {g.penalty ? ' (PK)' : ''}
                {g.ownGoal ? ' (OG)' : ''}
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
            <span>{kstParts(m.kickoffUtc).month}.{kstParts(m.kickoffUtc).date}</span>
            <span>{m.venue}</span>
          </div>
        </div>
      )}
    </div>
  );
}
