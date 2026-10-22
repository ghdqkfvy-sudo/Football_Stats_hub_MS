import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LiveEvent, LiveMatch, LivePlayer, LiveSide } from '../types/feedTypes';
import type { Match } from '../lib/types';
import { teamColor } from '../lib/live';
import { contributions, playedMin, scoreAt, slotChain, statPairs } from '../lib/liveCard';
import { susNote } from '../lib/discipline';
import { fotmobImage } from '../lib/injury';
import { kstFullDate, kstParts, kstTime } from '../lib/kst';
import { LINE_COLOR, lineKind, lineLabels } from '../lib/squad';
import { HAS_HOVER, useIsMobile, useMedia } from '../lib/useMedia';
import { PitchMarkings } from './PitchMarkings';
import { Headshot } from './Headshot';
import { RatingBadge } from './RatingBadge';
import { CardShape } from './InjuryMark';
import { Crest } from './Crest';
import { PlayerDetail } from './PlayerDetail';
import { matchLivePlayer, useSquadPlayers } from '../lib/liveSquad';
import type { PlayerSeason } from '../lib/squad';

/**
 * 오늘의 경기 — 양 팀 포메이션(한 경기장 위아래) · 교체 · 벤치 · 경기 흐름 (2026-10-18).
 *
 * 데이터는 경기 중 수집 워크플로가 1분마다 고치는 live-{slug}.json(scripts/lib/live.mjs).
 * 화면에는 5~7분 늦게 닿는다 — 머리에 "n분 전 갱신" 을 늘 적는다.
 *
 * 경기장은 **포메이션 탭과 같은 칩 · 같은 줄 배치**(chipbox · pitch__row)를 쓴다.
 * FotMob 좌표의 세로값(y)으로 줄을 나누고, 줄 높이는 칩이 정한다 — 좌표를 그대로 찍으면
 * 폰에서 줄 사이가 좁아 위 칩의 기록이 아래 칩 머리를 가렸다(2026-10-18 음뵈모 · 쿠냐).
 */
type Sub = Extract<LiveEvent, { t: 'sub' }>;
type Goal = Extract<LiveEvent, { t: 'goal' }>;

type Find = (p: LivePlayer) => PlayerSeason | null;
/** 선발 ↔ 교체 표시 — auto 는 일정 간격으로 돌고, start · now 는 손으로 고정 */
type CycMode = 'auto' | 'start' | 'now';
/** 호버 카드 — 넓은 화면(마우스)에서만. 경기장은 overflow:hidden 이라 body 로 띄운다 */
type Tip = (body: () => React.ReactNode) => Partial<Pick<React.HTMLAttributes<HTMLElement>, 'onMouseEnter' | 'onMouseLeave'>>;
const CYCLE_MS = 3000;

const PIN = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);

/**
 * @param teamId · matches 우리 팀 ESPN id 와 일정 — 주면 우리 팀 칩을 눌러 선수 상세 카드를 연다
 *   (스쿼드와 이어진 선수만. 상대 선수 · 못 이은 선수는 그냥 칩)
 */
export function LiveMatchView({ live, match, teamId, matches }: { live: LiveMatch; match?: Match; teamId?: string; matches?: Match[] }) {
  const ours = live.ours ?? 'home';
  const pool = useSquadPlayers(live.ours ? teamId : undefined, matches);
  const find = useMemo<Find | undefined>(() => (pool.length ? (p) => matchLivePlayer(p, pool) : undefined), [pool]);
  const [detail, setDetail] = useState<PlayerSeason | null>(null);
  const closeDetail = useCallback(() => setDetail(null), []);
  const pickProps = { find, onPick: setDetail };

  /* 호버 카드 — 마우스가 올라간 요소 아래(공간이 없으면 위)에 띄운다 */
  const [tipAt, setTipAt] = useState<{ el: HTMLElement; body: React.ReactNode } | null>(null);
  const tip = useCallback<Tip>((body) => (HAS_HOVER ? {
    onMouseEnter: (e) => setTipAt({ el: e.currentTarget as HTMLElement, body: body() }),
    onMouseLeave: () => setTipAt(null),
  } : {}), []);
  useEffect(() => {
    if (!tipAt) return;
    const off = () => setTipAt(null);
    window.addEventListener('scroll', off, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', off, { capture: true });
  }, [tipAt]);

  /* 선발 ↔ 교체 — 교체가 있었던 자리만 CYCLE_MS(3초) 마다 디졸브로 바뀐다. 골키퍼 쪽부터 물결처럼.
     호버 카드 · 상세 카드가 떠 있으면 멈춘다(누르려는 순간 선수가 바뀌지 않게).
     기기에서 '동작 줄이기' 를 켰으면 자동은 쓰지 않고 지금 선수로 */
  const reduce = useMedia('(prefers-reduced-motion: reduce)');
  const [modePick, setMode] = useState<CycMode>('auto');
  const mode: CycMode = reduce && modePick === 'auto' ? 'now' : modePick;
  const anySub = live.events.some((e) => e.t === 'sub');
  const [tick, setTick] = useState(0);
  const hold = !!tipAt || !!detail;
  useEffect(() => {
    if (mode !== 'auto' || !anySub || hold) return;
    const id = setInterval(() => setTick((t) => t + 1), CYCLE_MS);
    return () => clearInterval(id);
  }, [mode, anySub, hold]);
  const slot = useCallback((n: number) => (mode === 'start' ? 0 : mode === 'now' ? n - 1 : tick % n), [mode, tick]);
  const halfProps = { live, slot, tip };
  const theirs = ours === 'home' ? 'away' : 'home';
  const [pick, setPick] = useState<'home' | 'away'>(ours);
  /* 넓은 화면은 경기장을 눕힌다 — 세로로 두 팀을 쌓으면 화면 두 장 길이였다.
     좌우는 스코어보드와 같게 홈 왼쪽 · 원정 오른쪽(예전엔 우리 팀 왼쪽이라 원정 경기면 스코어보드와 반대였다) */
  const wide = !useIsMobile();
  const crest = (k: 'home' | 'away', size: number) => <TeamCrest live={live} match={match} k={k} size={size} />;

  return (
    <div className="lm">
      <LiveHead live={live} crest={crest} venue={live.venue ?? match?.venue} />
      {live.lineupType === 'predicted' && <p className="lm__note">아직 공식 라인업 발표 전 — FotMob 예상 라인업입니다.</p>}

      <section className="lm__pitch">
        {wide ? (
          <div className="lm__bars">
            <TeamBar side={live.home} crest={crest('home', 18)} />
            <TeamBar side={live.away} crest={crest('away', 18)} />
          </div>
        ) : <TeamBar side={live[theirs]} crest={crest(theirs, 18)} />}
        {anySub && (
          <div className="lm__cyc" role="group" aria-label="교체된 자리 표시">
            <span>교체된 자리</span>
            {([['auto', '자동 전환'], ['start', '선발'], ['now', '현재']] as const).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={mode === k} data-on={mode === k || undefined} onClick={() => setMode(k)}>
                {k === 'auto' && <i aria-hidden="true" />}{label}
              </button>
            ))}
          </div>
        )}
        <div className="lm__field" data-wide={wide || undefined}>
          <div className="lm__lines"><PitchMarkings /></div>
          {wide ? (
            <>
              <Half side={live.home} subs={subsOf(live, 'home')} wide {...halfProps} {...(ours === 'home' ? pickProps : {})} />
              <Half side={live.away} subs={subsOf(live, 'away')} top wide {...halfProps} {...(ours === 'away' ? pickProps : {})} />
            </>
          ) : (
            <>
              <Half side={live[theirs]} subs={subsOf(live, theirs)} top {...halfProps} />
              <Half side={live[ours]} subs={subsOf(live, ours)} {...halfProps} {...pickProps} />
            </>
          )}
        </div>
        {!wide && <TeamBar side={live[ours]} crest={crest(ours, 18)} />}
        {/* 범례 — 예전엔 "↑74' 교체 투입" 이라 실제 선수(마운트 74분) 기록처럼 읽혔다 */}
        <p className="lm__key"><span>평점 · 카드 = 이 경기 기록(FotMob)</span><span><b className="lm__ink">↑분</b> = 교체 투입 · <b className="lm__outk">↓분</b> = 교체 아웃</span></p>
      </section>

      <section className="lm__squads">
        {/* 폰은 한 팀씩 — 위의 전환 단추로 고른다. 넓은 화면은 두 팀 나란히 */}
        <div className="lm__switch" role="tablist">
          {(['home', 'away'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={pick === k} onClick={() => setPick(k)}>
              {crest(k, 18)}<span>{live[k].name}</span>
            </button>
          ))}
        </div>
        <div className="lm__teams">
          {(['home', 'away'] as const).map((k) => (
            <BenchCol key={k} side={live[k]} subs={subsOf(live, k)} crest={crest(k, 22)} active={pick === k} live={live} tip={tip} {...(k === ours ? pickProps : {})} />
          ))}
        </div>
      </section>

      <Timeline live={live} crest={crest} colors={{ home: teamColor(live, 'home', match?.home.id), away: teamColor(live, 'away', match?.away.id) }} />
      {find && <PlayerDetail p={detail} onClose={closeDetail} />}
      {tipAt && createPortal(<TipBox el={tipAt.el}>{tipAt.body}</TipBox>, document.body)}
    </div>
  );
}

const subsOf = (live: LiveMatch, side: 'home' | 'away') =>
  live.events.filter((e): e is Sub => e.t === 'sub' && e.side === side);

const POS_ORDER = ['G', 'D', 'M', 'F', ''];
const POS_LABEL = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' } as const;
const POS_LINE = { G: 'GK', D: 'DEF', M: 'MID', F: 'FW' } as const;

const lastName = (n: string) => n.split(' ').slice(-1)[0] ?? n;



function TeamCrest({ live, match, k, size }: { live: LiveMatch; match?: Match; k: 'home' | 'away'; size: number }) {
  const t = match?.[k];
  if (t) return <Crest team={t} size={size} />;
  return <img className="lm__logo" src={`https://images.fotmob.com/image_resources/logo/teamlogo/${live[k].fm}_small.png`} alt="" width={size} height={size} />;
}

/** 머리 — 상태 · 스코어 · 득점자 · 갱신 시각 */
function LiveHead({ live, crest, venue }: { live: LiveMatch; crest: (k: 'home' | 'away', s: number) => React.ReactNode; venue?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  const ago = Math.max(0, Math.round((now - Date.parse(live.updatedAt)) / 60_000));
  const state = live.phase === 'live' ? (live.clock ?? 'LIVE') : live.phase === 'done' ? '경기 종료' : '킥오프 전';
  const goals = live.events.filter((e): e is Goal => e.t === 'goal').sort((a, b) => a.min - b.min || (a.plus ?? 0) - (b.plus ?? 0));
  const scorers = (s: 'home' | 'away') => goals.filter((g) => g.side === s).map((g, i) => (
    <span key={i}>{lastName(g.player)} <em className="num">{g.min}{g.plus ? `+${g.plus}` : ''}&apos;{g.pen ? ' PK' : ''}{g.og ? ' 자책' : ''}</em></span>
  ));
  return (
    <div className="lm__head">
      <div className="lm__meta">
        <span className="lm__state" data-phase={live.phase}>{live.phase === 'live' && <i />}{state}</span>
        {live.league && <span>{live.league}</span>}
        <span className="lm__ago">{ago < 1 ? '방금' : `${ago}분 전`} 갱신</span>
      </div>
      <div className="lm__score">
        <div className="lm__team">{crest('home', 40)}<b>{live.home.name}</b><TeamRating v={live.home.rating} /></div>
        <div className="lm__sc num">
          {live.phase === 'pre'
            ? <span className="lm__ko">{kstTime(live.kickoffUtc)}<small>{kstFullDate(live.kickoffUtc)}</small></span>
            : <>{live.score[0]}<i>:</i>{live.score[1]}</>}
        </div>
        <div className="lm__team">{crest('away', 40)}<b>{live.away.name}</b><TeamRating v={live.away.rating} /></div>
      </div>
      {venue && <div className="lm__venue">{PIN}{venue}</div>}
      {goals.length > 0 && (
        <div className="lm__goals"><div>{scorers('home')}</div><i aria-hidden="true">⚽</i><div>{scorers('away')}</div></div>
      )}
    </div>
  );
}

/** 팀 평점 — 이 경기 FotMob 팀 평점. 라벨을 붙여 선수 평점과 헷갈리지 않게 */
function TeamRating({ v }: { v: number | null }) {
  if (v == null) return null;
  return <span className="lm__trate"><small>팀 평점</small><RatingBadge v={v} title="이 경기 팀 평점 (FotMob)" /></span>;
}

function TeamBar({ side, crest }: { side: LiveSide; crest: React.ReactNode }) {
  return (
    <div className="lm__bar">
      {crest}<b>{side.name}</b>
      {side.formation && <em className="num">{side.formation}</em>}
    </div>
  );
}

/** 좌표의 세로값으로 줄을 나눈다 — 골키퍼 줄부터. 줄 안은 왼쪽→오른쪽 */
function rowsOf(starters: LivePlayer[]): LivePlayer[][] {
  const rows = new Map<number, LivePlayer[]>();
  for (const p of starters) {
    if (p.y == null || p.x == null) continue;
    const k = Math.round(p.y * 20) / 20;
    rows.set(k, [...(rows.get(k) ?? []), p]);
  }
  /* ⚠️ FotMob 의 x 는 0 = 오른쪽(오른쪽 풀백 발베르데 0.125 · 왼쪽 풀백 쿠쿠렐라 0.875, 2026-10-19).
     예전엔 0 = 왼쪽으로 읽어 좌우가 뒤집혔다 — 큰 x 부터 놓아 왼쪽→오른쪽으로 맞춘다 */
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r.sort((a, b) => b.x! - a.x!));
}

/** 경기장 반쪽 — top 이면 상대(골키퍼가 맨 위, 좌우를 뒤집어 우리 쪽에서 보는 방향) */
function Half({ side, subs, top = false, wide = false, find, onPick, live, slot, tip }: {
  side: LiveSide; subs: Sub[]; top?: boolean; wide?: boolean; find?: Find; onPick?: (p: PlayerSeason) => void;
  live: LiveMatch; slot: (n: number) => number; tip: Tip;
}) {
  const rows = useMemo(() => rowsOf(side.starters), [side.starters]);
  const shown = rows.map((r, i) => ({ r: top ? [...r].reverse() : r, i }));
  /* 세로(폰): 상대는 골키퍼가 맨 위, 우리는 맨 아래. 가로(넓은 화면): 우리 골키퍼가 맨 왼쪽, 상대는 맨 오른쪽.
     줄 안의 순서는 둘 다 같다 — 공격 방향 기준 왼쪽 선수가 위(가로) · 왼쪽(세로) */
  const ordered = (wide ? !top : top) ? shown : [...shown].reverse();
  return (
    <div className="lm__half" data-top={top || undefined}>
      {ordered.map(({ r, i }) => {
        const kind = lineKind(i, rows.length, r.length);
        const labels = lineLabels(kind, r.length);
        const lab = top ? [...labels].reverse() : labels;
        return (
          <div className="pitch__row" key={i}>
            {r.map((p, j) => {
              /* 그 자리를 거쳐 간 선수(선발 → 교체 …) 중 지금 보여 줄 선수 */
              const full = slotChain(p, side, subs);
              const k = slot(full.length);
              const d = full[k];
              const ps = find?.(d) ?? null;
              const partner = full.length > 1 ? (k === 0 ? full[1] : full[k - 1]) : null;
              return (
                <Chip
                  key={p.id} full={full} k={k} tag={lab[j] ?? ''} color={LINE_COLOR[kind]}
                  /* 물결 — 골키퍼 줄부터 한 줄에 60ms, 줄 안은 20ms 씩 */
                  delay={i * 60 + j * 20}
                  onOpen={ps && onPick ? () => onPick(ps) : undefined}
                  hover={tip(() => <PlayerTip p={d} starter={k === 0} live={live} ps={ps} partner={partner} />)}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** 포메이션 탭과 같은 칩 — 등번호 자리에는 이 경기 카드, 아래 알약에는 투입 분 · 골 · 도움 */
/**
 * 포메이션 탭과 같은 칩 — 등번호 자리에는 이 경기 카드, 아래 알약에는 투입 분 · 골 · 도움.
 *
 * 교체가 있었던 자리는 그 자리를 거쳐 간 선수(full)를 **전부 겹쳐 그려 두고 투명도만 바꾼다**(크로스페이드).
 * 예전엔 선수가 바뀔 때 안쪽을 새로 그려 이전 선수가 즉시 사라지고 새 선수만 나타나, 칩이 한순간
 * 비어 깜빡여 보였다(2026-10-22). 아무것도 사라지지 않으니 자리 · 크기도 흔들리지 않는다.
 * delay 는 골키퍼 쪽부터 공격 쪽으로 물결처럼 바뀌게 하는 칩별 지연(ms).
 */
function Chip({ full, k, tag, color, onOpen, hover, delay = 0 }: {
  full: LivePlayer[]; k: number; tag: string; color: string; onOpen?: () => void;
  hover: ReturnType<Tip>; delay?: number;
}) {
  const p = full[k];
  const starter = full[0];
  const cycled = full.length > 1;
  const redNow = p.cards.some((c) => c.kind !== 'y');
  const title = [
    p.name,
    p !== starter ? `${p.in ?? '?'}분 ${full[k - 1]?.name ?? starter.name} 대신 투입` : '',
    p.rating ? `평점 ${p.rating}` : '',
    ...p.cards.map((c) => `${c.kind === 'y' ? '경고' : '퇴장'}${c.min ? ` ${c.min}'` : ''}`),
  ].filter(Boolean).join(' · ');
  /* 알약에 들어갈 것 — 선수마다 */
  const pill = (x: LivePlayer, i: number) => {
    const subbed = i > 0;
    const wentOff = cycled && x.out != null && i < full.length - 1;
    const has = subbed || wentOff || x.goals > 0 || x.assists > 0;
    return { has, body: (
      <>
        {subbed && <em className="lm__ink">↑{x.in ?? ''}&apos;</em>}
        {wentOff && <em className="lm__outk">↓{x.out}&apos;</em>}
        {x.goals > 0 && <em className="g">⚽{x.goals}</em>}
        {x.assists > 0 && <em className="a">A{x.assists}</em>}
        {!has && <em>·</em>}
      </>
    ) };
  };
  const pills = full.map(pill);
  const Box = onOpen ? 'button' : 'div';
  const on = (i: number) => (i === k ? true : undefined);
  return (
    <Box
      className="chipbox lm__chip" style={{ ['--pc' as string]: color, ['--d' as string]: `${delay}ms` }}
      data-red={redNow || undefined} data-cyc={cycled || undefined}
      title={HAS_HOVER ? undefined : onOpen ? `${title} · 눌러서 시즌 기록` : title}
      {...hover}
      {...(onOpen ? { type: 'button' as const, onClick: onOpen } : {})}
    >
      {tag && <span className="chipbox__tag">{tag}</span>}
      <span className="chipbox__ring">
        {full.map((x, i) => {
          const red = x.cards.some((c) => c.kind !== 'y');
          const yellow = !red && x.cards.length > 0;
          return (
            <span key={x.id} className="lm__layer" data-on={on(i)} aria-hidden={i !== k || undefined}>
              <Headshot id={`fm-${x.id}`} src={fotmobImage(x.id)} kind="espn" label={x.no != null ? String(x.no) : x.last.slice(0, 1)} size={38} className="chipbox__hs" />
              {red || yellow
                ? <span className="chipbox__no chipbox__no--card" data-kind={red ? 'red' : 'yellow'}><CardShape color={red ? 'red' : 'yellow'} /></span>
                : <span className="chipbox__no num">{x.no ?? ''}</span>}
              {/* 평점이 없으면(FotMob 이 비움 — 짧게 뛴 교체 선수 · 킥오프 전) 흐린 "–" 자리표시. 지어내지 않는다 */}
              {x.rating != null
                ? <RatingBadge v={x.rating} cls="chipbox__rtg" />
                : <span className="rtg chipbox__rtg lm__rtg0" title="평점 없음 (FotMob)">–</span>}
            </span>
          );
        })}
      </span>
      <span className="chipbox__name lm__stack">
        {full.map((x, i) => <span key={x.id} className="lm__layer" data-on={on(i)} aria-hidden={i !== k || undefined}>{x.cap && <em className="lm__cap">C</em>}{x.last}</span>)}
      </span>
      {/* 알약은 늘 그린다(비면 숨김) — 줄마다 칩 높이가 같아야 배치가 흔들리지 않는다 */}
      <span className="chipbox__stat num lm__stack" data-empty={!pills[k].has || undefined}>
        {pills.map((x, i) => <span key={full[i].id} className="lm__layer" data-on={on(i)} aria-hidden={i !== k || undefined}>{x.body}</span>)}
      </span>
    </Box>
  );
}

/** 팀별 교체 · 벤치 대기 */
function BenchCol({ side, subs, crest, active, find, onPick, live, tip }: {
  side: LiveSide; subs: Sub[]; crest: React.ReactNode; active: boolean; find?: Find; onPick?: (p: PlayerSeason) => void;
  live: LiveMatch; tip: Tip;
}) {
  const byId = new Map([...side.starters, ...side.bench].map((p) => [p.id, p]));
  const usedIds = new Set(subs.map((s) => s.inId));
  /* 벤치 대기 — 포지션(GK → FW) · 등번호 순. 포지션은 FotMob 값, 없으면(예전 파일) 이어진 우리 스쿼드 값 */
  const waiting = side.bench
    .filter((p) => !usedIds.has(p.id) && p.in == null)
    .map((p) => { const ps = find?.(p) ?? null; return { p, ps, pos: p.pos ?? ps?.pos }; })
    .sort((a, b) => POS_ORDER.indexOf(a.pos ?? '') - POS_ORDER.indexOf(b.pos ?? '') || (a.p.no ?? 99) - (b.p.no ?? 99));
  const face = (p: LivePlayer | undefined, name: string) => (
    <Headshot id={`fm-${p?.id ?? name}`} src={p ? fotmobImage(p.id) : undefined} kind="espn" label={p?.no != null ? String(p.no) : name.slice(0, 1)} size={26} />
  );
  return (
    <section className="lm__col" data-active={active || undefined}>
      <header className="lm__colh">
        {crest}
        <div>
          <b>{side.name}</b>
          <span>{[side.formation, side.coach && `감독 ${side.coach}`].filter(Boolean).join(' · ')}</span>
        </div>
      </header>

      <h4 className="lm__sh">교체 <em className="num">{subs.length}</em></h4>
      {subs.length === 0 ? <p className="lm__none">아직 교체가 없습니다.</p> : (
        <ul className="lm__subs">
          {[...subs].sort((a, b) => a.min - b.min).map((s, i) => {
            const pin = byId.get(s.inId), pout = byId.get(s.outId);
            /* 들어온 · 나간 선수 줄을 각각 눌러 그 선수 상세 — 우리 스쿼드와 이어진 선수만 */
            const row = (cls: string, lp: LivePlayer | undefined, name: string, body: React.ReactNode) => {
              const ps = lp ? find?.(lp) : null;
              return ps && onPick
                ? <button type="button" className={`${cls} lm__swbtn`} onClick={() => onPick(ps)} title={`${name} · 눌러서 시즌 기록`}>{body}<i className="lm__go" aria-hidden="true">›</i></button>
                : <div className={cls}>{body}</div>;
            };
            return (
              <li key={i} {...tip(() => <SubTip s={s} pin={pin} pout={pout} live={live} />)}>
                <span className="lm__mint num">{s.min}{s.plus ? `+${s.plus}` : ''}&apos;</span>
                <div className="lm__swap">
                  {row('lm__up', pin, s.in, <>
                    <i aria-label="투입">↑</i>{face(pin, s.in)}
                    <b>{s.in}</b>{pin?.no != null && <em className="num">#{pin.no}</em>}
                    <RatingBadge v={pin?.rating ?? undefined} cls="rtg--sm" />
                  </>)}
                  {row('lm__down', pout, s.out, <>
                    <i aria-label="교체 아웃">↓</i>{face(pout, s.out)}
                    <span>{s.out}</span>{pout?.no != null && <em className="num">#{pout.no}</em>}
                    {s.injury && <b className="lm__inj">부상</b>}
                    <RatingBadge v={pout?.rating ?? undefined} cls="rtg--sm" />
                  </>)}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <h4 className="lm__sh">벤치 대기 <em className="num">{waiting.length}</em></h4>
      {waiting.length === 0 ? <p className="lm__none">모두 투입됐습니다.</p> : (
        <ul className="lm__wait">
          {waiting.map(({ p, ps, pos }) => {
            const body = (
              <>
                <span className="lm__wpos" data-empty={!pos || undefined} style={pos ? { ['--pc' as string]: LINE_COLOR[POS_LINE[pos]] } : undefined}>{pos ? POS_LABEL[pos] : '—'}</span>
                <span className="lm__wno num">{p.no ?? ''}</span>
                <span className="lm__wnm">{p.name}</span>
              </>
            );
            return (
              <li key={p.id} {...tip(() => <BenchTip p={p} ps={ps} />)}>
                {ps && onPick
                  ? <button type="button" className="lm__wbtn" onClick={() => onPick(ps)} title={`${p.name} · 눌러서 시즌 기록`}>{body}<i aria-hidden="true">›</i></button>
                  : <div className="lm__wbtn">{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** 경기 흐름 — 가운데 시간 줄, 홈은 왼쪽 · 원정은 오른쪽. 골은 줄 전체를 강조하고 그때 스코어를 크게 */
function Timeline({ live, crest, colors }: { live: LiveMatch; crest: (k: 'home' | 'away', s: number) => React.ReactNode; colors: { home: string; away: string } }) {
  const evs = useMemo(
    () => [...live.events].sort((a, b) => a.min - b.min || ((a as { plus?: number }).plus ?? 0) - ((b as { plus?: number }).plus ?? 0)),
    [live.events],
  );
  if (!evs.length) return null;
  /* 하프타임 줄에 그때 스코어 — 그 전의 마지막 골에서 */
  const rows = evs.map((e, i) => {
    const last = evs.slice(0, i + 1).filter((x): x is Goal => x.t === 'goal' && !!x.score).pop();
    return { e, at: (last?.score ?? [0, 0]) as [number, number] };
  });
  return (
    <section className="lm__tl">
      <header className="lm__tlh">
        <span>{crest('home', 18)}{live.home.name}</span>
        <b>경기 흐름</b>
        <span>{live.away.name}{crest('away', 18)}</span>
      </header>
      <ol>
        {rows.map(({ e, at }, i) => {
          if (e.t === 'half') {
            return <li key={i} className="lm__mark"><span>{e.label || '하프타임'} <b className="num">{at[0]} : {at[1]}</b></span></li>;
          }
          const min = `${e.min}${e.plus ? `+${e.plus}` : ''}'`;
          return (
            <li key={i} data-side={e.side} data-t={e.t} style={e.t === 'goal' ? { ['--tc' as string]: colors[e.side] } : undefined}>
              <div className="lm__ev">{evBody(e)}</div>
              <div className="lm__mid">
                <span className="lm__mint num">{min}</span>
                {e.t === 'goal' && e.score && <span className="lm__gs num">{e.score[0]} : {e.score[1]}</span>}
              </div>
            </li>
          );
        })}
        {live.phase === 'done' && <li className="lm__mark lm__mark--ft"><span>경기 종료 <b className="num">{live.score[0]} : {live.score[1]}</b></span></li>}
      </ol>
    </section>
  );
}

/** 폰은 성만 — 좁은 칸에서 "Dominic Calvert…" 처럼 잘렸다 */
const Nm = ({ n }: { n: string }) => <><span className="m-full">{n}</span><span className="m-short">{lastName(n)}</span></>;

function evBody(e: Exclude<LiveEvent, { t: 'half' }>) {
  if (e.t === 'goal') {
    return (
      <>
        <span className="lm__evm"><i className="lm__ico" aria-hidden="true">⚽</i><b><Nm n={e.player} /></b></span>
        {(e.pen || e.og) && <span className="lm__evs">{e.pen ? '페널티킥' : '자책골'}</span>}
      </>
    );
  }
  if (e.t === 'card') {
    return (
      <>
        <span className="lm__evm"><span className="lm__ico"><CardShape color={e.kind === 'y' ? 'yellow' : 'red'} w={10} /></span><b><Nm n={e.player} /></b></span>
        {e.kind !== 'y' && <span className="lm__evs">{e.kind === 'yr' ? '경고 누적 퇴장' : '퇴장'}</span>}
      </>
    );
  }
  return (
    <>
      {/* 부상은 나간 선수 쪽 — 예전엔 들어간 선수 옆에 붙어 교체 목록과 반대로 읽혔다(2026-10-19 토트넘) */}
      <span className="lm__evm lm__up"><i className="lm__ico" aria-hidden="true">↑</i><b><Nm n={e.in} /></b></span>
      <span className="lm__evs lm__down"><i className="lm__ico" aria-hidden="true">↓</i><Nm n={e.out} />{e.injury && <em className="lm__inj">부상</em>}</span>
    </>
  );
}

/* ── 호버 카드 (넓은 화면 · 마우스) ─────────────────────────────── */
/*
 * 가시성 우선(2026-10-22): 사진 · 이름 머리 + 큰 숫자 타일(출전 · 평점 · 골 · 도움) + 2열 기록 표 + 색 칩.
 * 위 줄의 색은 포지션 색(포메이션 칩과 같은 LINE_COLOR)이다.
 */

/** 떠 있는 상자 — 요소 아래(아래 공간이 모자라면 위), 화면 밖으로 나가지 않게 */
function TipBox({ el, children }: { el: HTMLElement; children: React.ReactNode }) {
  const r = el.getBoundingClientRect();
  const W = 300;
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, r.left + r.width / 2 - W / 2));
  const below = window.innerHeight - r.bottom > 300;
  return (
    <div className="lmt" role="tooltip" style={{ left, width: W, ...(below ? { top: r.bottom + 10 } : { top: r.top - 10, transform: 'translateY(-100%)' }) }}>
      {children}
    </div>
  );
}

const POS_KO = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' } as const;
const mins = (xs: { min: number; plus?: number }[]) => xs.map((x) => `${x.min}${x.plus ? `+${x.plus}` : ''}'`).join(' ');
const posColor = (pos?: LivePlayer['pos']) => (pos ? LINE_COLOR[POS_LINE[pos]] : 'rgba(255,255,255,.35)');

/** 머리 — 사진 · 이름 · 포지션 칩 · 등번호 · 주장 */
function TipHead({ p, sub, fallbackPos }: { p: LivePlayer; sub?: React.ReactNode; fallbackPos?: LivePlayer['pos'] }) {
  const pos = p.pos ?? fallbackPos;
  return (
    <div className="lmt__h" style={{ ['--pc' as string]: posColor(pos) }}>
      <Headshot id={`fm-${p.id}`} src={fotmobImage(p.id)} kind="espn" label={p.no != null ? String(p.no) : p.last.slice(0, 1)} size={44} className="lmt__face" />
      <div className="lmt__who">
        <b>{p.name}</b>
        <span>
          {pos && <em className="lmt__pos">{POS_KO[pos]}</em>}
          {p.no != null && <em className="lmt__no num">#{p.no}</em>}
          {p.cap && <em className="lmt__capt">주장</em>}
          {sub}
        </span>
      </div>
    </div>
  );
}

/** 큰 숫자 타일 */
function Tile({ v, k, tone }: { v: React.ReactNode; k: string; tone?: 'g' | 'a' | 'mute' }) {
  return <div className="lmt__tile" data-tone={tone}><b className="num">{v}</b><span className="lmt__k">{k}</span></div>;
}

/** 2열 기록 표 */
function Pairs({ rows, one = false }: { rows: [string, React.ReactNode][]; one?: boolean }) {
  if (!rows.length) return null;
  return <dl className="lmt__dl" data-one={one || undefined}>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>)}</dl>;
}

/** 포메이션 칩 — 이 경기 카드 + (우리 선수면) 시즌과 비교 */
function PlayerTip({ p, starter, live, ps, partner }: { p: LivePlayer; starter: boolean; live: LiveMatch; ps: PlayerSeason | null; partner: LivePlayer | null }) {
  const played = playedMin(p, starter, live);
  const { goals, assists } = contributions(live.events, p);
  const diff = p.rating != null && ps?.rating != null ? Math.round((p.rating - ps.rating) * 10) / 10 : null;
  const role = starter
    ? (p.out != null ? <em className="lmt__chip" data-k="out">↓{p.out}&apos; 교체 아웃{p.outInjury ? ' · 부상' : ''}</em> : <em className="lmt__chip" data-k="start">선발</em>)
    : (p.in != null ? <em className="lmt__chip" data-k="in">↑{p.in}&apos; 교체 투입</em> : <em className="lmt__chip">출전 안 함</em>);
  return (
    <>
      <TipHead p={p} sub={role} fallbackPos={ps?.pos} />
      <div className="lmt__tiles">
        <Tile v={played != null ? `${played}'` : '–'} k="출전" tone={played == null ? 'mute' : undefined} />
        <div className="lmt__tile lmt__tile--rtg">
          {p.rating != null ? <RatingBadge v={p.rating} cls="lmt__rtg" /> : <b className="num lmt__none">–</b>}
          <span className="lmt__k">평점</span>
        </div>
        <Tile v={goals.length || p.goals} k="골" tone={goals.length || p.goals ? 'g' : 'mute'} />
        <Tile v={assists.length || p.assists} k="도움" tone={assists.length || p.assists ? 'a' : 'mute'} />
      </div>
      {(goals.length > 0 || assists.length > 0 || p.cards.length > 0) && (
        <div className="lmt__ev">
          {goals.length > 0 && <span data-k="g">⚽ {mins(goals)}</span>}
          {assists.length > 0 && <span data-k="a">도움 {mins(assists)}</span>}
          {p.cards.map((c, i) => (
            <span key={i} data-k={c.kind === 'y' ? 'y' : 'r'}><CardShape color={c.kind === 'y' ? 'yellow' : 'red'} w={9} />{c.min != null ? ` ${c.min}'` : ''}{c.kind === 'yr' ? ' 경고 누적' : c.kind === 'r' ? ' 퇴장' : ''}</span>
          ))}
        </div>
      )}
      <Pairs rows={statPairs(p.st)} />
      {partner && (
        <div className="lmt__sw">
          <Headshot id={`fm-${partner.id}`} src={fotmobImage(partner.id)} kind="espn" label={partner.no != null ? String(partner.no) : partner.last.slice(0, 1)} size={22} />
          <span>{starter ? <>↓{p.out ?? partner.in}&apos; 이후 <b>{partner.name}</b></> : <>↑{p.in}&apos; <b>{partner.name}</b> 대신</>}</span>
        </div>
      )}
      {ps && (
        <div className="lmt__season">
          <span className="lmt__cap">시즌</span>
          <div className="lmt__srow">
            <span className="num">{ps.apps}경기 · {ps.goals}골 {ps.assists}도움</span>
            {ps.rating != null && (
              <span className="lmt__cmp num">
                <small>평점</small><RatingBadge v={ps.rating} cls="rtg--sm" title="시즌 평점" />
                {diff != null && diff !== 0 && <em data-up={diff > 0 || undefined}>오늘 {diff > 0 ? '▲' : '▼'}{Math.abs(diff).toFixed(1)}</em>}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** 벤치 대기 — 왜 안 뛰는지(시즌 출전 · 마지막 출전 · 부상 · 징계) */
function BenchTip({ p, ps }: { p: LivePlayer; ps: PlayerSeason | null }) {
  if (!ps) {
    return (
      <>
        <TipHead p={p} sub={<em className="lmt__chip">벤치</em>} />
        <p className="lmt__lo">시즌 기록 없음 — 상대 팀이거나 이번 시즌 첫 명단</p>
      </>
    );
  }
  const last = [...ps.recent].sort((a, b) => b.kickoffUtc.localeCompare(a.kickoffUtc))[0];
  const lp = last && kstParts(last.kickoffUtc);
  return (
    <>
      <TipHead p={p} sub={<em className="lmt__chip">벤치</em>} fallbackPos={ps.pos} />
      {(ps.inj || ps.disc?.sus) && (
        <div className="lmt__alerts">
          {ps.inj && <em className="lmt__alert" data-doubt={ps.inj.doubtful || undefined}>{ps.inj.doubtful ? '출전 불투명' : '부상'} · {ps.inj.ko}</em>}
          {ps.disc?.sus && <em className="lmt__alert">징계 · {susNote(ps.disc.sus)}</em>}
        </div>
      )}
      <div className="lmt__tiles">
        <Tile v={ps.apps} k="시즌 출전" />
        <Tile v={ps.starts} k="선발" />
        <Tile v={ps.minutes} k="분" />
        <div className="lmt__tile lmt__tile--rtg">
          {ps.rating != null ? <RatingBadge v={ps.rating} cls="lmt__rtg" /> : <b className="num lmt__none">–</b>}
          <span className="lmt__k">시즌 평점</span>
        </div>
      </div>
      {last && lp && (
        <Pairs rows={[['마지막 출전', `${lp.month}.${lp.date} vs ${last.opponentName}`], ['그 경기', `${last.started ? '선발' : '교체'} · ${last.minutes}분`]]} one />
      )}
    </>
  );
}

/** 교체 한 건 — 그때 스코어 · 두 선수 기록 · 들어간 선수가 그 뒤에 한 것 */
function SubTip({ s, pin, pout, live }: { s: Sub; pin?: LivePlayer; pout?: LivePlayer; live: LiveMatch }) {
  const [h, a] = scoreAt(live.events, s.min);
  const [me, them] = s.side === 'home' ? [h, a] : [a, h];
  const state = me > them ? 'lead' : me < them ? 'trail' : 'level';
  const after = pin ? contributions(live.events, pin) : { goals: [], assists: [] };
  const g = after.goals.filter((x) => x.min >= s.min).length, as = after.assists.filter((x) => x.min >= s.min).length;
  const row = (p: LivePlayer | undefined, name: string, dir: 'in' | 'out', starter: boolean) => {
    const m = p ? playedMin(p, starter, live) : null;
    return (
      <div className="lmt__prow" data-dir={dir}>
        <i aria-hidden="true">{dir === 'in' ? '↑' : '↓'}</i>
        <Headshot id={`fm-${p?.id ?? name}`} src={p ? fotmobImage(p.id) : undefined} kind="espn" label={p?.no != null ? String(p.no) : name.slice(0, 1)} size={28} />
        <span className="lmt__pn"><b>{name}</b><small className="num">{m != null ? `${m}분` : ''}{p?.no != null ? ` · #${p.no}` : ''}</small></span>
        {p?.rating != null ? <RatingBadge v={p.rating} cls="rtg--sm" /> : <em className="lmt__lo">–</em>}
      </div>
    );
  };
  return (
    <>
      <div className="lmt__subh">
        <b className="num">{s.min}{s.plus ? `+${s.plus}` : ''}&apos;</b>
        <span>교체{s.injury && <em className="lmt__chip" data-k="inj">부상</em>}</span>
        <em className="lmt__score num" data-state={state}>{me}:{them} {state === 'lead' ? '앞설 때' : state === 'trail' ? '뒤질 때' : '동점일 때'}</em>
      </div>
      {row(pin, s.in, 'in', false)}
      {row(pout, s.out, 'out', !!pout && pout.in == null)}
      <div className="lmt__after" data-hit={g || as ? true : undefined}>
        <span>투입 후</span>
        <b>{g || as ? [g && `⚽ ${g}골`, as && `도움 ${as}`].filter(Boolean).join(' · ') : '공격 포인트 없음'}</b>
      </div>
    </>
  );
}
