import { useMemo, useState } from 'react';
import type { LeaderRow } from '../lib/league';
import { Crest } from './Crest';

/**
 * 공격 포인트 순위 — 득점 · 도움 · 공격포인트를 **세 표로 한 번에** 보여 준다.
 *
 * 탭으로 전환하던 예전 방식은 "누가 넣고 누가 만들어 줬는지" 를 비교하려면
 * 매번 클릭해야 했다. 세 표를 나란히 두면 한 화면에서 비교된다.
 *
 * 기본은 8명, "더보기" 를 누르면 15명까지 펼친다(동점자는 함께 남는다). 세 표는 그리드
 * stretch 로 항상 같은 높이가 된다.
 *
 * 막대(게이지)는 쓰지 않는다 — 순위표는 숫자를 정확히 비교하는 자리라
 * 막대가 오히려 시선을 흐린다. 등수·엠블럼·이름·기록만 남긴 표다.
 */

type Key = 'goals' | 'assists' | 'points';

const COLS: { key: Key; label: string; suffix: string; reverse: boolean }[] = [
  { key: 'goals', label: '득점', suffix: 'G', reverse: false },
  { key: 'assists', label: '도움', suffix: 'A', reverse: true },
  { key: 'points', label: '공격 포인트', suffix: 'P', reverse: false },
];

interface Ranked {
  r: LeaderRow;
  rank: number;
}

/**
 * 공동 순위 처리: 기록이 같으면 같은 등수를 받는다(1,2,2,4식).
 * "n등까지" 는 줄 수가 아니라 등수 기준이라, n등이 여럿이면 전부 보여준다.
 */
function rankRows(rows: LeaderRow[], key: Key, take: number): Ranked[] {
  const sorted = [...rows]
    .filter((r) => r[key] > 0)
    .sort((a, b) => b[key] - a[key] || b.goals - a.goals || a.name.localeCompare(b.name));

  let rank = 0;
  let prev: number | null = null;
  const ranked = sorted.map((r, i) => {
    if (prev === null || r[key] !== prev) rank = i + 1;
    prev = r[key];
    return { r, rank };
  });

  /*
   * "몇 명까지" 로 자른다 — 등수로 자르면 리그마다 결과가 들쭉날쭉했다.
   * 라리가 득점은 7,6,6,6,6,5,5,4,4,4,3… 이라 10위가 11번째부터 시작해
   * "10위까지" 가 곧 10명이었고, 더보기를 눌러도 8명 → 10명뿐이었다.
   * (프리미어리그는 같은 규칙으로 25명이 걸려 15명이 다 찼다.)
   * 지금은 n명을 세되 **마지막 사람과 동점인 선수는 같이 남긴다** —
   * 같은 기록인데 누구는 잘리는 표는 순위표가 아니다.
   */
  /* 상한은 딱 지킨다 — 동점자까지 다 남기면 도움 표가 24명까지 늘어나
     "최대 15명" 이 무의미해진다. 동점 안에서의 순서는 득점 → 이름 순으로
     고정돼 있어(sorted) 새로고침할 때마다 뒤바뀌지는 않는다. */
  return ranked.slice(0, take);
}

/* 기본 8명 · 더보기 15명 (동점자는 상한을 넘겨도 함께 남는다) */
const CAPS = { basic: 8, more: 15 };

export function LeaderBoard({
  rows, note, variant = 'table', teamColors,
}: {
  rows: LeaderRow[];
  note?: string;
  /** table = 숫자만 (대회 순위표) · bar = 게이지 (팀 내 기록) */
  variant?: 'table' | 'bar';
  /** 우리 팀 선수를 그 팀 컬러로 강조한다 (Summary 탭) */
  teamColors?: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const take = expanded ? CAPS.more : CAPS.basic;

  const cols = useMemo(
    () => COLS.map((col) => ({ col, shown: rankRows(rows, col.key, take) })),
    [rows, take],
  );

  const hasMore = useMemo(
    () =>
      COLS.some(
        (c) => rankRows(rows, c.key, CAPS.more).length > rankRows(rows, c.key, CAPS.basic).length,
      ),
    [rows],
  );

  return (
    <>
      <div className="lb3" data-variant={variant}>
        {cols.map(({ col, shown }) => (
          <Column key={col.key} col={col} shown={shown} variant={variant} teamColors={teamColors} />
        ))}
      </div>

      {hasMore && (
        <button className="lb3__more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? '접기' : `더보기 (${CAPS.more}명까지)`}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
            <path d={expanded ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
          </svg>
        </button>
      )}

      {/* 주석은 표마다 반복하지 않고 아래에 한 번만 */}
      {note && <p className="lb3__note">{note}</p>}
    </>
  );
}

function Column({
  col, shown, variant, teamColors,
}: {
  col: (typeof COLS)[number];
  shown: Ranked[];
  variant: 'table' | 'bar';
  teamColors?: Record<string, string>;
}) {
  // 게이지 기준값은 그 표의 1위 — 팀 안에서의 비중으로 읽힌다
  const max = shown[0]?.r[col.key] ?? 1;
  return (
    <section className="lbc" data-rev={col.reverse}>
      <header className="lbc__h">
        <h3>{col.label}</h3>
      </header>

      {shown.length === 0 ? (
        <p className="lbc__none">집계된 기록이 없습니다.</p>
      ) : (
        <ol className="lbc__list">
          {shown.map(({ r, rank: rk }) => (
            <li
              className="lbc__row"
              key={`${r.name}-${r.teamId}`}
              data-top={rk === 1}
              /* 우리 팀 선수는 그 팀 컬러로 — 여러 팀이 섞인 대회 순위에서
                 "우리 선수가 몇 위인가" 가 먼저 읽혀야 한다 */
              data-mine={teamColors?.[r.teamId] ? true : undefined}
              style={teamColors?.[r.teamId]
                ? ({ ['--accent']: teamColors[r.teamId] } as React.CSSProperties)
                : undefined}
            >
              <span className="lbc__rank num">{rk}</span>
              {r.team ? <Crest team={r.team} size={18} /> : <span className="lbc__pad" />}
              <span className="lbc__name">{r.name}</span>
              {variant === 'bar' && (
                <span className="lbc__meter" aria-hidden="true">
                  <i style={{ width: `${Math.max(7, (r[col.key] / max) * 100)}%` }} />
                </span>
              )}
              <span className="lbc__v num">
                {r[col.key]}
                <em>{col.suffix}</em>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
