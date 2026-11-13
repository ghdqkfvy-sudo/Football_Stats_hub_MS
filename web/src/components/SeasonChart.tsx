import { useMemo, useState } from 'react';
import type { Match } from '../lib/types';
import { barLength, seasonBars, tally } from '../lib/seasonBars';
import { usePalette } from '../lib/palette';
import { mobileName } from '../config/targets';
import { kstShortDate } from '../lib/kst';
import { CompCrest } from './CompCrest';

/**
 * 시즌 흐름 — 끝난 경기 전부를 막대 하나씩(왼쪽이 시즌 초).
 * 위로 뻗으면 이긴 경기(길이 = 득실차), 아래는 진 경기, 가운데 짧은 토막은 무승부.
 * 막대 아래 점은 대회 색. 막대를 누르면 위 히어로 · 캘린더가 그 경기로 맞춰진다(onPick).
 */
export function SeasonChart({ matches, teamId, selectedId, onPick }: {
  matches: Match[];
  teamId: string;
  selectedId?: string | null;
  onPick: (m: Match) => void;
}) {
  const palette = usePalette();
  const all = useMemo(() => seasonBars(matches, teamId), [matches, teamId]);
  const comps = useMemo(() => [...new Set(all.map((b) => b.competition))], [all]);
  const [comp, setComp] = useState<string | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const bars = comp ? all.filter((b) => b.competition === comp) : all;
  if (all.length < 3) return null;

  const t = tally(bars);
  const at = hot ? bars.findIndex((b) => b.id === hot) : -1;
  const h = at >= 0 ? bars[at] : undefined;
  const tipX = bars.length > 1 ? (at / (bars.length - 1)) * 100 : 50;
  const byId = new Map(matches.map((m) => [m.id, m]));

  return (
    <div className="ssn" onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHot(null); }}>
      <div className="ssn__bar">
        {comps.length > 1 && (
          <div className="ssn__comps" role="group" aria-label="대회 고르기">
            <button aria-pressed={comp == null} onClick={() => setComp(null)}>전체</button>
            {comps.map((c) => (
              <button key={c} aria-pressed={comp === c} onClick={() => setComp(comp === c ? null : c)}>
                <CompCrest k={c} size={13} />{mobileName(c)}
              </button>
            ))}
          </div>
        )}
        <div className="ssn__sum num">
          <span><b data-r="W">{t.w}</b>승</span>
          <span><b data-r="D">{t.d}</b>무</span>
          <span><b data-r="L">{t.l}</b>패</span>
          <span className="ssn__gd">{t.gf}득점 · {t.ga}실점</span>
        </div>
      </div>

      <div className="ssn__plot" role="img" aria-label={`시즌 ${bars.length}경기 — ${t.w}승 ${t.d}무 ${t.l}패`}>
        <span className="ssn__mid" />
        <div className="ssn__cols">
          {bars.map((b) => (
            <button
              key={b.id}
              type="button"
              className="ssn__col"
              data-r={b.result}
              data-hot={b.id === hot || undefined}
              data-sel={b.id === selectedId || undefined}
              data-dim={(hot && b.id !== hot) || undefined}
              aria-label={`${kstShortDate(b.kickoffUtc)} ${b.opponent.shortName} ${b.gf}-${b.ga}`}
              onPointerEnter={() => setHot(b.id)}
              onFocus={() => setHot(b.id)}
              onClick={() => { setHot(b.id); const m = byId.get(b.id); if (m) onPick(m); }}
            >
              <span className="ssn__half ssn__half--up">
                {b.result === 'W' && <i style={{ height: `${Math.max(14, barLength(b.diff) * 100)}%` }} />}
              </span>
              {(b.result === 'D' || b.diff === 0) && <i className="ssn__nub" />}
              <span className="ssn__half ssn__half--down">
                {b.result === 'L' && <i style={{ height: `${Math.max(14, barLength(b.diff) * 100)}%` }} />}
              </span>
              <u style={{ background: palette.color(b.competition) }} />
            </button>
          ))}
        </div>
        {h && (
          <div className="form__tip ssn__tip" style={{ left: `${tipX}%`, transform: `translateX(${-tipX}%)` }} role="status">
            <span className="num">{kstShortDate(h.kickoffUtc)}</span>
            <b>{h.home ? 'vs' : '@'} {h.opponent.shortName || h.opponent.name}</b>
            <i className="fchip" data-r={h.result}>{h.result}</i>
            <span className="num">{h.gf}:{h.ga}</span>
            <span>{mobileName(h.competition)}</span>
          </div>
        )}
      </div>
      <p className="ssn__key">위 = 승 · 아래 = 패 · 길이 = 득실차 · 아래 점 = 대회 <span>← 시즌 초 · 최근 →</span></p>
    </div>
  );
}
