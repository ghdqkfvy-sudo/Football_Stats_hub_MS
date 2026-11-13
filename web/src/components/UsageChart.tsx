import { useMemo, useState } from 'react';
import { useIsMobile } from '../lib/useMedia';
import type { PlayerSeason } from '../lib/squad';
import { POS_KO, usageGroups } from '../lib/usage';

/**
 * 스쿼드 활용도 — 선수별 출전 시간 막대. 진한 부분은 선발로 뛴 시간, 옅은 부분은 교체로 뛴 시간.
 * 포지션마다 한 묶음이라 "이 자리의 주전이 누구고 뒤에 누가 있나" 가 한눈에 보인다.
 * 줄을 누르면 선수 상세가 열린다.
 */
export function UsageChart({ players, covered, onOpen }: {
  players: PlayerSeason[];
  /** 라인업이 확보된 팀 경기 수 — 막대의 기준(전 경기 풀타임) */
  covered: number;
  onOpen: (p: PlayerSeason) => void;
}) {
  const groups = useMemo(() => usageGroups(players), [players]);
  const max = Math.max(covered * 90, ...groups.flatMap((g) => g.rows.map((r) => r.total)), 1);
  /* 폰 — 포지션마다 위 네 명만 먼저. 스물 몇 줄을 다 펼치면 선수 탭이 한 화면 넘게 길어진다 */
  const mobile = useIsMobile();
  const [all, setAll] = useState(false);
  const FIRST = 4;
  const hidden = mobile && !all ? groups.reduce((n, g) => n + Math.max(0, g.rows.length - FIRST), 0) : 0;
  if (!groups.length) return null;
  return (
    <div className="usage">
      {groups.map((g) => (
        <section key={g.pos} className="usage__grp" data-pos={g.pos}>
          <h3><em className="pcard__pos" data-pos={g.pos}>{g.pos === 'G' ? 'GK' : g.pos === 'D' ? 'DF' : g.pos === 'M' ? 'MF' : 'FW'}</em>{POS_KO[g.pos]} <span className="num">{g.rows.length}명</span></h3>
          <ol>
            {(mobile && !all ? g.rows.slice(0, FIRST) : g.rows).map(({ p, start, sub, total }) => (
              <li key={p.id}>
                <button className="usage__row" onClick={() => onOpen(p)} title={`${p.name} — 선발 ${start}분 · 교체 ${sub}분`}>
                  <span className="usage__name">{p.name.split(' ').slice(-1)[0]}</span>
                  <span className="usage__track">
                    <i data-k="start" style={{ width: `${(start / max) * 100}%` }} />
                    <i data-k="sub" style={{ width: `${(sub / max) * 100}%` }} />
                  </span>
                  <span className="usage__min num">{total}&apos;</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {mobile && (hidden > 0 || all) && (
        <button className="usage__more" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? '접기' : <>전체 보기 <span className="num">(+{hidden}명)</span></>}
        </button>
      )}
      <p className="usage__key">
        <span><i data-k="start" />선발로 뛴 시간</span>
        <span><i data-k="sub" />교체로 뛴 시간</span>
        <span className="num">막대 끝 = {covered}경기 풀타임({covered * 90}분)</span>
      </p>
    </div>
  );
}
