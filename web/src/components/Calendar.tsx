import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Match } from '../lib/types';
import { dayKey, kstTime, monthGrid, todayKey } from '../lib/kst';
import { usePalette } from '../lib/palette';
import { MatchPopCard } from './MatchPop';

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
  /** 지금 보고 있는 팀 — 득점자 옆 팀 약어를 팀 컬러로 칠할 기준 */
  focusTeamId?: string;
}

interface Box { x: number; y: number; w: number; h: number }

/** 실제 마우스가 있는 기기인지 — 터치 기기는 "호버" 개념이 없어 탭으로 대신한다 */
const HAS_HOVER =
  typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

export function Calendar({ matches, year, month, onMove, selectedDay, onSelectDay, onPick, nextDay, focusTeamId }: Props) {
  /* 미리보기는 경기 막대가 아니라 **날짜 칸 전체**에 마우스를 올리면 뜬다.
     막대는 얇아서 조준하기가 어렵고, 하루에 여러 경기가 있으면 어느 막대에
     올렸는지에 따라 다른 카드가 떠서 산만했다. 이제 그 날 경기를 한 카드에
     모아 보여 준다. */
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const palette = usePalette();

  const byDay = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of matches) {
      const k = dayKey(m.kickoffUtc);
      const arr = map.get(k);
      if (arr) arr.push(m);
      else map.set(k, [m]);
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
              data-hover={hoverDay === cell.key && list.length > 0}
              data-dow={dow}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`${dnum}일${list.length ? ` 경기 ${list.length}건` : ''}`}
              onMouseEnter={() => setHoverDay(cell.key)}
              onMouseLeave={() => setHoverDay((h) => (h === cell.key ? null : h))}
              onFocus={() => setHoverDay(cell.key)}
              onBlur={() => setHoverDay((h) => (h === cell.key ? null : h))}
              onClick={() => {
                /* 터치 기기에는 호버가 없다 — 첫 탭은 미리보기만 띄운다 */
                if (!HAS_HOVER && list.length > 0 && hoverDay !== cell.key) setHoverDay(cell.key);
                onSelectDay(cell.key);
              }}
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
                  : `${m.home.abbr} vs ${m.away.abbr} ${m.timeTBD ? '시각 미정' : `${kstTime(m.kickoffUtc)} KST`}`;
                return (
                  <div key={m.id} className="barwrap">
                    <button
                      className="bar"
                      data-done={done}
                      data-sel={selected}
                      style={{ ['--c' as string]: palette.color(m.competition) }}
                      title={label}
                      aria-label={label}
                      onClick={(e) => {
                        // 막대는 "열기" 전용 — 미리보기는 날짜 칸 호버가 맡는다
                        e.stopPropagation();
                        onSelectDay(cell.key);
                        onPick(m);
                      }}
                    />
                  </div>
                );
              })}
              </div>

              {hoverDay === cell.key && list.length > 0 && (
                <DayPopover
                  matches={list}
                  col={dow}
                  focusTeamId={focusTeamId}
                  onClose={() => setHoverDay(null)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 날짜 칸 호버 미리보기 — 그 날 경기를 한 카드에 모아 보여준다. */
function DayPopover({
  matches, col, focusTeamId, onClose,
}: {
  matches: Match[];
  col: number;
  focusTeamId?: string;
  onClose: () => void;
}) {
  const shift = col <= 1 ? 'calc(-50% + 64px)' : col >= 5 ? 'calc(-50% - 64px)' : '-50%';
  return (
    <div className="pop" style={{ transform: `translateX(${shift})` }} role="tooltip">
      {/* 손가락으로는 "마우스를 치우는" 동작이 없다 — 닫기 단추를 준다.
          카드 자체는 pointer-events:none 이라 이 단추만 살려 둔다. */}
      <button
        className="pop__x"
        aria-label="미리보기 닫기"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        ✕
      </button>
      {matches.map((m, i) => (
        <div className="pop__m" key={m.id} data-first={i === 0}>
          <MatchPopCard m={m} focusTeamId={focusTeamId} />
        </div>
      ))}
    </div>
  );
}
