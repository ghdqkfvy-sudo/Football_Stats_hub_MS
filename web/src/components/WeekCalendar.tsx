import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SUMMARY_OPP, summaryColor, type Target } from '../config/targets';
import type { Match } from '../lib/types';
import { kstTime, todayKey } from '../lib/kst';
import { weekKeys, weekLabel, type DayMatch } from '../lib/summary';
import { Crest } from './Crest';
import { MatchPopCard } from './MatchPop';

const WEEKDAY = ['월', '화', '수', '목', '금', '토', '일'];

/** 실제 마우스가 있는 기기인지 — 터치에는 "호버" 가 없어 탭(=선택)만 남긴다 */
const HAS_HOVER =
  typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

interface Pop {
  m: Match; teamId: string; x: number; y: number; above: boolean;
  /** 그 경기 우리 팀 색 / 상대 색 — 포털이라 앱의 테마 변수를 못 받는다 */
  accent: string; opp: string;
}

/**
 * 타일 옆에 뜨는 미리보기.
 *
 * ⚠️ `position: fixed` + 포털이다. `.wcal` 이 `overflow: hidden`(둥근 모서리
 * 때문에) 이라 칸 안에서 absolute 로 띄우면 잘려 나간다. 월간 캘린더는
 * `.cal` 이 visible 이라 absolute 로 되지만 여기는 안 된다.
 */
function TilePop({ pop }: { pop: Pop }) {
  const W = 262;
  const x = Math.min(Math.max(pop.x - W / 2, 10), window.innerWidth - W - 10);
  const style: React.CSSProperties = {
    ...(pop.above
      ? { position: 'fixed', left: x, bottom: window.innerHeight - pop.y + 8, top: 'auto', transform: 'none' }
      : { position: 'fixed', left: x, top: pop.y + 8, bottom: 'auto', transform: 'none' }),
    /*
     * ⚠️ 이 카드는 포털로 document.body 에 붙는다 — 앱이 테마 변수를 심어
     * 둔 div 바깥이다. 그래서 득점자 팀 약어가 쓰는 `--accent` 가 :root
     * 기본값(레알 노랑)으로 떨어져, **누구 경기든 전부 레알 색**으로 떴다.
     * 여기서 그 경기의 팀 색을 직접 얹는다.
     */
    ['--accent' as string]: pop.accent,
    ['--opp' as string]: pop.opp,
  };
  return createPortal(
    <div className="pop" style={style} role="tooltip">
      <MatchPopCard m={pop.m} focusTeamId={pop.teamId} />
    </div>,
    document.body,
  );
}

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
  const [pop, setPop] = useState<Pop | null>(null);

  /* 주가 바뀌면 떠 있던 미리보기는 더 이상 그 자리의 경기가 아니다 */
  useEffect(() => { setPop(null); }, [startKey]);

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
          /* 고른 칸의 강조색은 지금 보고 있는 경기의 팀 컬러다 —
             일곱 팀이 섞인 달력이라 전역 accent 로는 누구 경기인지 안 보인다 */
          const pick = isSel
            ? (() => {
              const t = targetOf(list[Math.min(selectedIndex, Math.max(0, list.length - 1))]?.teamId ?? '');
              return t ? summaryColor(t) : undefined;
            })()
            : undefined;
          return (
            <div
              className="wcal__cell"
              key={k}
              data-today={isToday || undefined}
              data-sel={isSel || undefined}
              data-empty={list.length === 0 || undefined}
              data-weekend={i >= 5 || undefined}
              style={pick ? ({ ['--pick']: pick } as React.CSSProperties) : undefined}
            >
              <div className="wcal__head">
                <span className="wcal__dow">{WEEKDAY[i]}</span>
                {/* 월간 캘린더와 같은 펄스닷.
                    날짜 숫자 위에 겹치지 않도록 머리줄 안에 흐름대로 놓는다. */}
                {isSel && list.length > 0 && <span className="wcal__pulse" aria-hidden="true" />}
                <span className="wcal__spread" />
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
                      style={{ ['--team' as string]: summaryColor(t), ['--teamfg' as string]: summaryColor(t) }}
                      onClick={() => onPick(k)}
                      onMouseEnter={(e) => {
                        if (!HAS_HOVER) return;
                        const r = e.currentTarget.getBoundingClientRect();
                        /* 위쪽에 자리가 없으면 아래로 뒤집는다 */
                        const above = r.top > 260;
                        setPop({
                          m, teamId: t.espnTeamId,
                          x: r.left + r.width / 2,
                          y: above ? r.top : r.bottom,
                          above,
                          accent: summaryColor(t),
                          opp: SUMMARY_OPP,
                        });
                      }}
                      onMouseLeave={() => setPop(null)}
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
                      {/* 종료 스코어와 예정 킥오프는 이 칸에서 제일 먼저 찾는 값이다 —
                          data-done 으로 갈라 서로 다른 무게를 준다 */}
                      <span className="wcal__t num" data-done={done || undefined}>
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

      {pop && <TilePop pop={pop} />}

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
