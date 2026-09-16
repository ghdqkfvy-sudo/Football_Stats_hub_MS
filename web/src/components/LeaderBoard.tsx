import type { LeaderRow } from '../lib/league';
import { Crest } from './Crest';

/**
 * 공격 포인트 순위 — 득점 · 도움 · 공격포인트를 **세 표로 한 번에** 보여 준다.
 *
 * 탭으로 전환하던 예전 방식은 "누가 넣고 누가 만들어 줬는지" 를 비교하려면
 * 매번 클릭해야 했다. 세 표를 나란히 두면 한 화면에서 비교된다.
 *
 * 게이지는 팀 컬러 그라데이션이다. 세 지표가 전부 accent 하나로 칠해지면
 * 막대만 봐서는 어떤 표인지 구분이 안 되므로, 도움만 방향을 뒤집는다.
 *   득점 · 공격포인트 : accent → secondary
 *   도움            : secondary → accent
 * 기준값(100%)은 각 표의 1위, 즉 그 선수단의 최고 기록이다.
 */

type Key = 'goals' | 'assists' | 'points';

const COLS: { key: Key; label: string; suffix: string; reverse: boolean }[] = [
  { key: 'goals', label: '득점', suffix: 'G', reverse: false },
  { key: 'assists', label: '도움', suffix: 'A', reverse: true },
  { key: 'points', label: '공격 포인트', suffix: 'P', reverse: false },
];

export function LeaderBoard({
  rows, limit = 8, note,
}: { rows: LeaderRow[]; limit?: number; note?: string }) {
  return (
    <>
      <div className="lb3">
        {COLS.map((c) => (
          <Column key={c.key} col={c} rows={rows} limit={limit} />
        ))}
      </div>
      {/* 주석은 표마다 반복하지 않고 아래에 한 번만 */}
      {note && <p className="lb3__note">{note}</p>}
    </>
  );
}

function Column({
  col, rows, limit,
}: {
  col: (typeof COLS)[number];
  rows: LeaderRow[];
  limit: number;
}) {
  const sorted = [...rows]
    .filter((r) => r[col.key] > 0)
    .sort((a, b) => b[col.key] - a[col.key] || b.goals - a.goals || a.name.localeCompare(b.name));

  /*
   * 공동 순위 처리: 기록(r[col.key])이 같으면 같은 등수를 받는다(1,2,2,4식).
   * "limit 등까지" 는 줄 수가 아니라 등수 기준이라, 8등이 여럿이면 전부 보여준다.
   */
  let rank = 0;
  let prevVal: number | null = null;
  const ranked = sorted.map((r, i) => {
    if (prevVal === null || r[col.key] !== prevVal) rank = i + 1;
    prevVal = r[col.key];
    return { r, rank };
  });
  const shown = ranked.filter((x) => x.rank <= limit);

  // 기준값은 이 선수단의 최고 기록 — 절대값이 아니라 팀 안에서의 비중으로 읽힌다
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
              <span className="lbc__meter" aria-hidden="true">
                <i style={{ width: `${Math.max(7, (r[col.key] / max) * 100)}%` }} />
              </span>
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
