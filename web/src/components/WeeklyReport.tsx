import { useId, useMemo, useState } from 'react';
import type { KoreanGame, KoreanPlayer } from '../types/feedTypes';
import { buildWeekly, ourScoreOf, weekLabel, weeksWithGames, type Weekly, type WeeklyRow } from '../lib/weekly';
import { fmtRating, ratingTier } from '../lib/rating';
import { kstShortDate } from '../lib/kst';
import { CREST } from '../config/targets';
import { Headshot } from './Headshot';
import { Crest } from './Crest';

/**
 * 코리안리거 주간 리포트 — 한 주 동안 누가 얼마나 뛰었나를 한 장으로(lib/weekly.ts).
 *
 * 2026-11-13 다시 짰다. 예전에는 이름 · 상대 · 분 · 평점이 한 줄씩 나열된 표라 "이번 주의 주인공" 이 안 보였다.
 *  · 맨 위 — 주간 최고(큰 카드) + 그다음 두 명. 사진 · 큰 평점 · 그 주 경기
 *  · 아래 목록 — 줄 왼쪽 띠 = 평점 구간 색, 출전 시간은 숫자 대신 막대(진한 = 선발, 빗금 = 교체)
 *  · 요약은 큰 숫자 타일
 * 2026-11-15 다듬기 — 머리를 주간 배너로(큰 주간 범위 + 한 줄 요약), 상위 세 명 메달,
 * 넓은 화면 목록은 2열 카드(한 줄에 경기 칩 하나뿐이라 줄 가운데가 비었다).
 * 폰 — 2 · 3번은 나란히 끼우지 않고 전폭 가로 카드, 목록 한 줄은 두 줄 높이(이름 · 평점 / 경기 · 출전 막대).
 * 2026-11-16 — 메달을 리본 달린 진짜 메달 모양(SVG)으로, 평점은 배지 한 모양에 크기 셋(대 · 중 · 소),
 * 팀 이름은 말줄임 없이(길면 줄을 넘긴다). 크기 체계는 styles/koreans.css 머리말.
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
        <header className="wk__hero">
          <div className="wk__heroL">
            <span className="wk__eyebrow">WEEKLY REPORT · 해외파</span>
            <div className="wk__nav">
              <button onClick={() => setAt(at + 1)} disabled={at >= weeks.length - 1} aria-label="지난 주">‹</button>
              <b className="num">{weekLabel(w)}</b>
              <button onClick={() => setAt(at - 1)} disabled={at <= 0} aria-label="다음 주">›</button>
            </div>
            {/* 0 은 흐리게 — 큰 숫자 타일 넷이 같은 무게로 "0 골" 을 크게 보여 줬다 */}
            <div className="wk__pills num">
              <span><b>{w.rows.length}</b>명 출전</span>
              <span data-zero={w.goals === 0 || undefined} data-k="g"><b>{w.goals}</b>골</span>
              <span data-zero={w.assists === 0 || undefined} data-k="a"><b>{w.assists}</b>도움</span>
              <span><b>{w.minutes}</b>분</span>
            </div>
          </div>
          <button className="wk__save" onClick={save} disabled={busy}>{busy ? '만드는 중…' : <>⬇ <span className="m-full">이미지 </span>저장</>}</button>
        </header>

        {/* 주간 최고 + 그다음 두 명 */}
        <div className="wk__podium" data-n={podium.length}>
          {podium.map((r, i) => <PodiumCard key={r.player.id} r={r} mvp={i === 0 && r === w.best} rank={(i + 1) as 1 | 2 | 3} />)}
        </div>

        {rest.length > 0 && (
          <ol className="wk__list" start={4}>
            {shown.map((r, i) => (
              <li
                key={r.player.id}
                className="wk__row"
                data-tier={r.rating != null ? ratingTier(r.rating) : undefined}
                data-ga={r.goals + r.assists > 0 || undefined}
              >
                <span className="wk__no num">{i + 4}</span>
                <Face p={r.player} size={32} />
                <span className="wk__who">
                  <b>{r.player.nameKo}</b>
                  <ClubLine p={r.player} />
                </span>
                <span className="wk__games">
                  {r.games.map((g) => <GameChip key={g.eventId ?? g.date} g={g} />)}
                </span>
                <MinBar r={r} />
                <span className="wk__ga num">
                  {r.goals > 0 && <em className="pcard__gg">{r.goals}G</em>}
                  {r.assists > 0 && <em className="pcard__aa">{r.assists}A</em>}
                </span>
                <RatingTile v={r.rating} size="s" />
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

/** 맨 위 카드 — [메달] [사진] [이름 · 소속] [평점] / 경기 / 출전 막대. 주간 최고는 크게 */
function PodiumCard({ r, mvp, rank }: { r: WeeklyRow; mvp: boolean; rank: 1 | 2 | 3 }) {
  const big = rank === 1;
  return (
    <article className="wk__pod" data-rank={rank} data-mvp={mvp || undefined}>
      <Medal rank={rank} size={big ? 30 : 24} />
      <Face p={r.player} size={big ? 64 : 44} />
      <div className="wk__podid">
        <span className="wk__podlbl">{mvp ? '주간 최고' : `${rank}위`}</span>
        <b>{r.player.nameKo}</b>
        <ClubLine p={r.player} />
      </div>
      <RatingTile v={r.rating} size={big ? 'l' : 'm'} caption />
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

/* 메달 금속 색 — [빛 · 바탕 · 그늘 · 숫자] */
const MEDAL: Record<1 | 2 | 3, [string, string, string, string]> = {
  1: ['#FFF4B8', '#F2C440', '#A97A0C', '#4A3300'],
  2: ['#FFFFFF', '#D5DDE8', '#8693A6', '#283444'],
  3: ['#FFDCC0', '#D38E5C', '#86461E', '#3A1A06'],
};

/** 메달 — 태극 두 색 리본(V) + 금속 원판(빛이 왼쪽 위에서) + 안쪽 테 + 순위 숫자 */
function Medal({ rank, size }: { rank: 1 | 2 | 3; size: number }) {
  const [hi, mid, lo, ink] = MEDAL[rank];
  const gid = `wkm${useId().replace(/:/g, '')}`;
  return (
    <svg className="wk__medal" width={size} height={(size * 46) / 32} viewBox="0 0 32 46" role="img" aria-label={`${rank}위 메달`}>
      <defs>
        <radialGradient id={gid} cx="34%" cy="30%" r="78%">
          <stop offset="0" stopColor={hi} />
          <stop offset=".5" stopColor={mid} />
          <stop offset="1" stopColor={lo} />
        </radialGradient>
      </defs>
      <path d="M5 0h8.5l6.5 21h-8.5z" fill="#CD2E3A" />
      <path d="M27 0h-8.5L12 21h8.5z" fill="#0047A0" />
      <path d="M27 0h-8.5L12 21h8.5z" fill="#fff" opacity=".12" />
      <rect x="10.5" y="17" width="11" height="5" rx="1.5" fill={lo} />
      <circle cx="16" cy="31" r="14" fill={lo} />
      <circle cx="16" cy="31" r="12.8" fill={`url(#${gid})`} />
      <circle cx="16" cy="31" r="9.6" fill="none" stroke={lo} strokeOpacity=".6" strokeWidth="1" />
      <text x="16" y="31" dy=".36em" textAnchor="middle" fontSize="13.5" fontWeight="800" fill={ink}
        fontFamily="'Barlow Condensed', 'Archivo', sans-serif">{rank}</text>
    </svg>
  );
}

/** 평점 배지 — 모양 하나(평점 구간 색 바탕 + 흰 숫자), 크기만 셋: l 주간 최고 · m 2 · 3위 · s 목록 */
function RatingTile({ v, size, caption = false }: { v: number | null; size: 'l' | 'm' | 's'; caption?: boolean }) {
  return (
    <span
      className="wk__rb"
      data-size={size}
      data-tier={v != null ? ratingTier(v) : undefined}
      data-none={v == null || undefined}
      title={v != null ? `FotMob 평점 ${fmtRating(v)}` : '평점 없음'}
    >
      <b className="num">{v != null ? fmtRating(v) : '–'}</b>
      {caption && <small>평점</small>}
    </span>
  );
}

/** 소속팀 — 엠블럼 + 이름. 말줄임 없이 줄을 넘긴다 */
const ClubLine = ({ p }: { p: KoreanPlayer }) => (
  <span className="wk__clubl"><ClubMark p={p} /><span className="wk__club">{p.club}</span></span>
);

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
      {/* 팀 이름은 줄이지 않는다 — 길면 줄을 넘긴다 */}
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
  /* 2 · 3번 카드는 경기가 둘이면 칩이 두 줄이 된다 */
  const SIDE_H = podium.length > 1 ? (podium.slice(1).some((r) => r.games.length > 1) ? 182 : 150) : 0;
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
  /* 경기 칩 — 폭이 모자라면 다음 줄로(예전에는 두 번째 경기를 버렸다) */
  const games = (px: number, py: number, maxW: number, r: WeeklyRow, size: number) => {
    let gx = px;
    let gy = py;
    for (const g of r.games) {
      const sc = ourScoreOf(g);
      x.font = font(size, 600);
      const label = `${sc ? `${sc} ` : ''}${g.opponent || '—'}`;
      /* 자르지 않는다 — 길면 이 경기 글자만 줄인다(최소 14) */
      let fs = size;
      while (fs > 14 && x.measureText(label).width > (r.games.length === 1 ? maxW - 40 : 230)) { fs -= 1; x.font = font(fs, 600); }
      const need = size + 12 + x.measureText(label).width + 22;
      if (gx + need > px + maxW && gx > px) { gx = px; gy += size + 12; }
      x.fillStyle = RES[g.result] ?? INK.lo; roundRect(x, gx, gy - size + 2, size + 4, size + 4, 5); x.fill();
      x.fillStyle = '#061127'; x.font = font(size - 4, 800); x.textAlign = 'center'; x.fillText(g.result, gx + (size + 4) / 2, gy + 1); x.textAlign = 'left';
      x.fillStyle = INK.mid; x.font = font(fs, 600); x.fillText(label, gx + size + 12, gy + 2);
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

  /* 팀 이름 — 자르지 않는다. 폭을 넘으면 글자를 줄이고(최소 min), 그래도 넘치면 두 줄로 */
  const fitText = (text: string, px: number, py: number, maxW: number, size: number, weight: number, color: string, min = 15) => {
    let fs = size;
    x.font = font(fs, weight);
    while (fs > min && x.measureText(text).width > maxW) { fs -= 1; x.font = font(fs, weight); }
    x.fillStyle = color;
    if (x.measureText(text).width <= maxW) { x.fillText(text, px, py); return; }
    const words = text.split(' ');
    let line = '';
    let k = 0;
    for (; k < words.length; k++) {
      const t = line ? `${line} ${words[k]}` : words[k];
      if (x.measureText(t).width > maxW && line) break;
      line = t;
    }
    x.fillText(line, px, py - fs * 0.55);
    x.fillText(words.slice(k).join(' '), px, py + fs * 0.6);
  };

  /* 메달 — 화면의 SVG 메달과 같은 모양(32 × 46 좌표를 그대로 키운다) */
  const medal = (left: number, top: number, wd: number, rank: 1 | 2 | 3) => {
    const [hi, mid, lo, ink] = MEDAL[rank];
    x.save(); x.translate(left, top); x.scale(wd / 32, wd / 32);
    x.fillStyle = '#CD2E3A'; x.beginPath(); x.moveTo(5, 0); x.lineTo(13.5, 0); x.lineTo(20, 21); x.lineTo(11.5, 21); x.closePath(); x.fill();
    x.fillStyle = '#0047A0'; x.beginPath(); x.moveTo(27, 0); x.lineTo(18.5, 0); x.lineTo(12, 21); x.lineTo(20.5, 21); x.closePath(); x.fill();
    x.fillStyle = lo; roundRect(x, 10.5, 17, 11, 5, 1.5); x.fill();
    x.beginPath(); x.arc(16, 31, 14, 0, Math.PI * 2); x.fillStyle = lo; x.fill();
    const g = x.createRadialGradient(11, 27, 1, 16, 31, 15);
    g.addColorStop(0, hi); g.addColorStop(0.5, mid); g.addColorStop(1, lo);
    x.beginPath(); x.arc(16, 31, 12.8, 0, Math.PI * 2); x.fillStyle = g; x.fill();
    x.beginPath(); x.arc(16, 31, 9.6, 0, Math.PI * 2); x.lineWidth = 1; x.strokeStyle = lo; x.globalAlpha = 0.6; x.stroke(); x.globalAlpha = 1;
    x.fillStyle = ink; x.font = font(14, 800, true); x.textAlign = 'center'; x.fillText(String(rank), 16, 36); x.textAlign = 'left';
    x.restore();
  };

  /* 평점 배지 — 화면과 같은 모양 하나, 크기만 다르게. right · top 기준 */
  const tile = (right: number, top: number, wd: number, ht: number, fs: number, r: WeeklyRow, caption: boolean) => {
    const v = r.rating;
    x.fillStyle = v != null ? tierOf(r) : 'rgba(255,255,255,.08)';
    roundRect(x, right - wd, top, wd, ht, ht * 0.26); x.fill();
    x.fillStyle = v != null ? '#fff' : INK.lo; x.font = font(fs, 700, true); x.textAlign = 'center';
    x.fillText(v != null ? fmtRating(v) : '–', right - wd / 2, top + ht / 2 + fs * 0.36);
    if (caption) { x.fillStyle = INK.lo; x.font = font(18, 600); x.fillText('평점', right - wd / 2, top + ht + 24); }
    x.textAlign = 'left';
  };

  /* 주간 최고 — 큰 카드(금 테두리) */
  if (podium[0]) {
    const r = podium[0];
    const y0 = HEAD;
    const card = x.createLinearGradient(40, y0, W - 40, y0 + MVP_H - 20);
    card.addColorStop(0, 'rgba(245,197,66,.16)'); card.addColorStop(1, 'rgba(255,255,255,.03)');
    x.fillStyle = card; roundRect(x, 40, y0, W - 80, MVP_H - 20, 26); x.fill();
    x.lineWidth = 2; x.strokeStyle = 'rgba(245,197,66,.6)'; roundRect(x, 40, y0, W - 80, MVP_H - 20, 26); x.stroke();
    medal(66, y0 + 26, 46, 1);
    face(178, y0 + 96, 52, r.player.nameKo, tierOf(r));
    x.fillStyle = '#F5C542'; x.font = font(20, 800); x.fillText(r === w.best ? '주간 최고' : '1위', 252, y0 + 58);
    x.fillStyle = INK.hi; x.font = font(48, 800); x.fillText(r.player.nameKo, 252, y0 + 108);
    fitText(r.player.club, 252, y0 + 144, W - 252 - 250, 24, 500, INK.mid);
    tile(W - 72, y0 + 40, 132, 96, 60, r, true);
    games(76, y0 + 196, 560, r, 22);
    minBar(W - 330, y0 + 184, 180, r);
    x.fillStyle = INK.mid; x.font = font(22, 600, true); x.fillText(`${r.minutes}'`, W - 140, y0 + 197);
    ga(W - 350, y0 + 197, r, 26);
  }

  /* 2 · 3번 — 나란히(은 · 동 테두리) */
  podium.slice(1).forEach((r, i) => {
    const rank = (i + 2) as 2 | 3;
    const bw = (W - 80 - 18) / 2;
    const px = 40 + i * (bw + 18);
    const y0 = HEAD + MVP_H;
    x.fillStyle = 'rgba(255,255,255,.045)'; roundRect(x, px, y0, bw, SIDE_H, 20); x.fill();
    x.lineWidth = 1.5; x.strokeStyle = rank === 2 ? 'rgba(200,211,226,.4)' : 'rgba(208,139,91,.45)'; roundRect(x, px, y0, bw, SIDE_H, 20); x.stroke();
    medal(px + 20, y0 + 16, 32, rank);
    face(px + 96, y0 + 56, 30, r.player.nameKo, tierOf(r));
    x.fillStyle = INK.lo; x.font = font(16, 800); x.fillText(`${rank}위`, px + 138, y0 + 34);
    x.fillStyle = INK.hi; x.font = font(30, 800); x.fillText(r.player.nameKo, px + 138, y0 + 66);
    fitText(r.player.club, px + 138, y0 + 94, bw - 138 - 110, 19, 500, INK.lo);
    tile(px + bw - 22, y0 + 22, 82, 58, 36, r, false);
    games(px + 24, y0 + 132, bw - 150, r, 18);
    ga(px + bw - 22, y0 + 134, r, 22);
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
    fitText(r.player.club, 112, y + 62, 228, 19, 500, INK.lo, 14);
    games(350, r.games.length > 1 ? y + 30 : y + 44, 330, r, 19);
    minBar(700, y + 30, 110, r);
    x.fillStyle = INK.lo; x.font = font(20, 600, true); x.fillText(`${r.minutes}'`, 820, y + 43);
    ga(930, y + 46, r, 22);
    tile(1028, y + 18, 78, 38, 24, r, false);
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
