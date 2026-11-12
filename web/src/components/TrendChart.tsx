import { useEffect, useMemo, useRef, useState } from 'react';
import type { Match, StandingTable, TeamRef } from '../lib/types';
import { axisTicks, buildTrend, type TrendPoint } from '../lib/trend';
import { zoneRuns } from '../lib/league';
import { kstShortDate } from '../lib/kst';

type Mode = 'rank' | 'points';

interface Line {
  id: string;
  label: string;
  name: string;
  focus: boolean;
  pts: TrendPoint[];
}

/**
 * 시즌 추이 — 순위표 바로 아래에서 "어떻게 여기까지 왔나" 를 잇는다.
 *
 *  · 우리 팀 한 줄만 팀 컬러로 세우고, 같은 대회의 다른 관심 팀은 회색 선 + 끝의 약어로만 둔다
 *    (색을 팀마다 주면 다섯 줄이 서로 싸운다 — 강조는 좁혀야 강조다).
 *  · 순위 보기는 1위가 위. 진출 · 강등 구간(ESPN 이 준 색)을 바탕 띠로 깔아
 *    "챔스권에 몇 라운드 머물렀나" 가 선과 함께 읽힌다.
 *  · 승점 보기는 선두의 승점을 점선으로 — 격차가 벌어지는지 좁혀지는지.
 *  · 마우스(또는 손가락)를 올리면 그 라운드의 경기와 값이 뜬다.
 */
export function TrendChart({
  table, matches, focusTeamId, focusColor, others,
}: {
  table: StandingTable;
  matches: Match[];
  focusTeamId: string;
  focusColor: string;
  /** 같은 대회의 다른 관심 팀 — 회색 선으로 함께 그린다 */
  others: ReadonlySet<string>;
}) {
  const [mode, setMode] = useState<Mode>('rank');
  const [hover, setHover] = useState<number | null>(null);

  /* 폭은 재서 그린다 — viewBox 로 늘이면 폰에서 글자까지 같이 줄어든다 */
  const boxRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const trend = useMemo(
    () => buildTrend(matches, table.rows.map((r) => r.team.id)),
    [matches, table],
  );

  const lines = useMemo<Line[]>(() => {
    const team = new Map<string, TeamRef>(table.rows.map((r) => [r.team.id, r.team]));
    const mk = (id: string, focus: boolean): Line | null => {
      const pts = trend.series.get(id);
      const t = team.get(id);
      return pts?.length && t ? { id, label: t.abbr || t.shortName, name: t.shortName || t.name, focus, pts } : null;
    };
    const rest = [...others].filter((id) => id !== focusTeamId).map((id) => mk(id, false));
    /* 우리 팀을 마지막에 — 겹치는 자리에서 위에 그려진다 */
    return [...rest, mk(focusTeamId, true)].filter((l): l is Line => !!l);
  }, [trend, table, others, focusTeamId]);

  const focus = lines.find((l) => l.focus);
  if (!focus || focus.pts.length < 2) return null;

  const narrow = w > 0 && w < 520;
  const H = narrow ? 230 : 280;
  const M = { l: 34, r: narrow ? 58 : 76, t: 14, b: 26 };
  const pw = Math.max(10, w - M.l - M.r);
  const ph = H - M.t - M.b;
  const rounds = trend.rounds;
  const x = (r: number) => M.l + (rounds <= 1 ? 0 : ((r - 1) / (rounds - 1)) * pw);

  const maxPts = Math.max(3, ...trend.leaderPoints);
  const ptsStep = maxPts > 60 ? 20 : maxPts > 24 ? 10 : 5;
  const ptsTop = Math.ceil(maxPts / ptsStep) * ptsStep;
  const y = mode === 'rank'
    ? (v: number) => M.t + (trend.teams <= 1 ? 0 : ((v - 1) / (trend.teams - 1)) * ph)
    : (v: number) => M.t + ph - (v / ptsTop) * ph;
  const val = (p: TrendPoint) => (mode === 'rank' ? p.rank : p.points);
  const unit = mode === 'rank' ? '위' : '점';

  const yTicks = mode === 'rank'
    ? axisTicks(trend.teams, trend.teams > 24 ? 10 : 5)
    : Array.from({ length: ptsTop / ptsStep + 1 }, (_, i) => i * ptsStep);
  const xTicks = axisTicks(rounds, rounds <= 10 ? 1 : 5);

  /* 진출 · 강등 구간 — 같은 색이 이어지는 순위를 한 띠로 */
  const bands: { from: number; to: number; color: string }[] = [];
  if (mode === 'rank') {
    const zones = zoneRuns(table.zones).zones;   // 순위표와 같은 구간만
    for (let r = 1; r <= trend.teams; r++) {
      const z = zones[r];
      if (!z) continue;
      const last = bands[bands.length - 1];
      if (last && last.to === r - 1 && last.color === z.color) last.to = r;
      else bands.push({ from: r, to: r, color: z.color });
    }
  }
  const half = trend.teams > 1 ? ph / (trend.teams - 1) / 2 : 0;

  const path = (pts: TrendPoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.round).toFixed(1)},${y(val(p)).toFixed(1)}`).join('');

  /* 선 끝의 이름표 — 서로 겹치지 않게 위에서부터 15px 씩 띄운다 */
  const tags = lines
    .map((l) => { const p = l.pts[l.pts.length - 1]; return { l, p, y: y(val(p)) }; })
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < tags.length; i++) tags[i].y = Math.max(tags[i].y, tags[i - 1].y + 15);
  for (let i = tags.length - 2, floor = H - 6; i >= 0; i--) {
    if (tags[tags.length - 1].y > floor) tags[tags.length - 1].y = floor;
    tags[i].y = Math.min(tags[i].y, tags[i + 1].y - 15);
  }

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const r = Math.round(((e.clientX - box.left) / Math.max(1, box.width)) * (rounds - 1)) + 1;
    setHover(Math.min(rounds, Math.max(1, r)));
  };

  const hp = hover ? focus.pts[hover - 1] : undefined;
  /* 툴팁은 십자선 **옆**에 — 위에 얹으면 보려던 선을 가린다. 오른쪽에 자리가 없으면 왼쪽으로 */
  const TIP_W = 184;
  const tipLeft = hover
    ? (x(hover) + 14 + TIP_W <= w ? x(hover) + 14 : Math.max(0, x(hover) - 14 - TIP_W))
    : 0;
  const last = focus.pts[focus.pts.length - 1];

  return (
    <div className="trend" style={{ ['--tc' as string]: focusColor }}>
      <div className="trend__bar">
        <div className="trend__seg" role="tablist" aria-label="추이 기준">
          {([['rank', '순위'], ['points', '승점']] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={mode === id} onClick={() => setMode(id)}>{label}</button>
          ))}
        </div>
        <ul className="trend__legend">
          <li><i data-k="focus" />{focus.name}</li>
          {lines.length > 1 && <li><i data-k="other" />다른 관심 팀</li>}
          {mode === 'points' && <li><i data-k="lead" />선두</li>}
        </ul>
      </div>

      <div className="trend__plot" ref={boxRef} style={{ height: H }}>
        {w > 0 && (
          <svg
            width={w}
            height={H}
            role="img"
            aria-label={`${focus.name} ${mode === 'rank' ? '순위' : '승점'} 추이 — ${rounds}라운드 현재 ${val(last)}${unit}`}
          >
            {bands.map((b) => (
              <g key={b.from}>
                <rect
                  x={M.l} width={pw}
                  y={Math.max(M.t, y(b.from) - half)}
                  height={Math.min(M.t + ph, y(b.to) + half) - Math.max(M.t, y(b.from) - half)}
                  fill={b.color} opacity={0.07}
                />
                <rect
                  x={M.l - 3} width={2} rx={1}
                  y={Math.max(M.t, y(b.from) - half) + 1}
                  height={Math.max(2, Math.min(M.t + ph, y(b.to) + half) - Math.max(M.t, y(b.from) - half) - 2)}
                  fill={b.color} opacity={0.85}
                />
              </g>
            ))}

            {yTicks.map((v) => (
              <g key={v}>
                <line className="trend__grid" x1={M.l} x2={M.l + pw} y1={y(v)} y2={y(v)} />
                <text className="trend__tick" x={M.l - 9} y={y(v)} dy="0.35em" textAnchor="end">{v}</text>
              </g>
            ))}
            {xTicks.map((v) => (
              <text key={v} className="trend__tick" x={x(v)} y={H - 7} textAnchor="middle">{v}R</text>
            ))}

            {mode === 'points' && (
              <path
                className="trend__lead"
                d={trend.leaderPoints.map((p, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)},${y(p).toFixed(1)}`).join('')}
              />
            )}

            {lines.map((l) => (
              <path key={l.id} className="trend__line" data-focus={l.focus || undefined} d={path(l.pts)} />
            ))}

            {hover && <line className="trend__cross" x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + ph} />}

            {lines.map((l) => {
              const p = hover ? l.pts[hover - 1] : l.pts[l.pts.length - 1];
              return p && (
                <circle
                  key={l.id} className="trend__dot" data-focus={l.focus || undefined}
                  cx={x(p.round)} cy={y(val(p))} r={l.focus ? 4.5 : 3.5}
                />
              );
            })}

            {tags.map(({ l, p, y: ty }) => (
              <text key={l.id} className="trend__tag" data-focus={l.focus || undefined} x={x(p.round) + 10} y={ty} dy="0.35em">
                {l.label} <tspan className="trend__tagv">{val(p)}{unit}</tspan>
              </text>
            ))}

            <rect
              x={M.l - 8} y={0} width={pw + 16} height={H} fill="transparent"
              onPointerMove={onMove} onPointerDown={onMove}
              /* 손가락은 떼는 순간 leave 가 온다 — 그때 지우면 탭한 값이 바로 사라진다. 마우스만 지운다 */
              onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(null); }}
              style={{ touchAction: 'pan-y' }}
            />
          </svg>
        )}

        {hover && hp && (
          <div className="trend__tip" style={{ left: tipLeft }} role="status">
            <div className="trend__tiph">
              <b className="num">{hover}R</b>
              <span className="num">{kstShortDate(hp.kickoffUtc)}</span>
            </div>
            <div className="trend__tipm">
              <i className="fchip" data-r={hp.result}>{hp.result}</i>
              <span>{hp.home ? 'vs' : '@'} {hp.opponent.shortName || hp.opponent.name}</span>
              <b className="num">{hp.gf}-{hp.ga}</b>
            </div>
            {[...lines].reverse().map((l) => {
              const p = l.pts[hover - 1];
              return p && (
                <div className="trend__tipr" key={l.id} data-focus={l.focus || undefined}>
                  <i />
                  <span>{l.label}</span>
                  <b className="num">{p.rank}위</b>
                  <em className="num">{p.points}점</em>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
