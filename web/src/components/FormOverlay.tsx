import type { PlayerSeason } from '../lib/squad';
import { alignRatings } from '../lib/playerForm';
import { fmtRating } from '../lib/rating';

const LO = 5;
const HI = 10;

/**
 * 두 선수의 경기별 평점 겹쳐 보기(선수 비교 창).
 * 가로는 날짜가 아니라 "몇 경기 전" — 둘이 뛴 경기가 달라서 최근 출전 쪽을 맞춘다(맨 오른쪽 = 가장 최근).
 * 색은 비교 막대와 같다: 왼쪽 선수 = 팀 컬러, 오른쪽 선수 = 하늘색. 평점 없는 경기는 선이 끊긴다.
 */
export function FormOverlay({ a, b }: { a: PlayerSeason; b: PlayerSeason }) {
  const r = alignRatings(a.recent, b.recent, 12);
  const rated = (x: (number | null)[]) => x.filter((v) => v != null).length;
  if (r.len < 3 || (rated(r.a) < 2 && rated(r.b) < 2)) return null;

  const W = 560;
  const H = 130;
  const M = { l: 22, r: 8, t: 8, b: 18 };
  const x = (i: number) => M.l + (r.len <= 1 ? 0 : (i / (r.len - 1)) * (W - M.l - M.r));
  const y = (v: number) => M.t + (1 - (Math.min(HI, Math.max(LO, v)) - LO) / (HI - LO)) * (H - M.t - M.b);
  /* 평점 없는 경기에서 선을 끊는다 */
  const path = (vals: (number | null)[]) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const last = (vals: (number | null)[]) => {
    for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return { i, v: vals[i] as number };
    return null;
  };
  const la = last(r.a);
  const lb = last(r.b);
  const nm = (p: PlayerSeason) => p.name.split(' ').slice(-1)[0];

  return (
    <div className="fov">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${nm(a)} · ${nm(b)} 최근 ${r.len}경기 평점`}>
        {[6, 7, 8, 9].map((v) => (
          <g key={v}>
            <line className="fov__grid" x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} />
            <text className="fov__tick" x={M.l - 6} y={y(v)} dy="0.35em" textAnchor="end">{v}</text>
          </g>
        ))}
        <path className="fov__line" data-s="b" d={path(r.b)} />
        <path className="fov__line" data-s="a" d={path(r.a)} />
        {r.b.map((v, i) => v != null && <circle key={`b${i}`} className="fov__dot" data-s="b" cx={x(i)} cy={y(v)} r={i === lb?.i ? 4.5 : 2.5} />)}
        {r.a.map((v, i) => v != null && <circle key={`a${i}`} className="fov__dot" data-s="a" cx={x(i)} cy={y(v)} r={i === la?.i ? 4.5 : 2.5} />)}
        <text className="fov__tick" x={M.l} y={H - 4}>{r.len}경기 전</text>
        <text className="fov__tick" x={W - M.r} y={H - 4} textAnchor="end">최근</text>
      </svg>
      <ul className="fov__key">
        <li data-s="a"><i />{nm(a)}{la && <b className="num">{fmtRating(la.v)}</b>}</li>
        <li data-s="b"><i />{nm(b)}{lb && <b className="num">{fmtRating(lb.v)}</b>}</li>
      </ul>
    </div>
  );
}
