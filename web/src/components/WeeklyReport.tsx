import { useMemo, useState } from 'react';
import type { KoreanGame, KoreanPlayer } from '../types/feedTypes';
import { buildWeekly, ourScoreOf, weekLabel, weeksWithGames, type Weekly, type WeeklyRow } from '../lib/weekly';
import { fmtRating, ratingTier } from '../lib/rating';
import { kstShortDate } from '../lib/kst';
import { CREST } from '../config/targets';
import { RatingBadge } from './RatingBadge';
import { Headshot } from './Headshot';
import { Crest } from './Crest';

/**
 * 코리안리거 주간 리포트 — 한 주 동안 누가 얼마나 뛰었나를 한 장으로(lib/weekly.ts).
 *
 * 2026-11-13 다시 짰다. 예전에는 이름 · 상대 · 분 · 평점이 한 줄씩 나열된 표라 "이번 주의 주인공" 이 안 보였다.
 *  · 맨 위 — 주간 최고(큰 카드) + 그다음 두 명. 사진 · 큰 평점 · 그 주 경기
 *  · 아래 목록 — 줄 왼쪽 띠 = 평점 구간 색, 출전 시간은 숫자 대신 막대(진한 = 선발, 빗금 = 교체)
 *  · 요약은 큰 숫자 타일
 * ‹ › 로 지난 주를 넘겨 보고, "이미지 저장" 으로 같은 구성을 그림 한 장으로 받는다(폰은 공유 시트).
 */
export function WeeklyReport({ players }: { players: KoreanPlayer[] }) {
  const weeks = useMemo(() => weeksWithGames(players), [players]);
  const [at, setAt] = useState(0);
  const start = weeks[Math.min(at, weeks.length - 1)];
  const w = useMemo(() => (start ? buildWeekly(players, start) : null), [players, start]);
  const [busy, setBusy] = useState(false);
  /* 목록은 처음에 다섯 줄만 — 다 펼치면 이 탭이 다시 길어진다. 저장하는 이미지는 늘 전원 */
  const [all, setAll] = useState(false);
  if (!w) return null;

  const podium = w.rows.slice(0, 3);
  const rest = w.rows.slice(3);
  const FIRST = 5;
  const shown = all ? rest : rest.slice(0, FIRST);

  const save = async () => {
    setBusy(true);
    try { await exportImage(w); } finally { setBusy(false); }
  };

  return (
    <section className="wk">
      <div className="sec__head">
        <h2 className="sec__title">주간 리포트</h2>
        <span className="sec__note">한 주(화~월 · 한국시간) 소속팀 경기 — 주간 최고 · 공격 포인트 · 평점 순</span>
      </div>
      <div className="wk__card">
        <div className="wk__bar">
          <div className="wk__nav">
            <button onClick={() => setAt(at + 1)} disabled={at >= weeks.length - 1} aria-label="지난 주">‹</button>
            <b className="num">{weekLabel(w)}</b>
            <button onClick={() => setAt(at - 1)} disabled={at <= 0} aria-label="다음 주">›</button>
          </div>
          <button className="wk__save" onClick={save} disabled={busy}>{busy ? '만드는 중…' : '⬇ 이미지 저장'}</button>
        </div>

        <div className="wk__tiles num">
          <div><b>{w.rows.length}</b><span>출전</span></div>
          <div data-on={w.goals > 0 || undefined}><b>{w.goals}</b><span>골</span></div>
          <div data-on={w.assists > 0 || undefined}><b>{w.assists}</b><span>도움</span></div>
          <div><b>{w.minutes}</b><span>출전 시간(분)</span></div>
        </div>

        {/* 주간 최고 + 그다음 두 명 */}
        <div className="wk__podium" data-n={podium.length}>
          {podium.map((r, i) => <PodiumCard key={r.player.id} r={r} mvp={i === 0 && r === w.best} rank={i + 1} />)}
        </div>

        {rest.length > 0 && (
          <ol className="wk__list">
            {shown.map((r, i) => (
              <li
                key={r.player.id}
                className="wk__row"
                data-tier={r.rating != null ? ratingTier(r.rating) : undefined}
                data-ga={r.goals + r.assists > 0 || undefined}
              >
                <span className="wk__no num">{i + 4}</span>
                <Face p={r.player} size={30} />
                <span className="wk__who">
                  <b>{r.player.nameKo}</b>
                  <small><ClubMark p={r.player} />{r.player.club}</small>
                </span>
                <span className="wk__games">
                  {r.games.map((g) => <GameChip key={g.eventId ?? g.date} g={g} />)}
                </span>
                <MinBar r={r} />
                <span className="wk__ga num">
                  {r.goals > 0 && <em className="pcard__gg">{r.goals}G</em>}
                  {r.assists > 0 && <em className="pcard__aa">{r.assists}A</em>}
                </span>
                <span className="wk__rtg">{r.rating != null ? <RatingBadge v={r.rating} /> : <i className="wk__nr">–</i>}</span>
              </li>
            ))}
          </ol>
        )}
        {rest.length > FIRST && (
          <button className="wk__more" onClick={() => setAll(!all)} aria-expanded={all}>
            {all ? '접기' : <>출전 {w.rows.length}명 전체 보기 <span className="num">(+{rest.length - FIRST})</span></>}
          </button>
        )}
        {(all || rest.length <= FIRST) && w.idle.length > 0 && (
          <p className="wk__idle">이 주 기록 없음 · {w.idle.map((p) => p.nameKo).join(' · ')}</p>
        )}
      </div>
    </section>
  );
}

/** 맨 위 카드 — 주간 최고는 크게, 2 · 3번은 작게 */
function PodiumCard({ r, mvp, rank }: { r: WeeklyRow; mvp: boolean; rank: number }) {
  const tier = r.rating != null ? ratingTier(r.rating) : undefined;
  return (
    <article className="wk__pod" data-mvp={mvp || undefined} data-tier={tier}>
      <span className="wk__podtag">{mvp ? '★ 주간 최고' : `${rank}`}</span>
      <div className="wk__podtop">
        <Face p={r.player} size={mvp ? 64 : 44} />
        <div className="wk__podid">
          <b>{r.player.nameKo}</b>
          <small><ClubMark p={r.player} />{r.player.club}</small>
        </div>
        <div className="wk__podrt num" data-tier={tier}>
          <b>{r.rating != null ? fmtRating(r.rating) : '–'}</b>
          <span>평점</span>
        </div>
      </div>
      <div className="wk__podgames">
        {r.games.map((g) => <GameChip key={g.eventId ?? g.date} g={g} />)}
      </div>
      <div className="wk__podfoot">
        <MinBar r={r} />
        <span className="wk__ga num">
          {r.goals > 0 && <em className="pcard__gg">{r.goals}G</em>}
          {r.assists > 0 && <em className="pcard__aa">{r.assists}A</em>}
        </span>
      </div>
    </article>
  );
}

const Face = ({ p, size }: { p: KoreanPlayer; size: number }) => (
  <Headshot id={p.id} src={p.photo} kind={p.photoKind} sofa={p.sofascoreId} label={p.nameKo.slice(0, 1)} size={size} className="wk__face" />
);

const ClubMark = ({ p }: { p: KoreanPlayer }) => (
  p.clubId && p.clubId !== '0'
    ? <Crest team={{ id: p.clubId, name: p.club, shortName: p.club, abbr: p.club.slice(0, 3).toUpperCase(), logo: CREST(p.clubId) }} size={14} />
    : null
);

/** 경기 한 건 — 승패 칩 · 우리 팀 기준 스코어 · 상대 */
function GameChip({ g }: { g: KoreanGame }) {
  const sc = ourScoreOf(g);
  return (
    <span className="wk__g" title={`${g.date ? kstShortDate(g.date) : ''} · ${g.started ? '선발' : '교체'} ${g.minutes ?? 0}분`}>
      <i className="fchip" data-r={g.result}>{g.result}</i>
      {sc && <b className="num">{sc}</b>}
      <em>{g.opponent || '—'}</em>
    </span>
  );
}

/** 출전 시간 막대 — 뛴 경기 전부 풀타임 대비. 진한 = 선발로 뛴 시간, 빗금 = 교체로 뛴 시간 */
function MinBar({ r }: { r: WeeklyRow }) {
  const full = r.games.length * 90 || 1;
  const start = r.games.filter((g) => g.started).reduce((a, g) => a + (g.minutes ?? 0), 0);
  const sub = r.minutes - start;
  return (
    <span className="wk__min" title={`선발 ${start}분 · 교체 ${sub}분 / ${r.games.length}경기`}>
      <span className="wk__track">
        <i data-k="start" style={{ width: `${Math.min(100, (start / full) * 100)}%` }} />
        <i data-k="sub" style={{ width: `${Math.min(100, (sub / full) * 100)}%` }} />
      </span>
      <em className="num">{r.minutes}&apos;</em>
    </span>
  );
}

/* ── 이미지로 내보내기 ─────────────────────────────────────────────────
   화면을 찍는 라이브러리를 들이지 않고 캔버스에 같은 구성을 직접 그린다(1080px 폭 — 메신저 · SNS 용).
   엠블럼 · 사진은 다른 출처라 캔버스에 올리면 저장이 막힌다 — 사진 자리는 성(姓) 한 글자 원으로 대신한다. */
const TIER: Record<string, string> = { elite: '#C026D3', top: '#2F6BFF', good: '#1FA855', mid: '#E2862A', low: '#E0353B' };
const RES: Record<string, string> = { W: '#2ED573', D: '#F2A23C', L: '#FF4D5E' };
const INK = { hi: '#EAF1FD', mid: '#9DB0CE', lo: '#6B82A6', line: 'rgba(150,180,230,.16)' };

async function exportImage(w: Weekly): Promise<void> {
  const W = 1080;
  const podium = w.rows.slice(0, 3);
  const rest = w.rows.slice(3);
  const HEAD = 250;
  const MVP_H = podium.length ? 250 : 0;
  const SIDE_H = podium.length > 1 ? 150 : 0;
  const ROW = 84;
  const listTop = HEAD + MVP_H + (SIDE_H ? SIDE_H + 18 : 0) + (podium.length ? 34 : 0);
  const H = listTop + rest.length * ROW + (w.idle.length ? 70 : 20) + 70;

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  if (!x) return;
  const font = (size: number, weight = 600, display = false) =>
    `${weight} ${size}px ${display ? "'Barlow Condensed', " : ''}'Archivo', 'Noto Sans KR', sans-serif`;
  try { await document.fonts?.ready; } catch { /* 글꼴이 늦어도 그린다 */ }
  x.textBaseline = 'alphabetic';

  /* 바탕 — 네이비 + 오른쪽 위 태극 두 색의 흐린 빛 */
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0C1E3B'); bg.addColorStop(1, '#061127');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  for (const [cx, cy, rad, col] of [[900, 40, 420, 'rgba(205,46,58,.34)'], [1040, 250, 380, 'rgba(0,71,160,.42)']] as const) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, 640);
  }

  /* 머리 */
  x.fillStyle = INK.mid; x.font = font(24, 700); x.fillText('MS STATS HUB', 56, 74);
  x.fillStyle = INK.hi; x.font = font(54, 800); x.fillText('코리안리거 주간 리포트', 56, 140);
  x.fillStyle = '#FF6B78'; x.font = font(38, 700, true); x.fillText(weekLabel(w), 56, 196);
  const tiles: [string, string][] = [[String(w.rows.length), '출전'], [String(w.goals), '골'], [String(w.assists), '도움']];
  let tx = 330;
  for (const [v, k] of tiles) {
    x.fillStyle = INK.hi; x.font = font(40, 700, true); x.fillText(v, tx, 198);
    const vw = x.measureText(v).width;
    x.fillStyle = INK.mid; x.font = font(24, 600); x.fillText(k, tx + vw + 8, 196);
    tx += vw + 8 + x.measureText(k).width + 34;
  }

  const face = (cx: number, cy: number, r: number, name: string, color: string) => {
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fillStyle = 'rgba(255,255,255,.07)'; x.fill();
    x.lineWidth = Math.max(3, r / 10); x.strokeStyle = color; x.stroke();
    x.fillStyle = INK.hi; x.font = font(Math.round(r * 0.95), 800); x.textAlign = 'center';
    x.fillText(name.slice(0, 1), cx, cy + r * 0.34); x.textAlign = 'left';
  };
  const minBar = (px: number, py: number, wd: number, r: WeeklyRow) => {
    const full = r.games.length * 90 || 1;
    const start = r.games.filter((g) => g.started).reduce((a, g) => a + (g.minutes ?? 0), 0);
    x.fillStyle = 'rgba(255,255,255,.09)'; roundRect(x, px, py, wd, 12, 6); x.fill();
    const sw = Math.min(wd, (start / full) * wd);
    if (sw > 0) { x.fillStyle = '#FF6B78'; roundRect(x, px, py, Math.max(12, sw), 12, 6); x.fill(); }
    const bw = Math.min(wd - sw, ((r.minutes - start) / full) * wd);
    if (bw > 0) { x.fillStyle = 'rgba(255,107,120,.42)'; roundRect(x, px + sw, py, Math.max(8, bw), 12, 6); x.fill(); }
  };
  const games = (px: number, py: number, maxW: number, r: WeeklyRow, size: number) => {
    let gx = px;
    for (const g of r.games) {
      const sc = ourScoreOf(g);
      x.font = font(size, 600);
      const label = `${sc ? `${sc} ` : ''}${clip(x, g.opponent || '—', r.games.length === 1 ? maxW - 60 : 170)}`;
      const need = size + 12 + x.measureText(label).width + 22;
      if (gx + need > px + maxW && gx > px) break;
      x.fillStyle = RES[g.result] ?? INK.lo; roundRect(x, gx, py - size + 2, size + 4, size + 4, 5); x.fill();
      x.fillStyle = '#061127'; x.font = font(size - 4, 800); x.textAlign = 'center'; x.fillText(g.result, gx + (size + 4) / 2, py + 1); x.textAlign = 'left';
      x.fillStyle = INK.mid; x.font = font(size, 600); x.fillText(label, gx + size + 12, py + 2);
      gx += need;
    }
  };
  const ga = (right: number, py: number, r: WeeklyRow, size: number) => {
    let ax = right;
    x.font = font(size, 800); x.textAlign = 'right';
    if (r.assists > 0) { x.fillStyle = '#7FE3FF'; x.fillText(`${r.assists}A`, ax, py); ax -= x.measureText(`${r.assists}A`).width + 12; }
    if (r.goals > 0) { x.fillStyle = '#FFD75E'; x.fillText(`${r.goals}G`, ax, py); }
    x.textAlign = 'left';
  };
  const tierOf = (r: WeeklyRow) => (r.rating != null ? TIER[ratingTier(r.rating)] : INK.lo);

  /* 주간 최고 — 큰 카드 */
  if (podium[0]) {
    const r = podium[0];
    const y0 = HEAD;
    const col = tierOf(r);
    const card = x.createLinearGradient(40, y0, W - 40, y0 + MVP_H - 20);
    card.addColorStop(0, 'rgba(255,107,120,.20)'); card.addColorStop(1, 'rgba(255,255,255,.03)');
    x.fillStyle = card; roundRect(x, 40, y0, W - 80, MVP_H - 20, 26); x.fill();
    x.lineWidth = 2; x.strokeStyle = 'rgba(255,107,120,.55)'; roundRect(x, 40, y0, W - 80, MVP_H - 20, 26); x.stroke();
    x.fillStyle = '#FF6B78'; x.font = font(22, 800); x.fillText(r === w.best ? '★ 주간 최고' : '1', 76, y0 + 46);
    face(134, y0 + 132, 56, r.player.nameKo, col);
    x.fillStyle = INK.hi; x.font = font(52, 800); x.fillText(r.player.nameKo, 216, y0 + 124);
    x.fillStyle = INK.mid; x.font = font(26, 500); x.fillText(clip(x, r.player.club, 420), 216, y0 + 164);
    games(216, y0 + 204, 500, r, 22);
    /* 큰 평점 */
    x.textAlign = 'right';
    x.fillStyle = r.rating != null ? lighten(col) : INK.lo; x.font = font(112, 700, true);
    x.fillText(r.rating != null ? fmtRating(r.rating) : '–', W - 80, y0 + 138);
    x.fillStyle = INK.mid; x.font = font(22, 600); x.fillText('평점', W - 82, y0 + 170);
    x.textAlign = 'left';
    minBar(W - 300, y0 + 192, 150, r);
    x.fillStyle = INK.mid; x.font = font(22, 600, true); x.fillText(`${r.minutes}'`, W - 140, y0 + 205);
    ga(W - 320, y0 + 205, r, 26);
  }

  /* 2 · 3번 — 나란히 */
  podium.slice(1).forEach((r, i) => {
    const bw = (W - 80 - 18) / 2;
    const px = 40 + i * (bw + 18);
    const y0 = HEAD + MVP_H;
    const col = tierOf(r);
    x.fillStyle = 'rgba(255,255,255,.045)'; roundRect(x, px, y0, bw, SIDE_H, 20); x.fill();
    x.lineWidth = 1.5; x.strokeStyle = INK.line; roundRect(x, px, y0, bw, SIDE_H, 20); x.stroke();
    x.fillStyle = col; roundRect(x, px, y0 + 18, 6, SIDE_H - 36, 3); x.fill();
    face(px + 62, y0 + 58, 34, r.player.nameKo, col);
    x.fillStyle = INK.hi; x.font = font(32, 800); x.fillText(r.player.nameKo, px + 112, y0 + 54);
    x.fillStyle = INK.lo; x.font = font(20, 500); x.fillText(clip(x, r.player.club, bw - 250), px + 112, y0 + 84);
    x.textAlign = 'right'; x.fillStyle = r.rating != null ? lighten(col) : INK.lo; x.font = font(58, 700, true);
    x.fillText(r.rating != null ? fmtRating(r.rating) : '–', px + bw - 24, y0 + 70); x.textAlign = 'left';
    games(px + 28, y0 + 124, bw - 190, r, 19);
    ga(px + bw - 24, y0 + 126, r, 22);
  });

  /* 나머지 — 띠 · 막대 · 평점 */
  rest.forEach((r, i) => {
    const y = listTop + i * ROW;
    const col = tierOf(r);
    if (r.goals + r.assists > 0) { x.fillStyle = 'rgba(255,107,120,.07)'; roundRect(x, 40, y, W - 80, ROW - 8, 12); x.fill(); }
    x.fillStyle = col; roundRect(x, 40, y + 10, 5, ROW - 28, 3); x.fill();
    x.fillStyle = INK.line; x.fillRect(56, y + ROW - 8, W - 112, 1);
    x.fillStyle = INK.lo; x.font = font(24, 600, true); x.textAlign = 'right'; x.fillText(String(i + 4), 92, y + 46); x.textAlign = 'left';
    x.fillStyle = INK.hi; x.font = font(30, 800); x.fillText(r.player.nameKo, 112, y + 36);
    x.fillStyle = INK.lo; x.font = font(19, 500); x.fillText(clip(x, r.player.club, 220), 112, y + 62);
    games(350, y + 44, 330, r, 19);
    minBar(700, y + 30, 110, r);
    x.fillStyle = INK.lo; x.font = font(20, 600, true); x.fillText(`${r.minutes}'`, 820, y + 43);
    ga(930, y + 46, r, 22);
    if (r.rating != null) {
      x.fillStyle = col; roundRect(x, 950, y + 18, 78, 38, 8); x.fill();
      x.fillStyle = '#fff'; x.font = font(24, 800); x.textAlign = 'center'; x.fillText(fmtRating(r.rating), 989, y + 45); x.textAlign = 'left';
    } else { x.fillStyle = INK.lo; x.font = font(24, 600); x.textAlign = 'center'; x.fillText('–', 989, y + 45); x.textAlign = 'left'; }
  });

  const fy = listTop + rest.length * ROW;
  if (w.idle.length) {
    x.fillStyle = INK.lo; x.font = font(20, 500);
    x.fillText(clip(x, `이 주 기록 없음 · ${w.idle.map((p) => p.nameKo).join(' · ')}`, W - 112), 56, fy + 38);
  }
  x.fillStyle = INK.lo; x.font = font(19, 500);
  x.fillText('소속팀 경기 기준 · 평점 FotMob · 한국시간 · 막대 = 출전 시간(진한 선발 · 옅은 교체)', 56, H - 34);

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

/** 배지 색을 큰 숫자에 쓸 만큼 밝게 — 어두운 바탕 위 100px 숫자는 배지 색 그대로면 가라앉는다 */
function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * 0.38);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

function roundRect(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  x.beginPath();
  x.moveTo(px + rr, py); x.arcTo(px + w, py, px + w, py + h, rr); x.arcTo(px + w, py + h, px, py + h, rr);
  x.arcTo(px, py + h, px, py, rr); x.arcTo(px, py, px + w, py, rr); x.closePath();
}

/** 폭을 넘는 글자는 … 으로 */
function clip(x: CanvasRenderingContext2D, text: string, max: number): string {
  if (x.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && x.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}
