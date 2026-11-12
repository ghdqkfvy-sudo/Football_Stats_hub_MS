import { useMemo, useState } from 'react';
import type { KoreanPlayer } from '../types/feedTypes';
import { buildWeekly, weekLabel, weeksWithGames, type Weekly } from '../lib/weekly';
import { fmtRating, ratingTier } from '../lib/rating';
import { kstShortDate } from '../lib/kst';
import { RatingBadge } from './RatingBadge';

/**
 * 코리안리거 주간 리포트 — 한 주 동안 누가 얼마나 뛰었나를 한 장으로(lib/weekly.ts).
 * ‹ › 로 지난 주를 넘겨 보고, "이미지 저장" 으로 같은 내용을 그림 한 장으로 받는다(폰은 공유 시트).
 */
export function WeeklyReport({ players }: { players: KoreanPlayer[] }) {
  const weeks = useMemo(() => weeksWithGames(players), [players]);
  const [at, setAt] = useState(0);
  const start = weeks[Math.min(at, weeks.length - 1)];
  const w = useMemo(() => (start ? buildWeekly(players, start) : null), [players, start]);
  const [busy, setBusy] = useState(false);
  /* 처음엔 위 여섯 명만 — 스무 명 가까이 다 펼치면 이 탭이 다시 길어진다. 저장하는 이미지는 늘 전원 */
  const [all, setAll] = useState(false);
  if (!w) return null;
  const FIRST = 6;
  const shown = all ? w.rows : w.rows.slice(0, FIRST);

  const save = async () => {
    setBusy(true);
    try { await exportImage(w); } finally { setBusy(false); }
  };

  return (
    <section className="wk">
      <div className="sec__head">
        <h2 className="sec__title">주간 리포트</h2>
        <span className="sec__note">한 주(화~월 · 한국시간) 소속팀 경기 — 공격 포인트 · 평점 순</span>
      </div>
      <div className="wk__card">
        <div className="wk__bar">
          <div className="wk__nav">
            <button onClick={() => setAt(at + 1)} disabled={at >= weeks.length - 1} aria-label="지난 주">‹</button>
            <b className="num">{weekLabel(w)}</b>
            <button onClick={() => setAt(at - 1)} disabled={at <= 0} aria-label="다음 주">›</button>
          </div>
          <div className="wk__sum num">
            <span><b>{w.rows.length}</b>명 출전</span>
            <span><b>{w.goals}</b>골</span>
            <span><b>{w.assists}</b>도움</span>
            {w.best && <span className="wk__best">주간 최고 <b>{w.best.player.nameKo}</b> {fmtRating(w.best.rating!)}</span>}
          </div>
          <button className="wk__save" onClick={save} disabled={busy}>{busy ? '만드는 중…' : '⬇ 이미지 저장'}</button>
        </div>

        <ol className="wk__list">
          {shown.map((r, i) => (
            <li key={r.player.id} className="wk__row" data-ga={r.goals + r.assists > 0 || undefined}>
              <span className="wk__no num">{i + 1}</span>
              <span className="wk__who">
                <b>{r.player.nameKo}</b>
                <small>{r.player.club}</small>
              </span>
              <span className="wk__games">
                {r.games.map((g) => (
                  <span key={g.eventId} className="wk__g" title={`${g.date ? kstShortDate(g.date) : ''} · ${g.started ? '선발' : '교체'} ${g.minutes}분`}>
                    <i className="fchip" data-r={g.result}>{g.result}</i>
                    <em>{g.opponent || '—'}</em>
                    <span className="num">{g.started ? '' : '↑'}{g.minutes}&apos;</span>
                  </span>
                ))}
              </span>
              <span className="wk__ga num">
                {r.goals > 0 && <em className="pcard__gg">{r.goals}G</em>}
                {r.assists > 0 && <em className="pcard__aa">{r.assists}A</em>}
              </span>
              <span className="wk__min num">{r.minutes}&apos;</span>
              <span className="wk__rtg">{r.rating != null ? <RatingBadge v={r.rating} /> : <i className="wk__nr">–</i>}</span>
            </li>
          ))}
        </ol>
        {w.rows.length > FIRST && (
          <button className="wk__more" onClick={() => setAll(!all)} aria-expanded={all}>
            {all ? '접기' : <>출전 {w.rows.length}명 전체 보기 <span className="num">(+{w.rows.length - FIRST})</span></>}
          </button>
        )}
        {(all || w.rows.length <= FIRST) && w.idle.length > 0 && (
          <p className="wk__idle">이 주 기록 없음 · {w.idle.map((p) => p.nameKo).join(' · ')}</p>
        )}
      </div>
    </section>
  );
}

/* ── 이미지로 내보내기 ─────────────────────────────────────────────────
   화면을 찍는 라이브러리를 들이지 않고 캔버스에 같은 내용을 직접 그린다(1080px 폭 — 메신저 · SNS 용).
   엠블럼 · 사진은 다른 출처라 캔버스에 올리면 저장이 막힌다 — 글자와 색만 쓴다. */
const TIER: Record<string, string> = { elite: '#C026D3', top: '#2F6BFF', good: '#1FA855', mid: '#E2862A', low: '#E0353B' };
const RES: Record<string, string> = { W: '#2ED573', D: '#F2A23C', L: '#FF4D5E' };

async function exportImage(w: Weekly): Promise<void> {
  const W = 1080;
  const ROW = 92;
  const TOP = 250;
  const H = TOP + w.rows.length * ROW + (w.idle.length ? 90 : 40) + 60;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  if (!x) return;
  const font = (size: number, weight = 600, display = false) =>
    `${weight} ${size}px ${display ? "'Barlow Condensed', " : ''}'Archivo', 'Noto Sans KR', sans-serif`;
  try { await document.fonts?.ready; } catch { /* 글꼴이 늦어도 그린다 */ }

  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0C1E3B'); bg.addColorStop(1, '#061127');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const glow = x.createRadialGradient(W / 2, -80, 0, W / 2, -80, 620);
  glow.addColorStop(0, 'rgba(205,46,58,.30)'); glow.addColorStop(1, 'rgba(205,46,58,0)');
  x.fillStyle = glow; x.fillRect(0, 0, W, 420);

  x.textBaseline = 'alphabetic';
  x.fillStyle = '#9DB0CE'; x.font = font(24, 700); x.fillText('MS STATS HUB', 56, 76);
  x.fillStyle = '#EAF1FD'; x.font = font(52, 800); x.fillText('코리안리거 주간 리포트', 56, 142);
  x.fillStyle = '#FF6B78'; x.font = font(34, 700, true); x.fillText(weekLabel(w), 56, 192);
  x.fillStyle = '#9DB0CE'; x.font = font(26, 600);
  x.fillText(`${w.rows.length}명 출전 · ${w.goals}골 · ${w.assists}도움${w.best ? ` · 주간 최고 ${w.best.player.nameKo} ${fmtRating(w.best.rating!)}` : ''}`, 230, 190);

  w.rows.forEach((r, i) => {
    const y = TOP + i * ROW;
    if (r.goals + r.assists > 0) { x.fillStyle = 'rgba(255,107,120,.08)'; x.fillRect(40, y, W - 80, ROW - 8); }
    x.fillStyle = 'rgba(150,180,230,.13)'; x.fillRect(40, y + ROW - 8, W - 80, 1);
    x.fillStyle = '#6B82A6'; x.font = font(28, 600, true); x.textAlign = 'right'; x.fillText(String(i + 1), 92, y + 52);
    x.textAlign = 'left';
    x.fillStyle = '#EAF1FD'; x.font = font(32, 800); x.fillText(r.player.nameKo, 116, y + 40);
    x.fillStyle = '#6B82A6'; x.font = font(21, 500); x.fillText(clip(x, r.player.club, 230), 116, y + 70);

    let gx = 360;
    for (const g of r.games) {
      x.fillStyle = RES[g.result] ?? '#6B82A6'; roundRect(x, gx, y + 22, 26, 26, 5); x.fill();
      x.fillStyle = '#061127'; x.font = font(18, 800); x.textAlign = 'center'; x.fillText(g.result, gx + 13, y + 41); x.textAlign = 'left';
      x.fillStyle = '#9DB0CE'; x.font = font(21, 600);
      const label = `${clip(x, g.opponent || '—', r.games.length === 1 ? 330 : 150)} ${g.started ? '' : '↑'}${g.minutes}'`;
      x.fillText(label, gx + 34, y + 42);
      gx += 34 + x.measureText(label).width + 22;
      if (gx > 760) break;
    }

    let ax = 880;
    x.font = font(24, 800); x.textAlign = 'right';
    if (r.assists > 0) { x.fillStyle = '#7FE3FF'; x.fillText(`${r.assists}A`, ax, y + 52); ax -= x.measureText(`${r.assists}A`).width + 12; }
    if (r.goals > 0) { x.fillStyle = '#FFD75E'; x.fillText(`${r.goals}G`, ax, y + 52); }
    x.textAlign = 'left';

    if (r.rating != null) {
      x.fillStyle = TIER[ratingTier(r.rating)]; roundRect(x, 944, y + 26, 84, 40, 8); x.fill();
      x.fillStyle = '#fff'; x.font = font(26, 800); x.textAlign = 'center'; x.fillText(fmtRating(r.rating), 986, y + 55); x.textAlign = 'left';
    }
  });

  const fy = TOP + w.rows.length * ROW;
  if (w.idle.length) {
    x.fillStyle = '#6B82A6'; x.font = font(21, 500);
    x.fillText(clip(x, `이 주 기록 없음 · ${w.idle.map((p) => p.nameKo).join(' · ')}`, W - 112), 56, fy + 44);
  }
  x.fillStyle = '#6B82A6'; x.font = font(20, 500);
  x.fillText('소속팀 경기 기준 · 평점 FotMob · 한국시간', 56, H - 34);

  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
  if (!blob) return;
  const name = `koreans-weekly-${w.start}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: '코리안리거 주간 리포트' }); return; } catch (e) {
      /* 사용자가 공유 창을 닫았으면 끝 — 닫았는데 파일이 내려받아지면 안 된다. 그 밖의 실패만 내려받기로 */
      if ((e as DOMException)?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function roundRect(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath();
}

/** 폭을 넘는 글자는 … 으로 */
function clip(x: CanvasRenderingContext2D, text: string, max: number): string {
  if (x.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && x.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}
