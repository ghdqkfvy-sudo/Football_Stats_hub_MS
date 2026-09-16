import { useMemo, useState } from 'react';
import type { LeaderRow } from '../lib/league';
import { Crest } from './Crest';

/**
 * 공격 포인트 순위 — 득점 · 도움 · 공격포인트를 **세 표로 한 번에** 보여 준다.
 *
 * 탭으로 전환하던 예전 방식은 "누가 넣고 누가 만들어 줬는지" 를 비교하려면
 * 매번 클릭해야 했다. 세 표를 나란히 두면 한 화면에서 비교된다.
 *
 * 기본은 8등까지, "더보기" 를 누르면 15등까지 펼친다. 세 표는 그리드
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
function rankRows(rows: LeaderRow[], key: Key, cap: number): Ranked[] {
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
  return ranked.filter((x) => x.rank <= cap);
}

/* 기본: 8위까지 · 최대 8명   ·   더보기: 10위까지 · 최대 15명
   공동 순위 때문에 8위가 여러 명이어도 줄 수는 상한을 넘지 않는다.
   세 표의 바깥 크기는 그리드 stretch 가 맞춰 준다. */
const CAPS = {
  basic: { rank: 8, rows: 8 },
  more: { rank: 10, rows: 15 },
};

export function LeaderBoard({
  rows, note, variant = 'table',
}: {
  rows: LeaderRow[];
  note?: string;
  /** table = 숫자만 (대회 순위표) · bar = 게이지 (팀 내 기록) */
  variant?: 'table' | 'bar';
}) {
  const [expanded, setExpanded] = useState(false);
  const cap = expanded ? CAPS.more : CAPS.basic;

  const cols = useMemo(
    () =>
      COLS.map((col) => ({
        col,
        shown: rankRows(rows, col.key, cap.rank).slice(0, cap.rows),
      })),
    [rows, cap],
  );

  const hasMore = useMemo(
    () =>
      COLS.some(
        (c) =>
          rankRows(rows, c.key, CAPS.more.rank).slice(0, CAPS.more.rows).length >
          rankRows(rows, c.key, CAPS.basic.rank).slice(0, CAPS.basic.rows).length,
      ),
    [rows],
  );

  return (
    <>
      <div className="lb3" data-variant={variant}>
        {cols.map(({ col, shown }) => (
          <Column key={col.key} col={col} shown={shown} variant={variant} />
        ))}
      </div>

      {hasMore && (
        <button className="lb3__more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? '접기' : `더보기 (${CAPS.more.rank}위까지)`}
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
  col, shown, variant,
}: {
  col: (typeof COLS)[number];
  shown: Ranked[];
  variant: 'table' | 'bar';
}) {
  // 게이지 기준값은 그 표의 1위 — 팀 안에서의 비중으로 읽힌다
  const max = shown[0]?.r[col.key] ?? 1;
  return (
    <section className="lbc" data-rev={col.reverse}>
      <header className="lbc__h">
        <h3>{col.label}</h3>
        <span className="lbc__n num">{shown.length}</span>
      </header>

      {shown.length === 0 ? (
        <p className="lbc__none">집계된 기록이 없습니다.</p>
      ) : (
        <ol className="lbc__list">
          {shown.map(({ r, rank: rk }) => (
            <li className="lbc__row" key={`${r.name}-${r.teamId}`} data-top={rk === 1}>
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
