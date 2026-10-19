import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LiveEvent, LiveMatch, LivePlayer, LiveSide } from '../types/feedTypes';
import type { Match } from '../lib/types';
import { onPitch, teamColor } from '../lib/live';
import { fotmobImage } from '../lib/injury';
import { kstFullDate, kstTime } from '../lib/kst';
import { LINE_COLOR, lineKind, lineLabels } from '../lib/squad';
import { useIsMobile } from '../lib/useMedia';
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
  const theirs = ours === 'home' ? 'away' : 'home';
  const [pick, setPick] = useState<'home' | 'away'>(ours);
  /* 넓은 화면은 경기장을 눕힌다(우리 팀 왼쪽 → 오른쪽 공격) — 세로로 두 팀을 쌓으면 화면 두 장 길이였다 */
  const wide = !useIsMobile();
  const crest = (k: 'home' | 'away', size: number) => <TeamCrest live={live} match={match} k={k} size={size} />;

  return (
    <div className="lm">
      <LiveHead live={live} crest={crest} />
      {live.lineupType === 'predicted' && <p className="lm__note">아직 공식 라인업 발표 전 — FotMob 예상 라인업입니다.</p>}

      <section className="lm__pitch">
        {wide ? (
          <div className="lm__bars">
            <TeamBar side={live[ours]} crest={crest(ours, 18)} />
            <TeamBar side={live[theirs]} crest={crest(theirs, 18)} />
          </div>
        ) : <TeamBar side={live[theirs]} crest={crest(theirs, 18)} />}
        <div className="lm__field" data-wide={wide || undefined}>
          <div className="lm__lines"><PitchMarkings /></div>
          {wide ? (
            <>
              <Half side={live[ours]} subs={subsOf(live, ours)} wide {...pickProps} />
              <Half side={live[theirs]} subs={subsOf(live, theirs)} top wide />
            </>
          ) : (
            <>
              <Half side={live[theirs]} subs={subsOf(live, theirs)} top />
              <Half side={live[ours]} subs={subsOf(live, ours)} {...pickProps} />
            </>
          )}
        </div>
        {!wide && <TeamBar side={live[ours]} crest={crest(ours, 18)} />}
        {/* 범례 — 예전엔 "↑74' 교체 투입" 이라 실제 선수(마운트 74분) 기록처럼 읽혔다 */}
        <p className="lm__key"><span>평점 · 카드 = 이 경기 기록(FotMob)</span><span><b className="lm__ink">↑분</b> = 교체 투입 시간</span></p>
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
            <BenchCol key={k} side={live[k]} subs={subsOf(live, k)} crest={crest(k, 22)} active={pick === k} {...(k === ours ? pickProps : {})} />
          ))}
        </div>
      </section>

      <Timeline live={live} crest={crest} colors={{ home: teamColor(live, 'home', match?.home.id), away: teamColor(live, 'away', match?.away.id) }} />
      {find && <PlayerDetail p={detail} onClose={closeDetail} />}
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
function LiveHead({ live, crest }: { live: LiveMatch; crest: (k: 'home' | 'away', s: number) => React.ReactNode }) {
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
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r.sort((a, b) => a.x! - b.x!));
}

/** 경기장 반쪽 — top 이면 상대(골키퍼가 맨 위, 좌우를 뒤집어 우리 쪽에서 보는 방향) */
function Half({ side, subs, top = false, wide = false, find, onPick }: {
  side: LiveSide; subs: Sub[]; top?: boolean; wide?: boolean; find?: Find; onPick?: (p: PlayerSeason) => void;
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
              const now = onPitch(p, subs, side.bench).now;
              const ps = find?.(now);
              return <Chip key={p.id} starter={p} now={now} tag={lab[j] ?? ''} color={LINE_COLOR[kind]} onOpen={ps && onPick ? () => onPick(ps) : undefined} />;
            })}
          </div>
        );
      })}
    </div>
  );
}

/** 포메이션 탭과 같은 칩 — 등번호 자리에는 이 경기 카드, 아래 알약에는 투입 분 · 골 · 도움 */
function Chip({ starter, now: p, tag, color, onOpen }: { starter: LivePlayer; now: LivePlayer; tag: string; color: string; onOpen?: () => void }) {
  const red = p.cards.some((c) => c.kind !== 'y');
  const yellow = !red && p.cards.length > 0;
  const subbed = p !== starter;
  const title = [
    p.name,
    subbed ? `${p.in ?? '?'}분 ${starter.name} 대신 투입` : '',
    p.rating ? `평점 ${p.rating}` : '',
    ...p.cards.map((c) => `${c.kind === 'y' ? '경고' : '퇴장'}${c.min ? ` ${c.min}'` : ''}`),
  ].filter(Boolean).join(' · ');
  const stat = subbed || p.goals > 0 || p.assists > 0;
  const Box = onOpen ? 'button' : 'div';
  return (
    <Box className="chipbox lm__chip" style={{ ['--pc' as string]: color }} data-red={red || undefined} title={onOpen ? `${title} · 눌러서 시즌 기록` : title} {...(onOpen ? { type: 'button' as const, onClick: onOpen } : {})}>
      {tag && <span className="chipbox__tag">{tag}</span>}
      <span className="chipbox__ring">
        <Headshot id={`fm-${p.id}`} src={fotmobImage(p.id)} kind="espn" label={p.no != null ? String(p.no) : p.last.slice(0, 1)} size={38} className="chipbox__hs" />
        {red || yellow
          ? <span className="chipbox__no chipbox__no--card" data-kind={red ? 'red' : 'yellow'}><CardShape color={red ? 'red' : 'yellow'} /></span>
          : <span className="chipbox__no num">{p.no ?? ''}</span>}
        <RatingBadge v={p.rating ?? undefined} cls="chipbox__rtg" />
      </span>
      <span className="chipbox__name">{p.cap && <em className="lm__cap">C</em>}{p.last}</span>
      {/* 알약은 늘 그린다(비면 숨김) — 줄마다 칩 높이가 같아야 배치가 흔들리지 않는다 */}
      <span className="chipbox__stat num" data-empty={!stat || undefined}>
        {subbed && <em className="lm__ink">↑{p.in ?? ''}&apos;</em>}
        {p.goals > 0 && <em className="g">⚽{p.goals}</em>}
        {p.assists > 0 && <em className="a">A{p.assists}</em>}
        {!stat && <em>·</em>}
      </span>
    </Box>
  );
}

/** 팀별 교체 · 벤치 대기 */
function BenchCol({ side, subs, crest, active, find, onPick }: {
  side: LiveSide; subs: Sub[]; crest: React.ReactNode; active: boolean; find?: Find; onPick?: (p: PlayerSeason) => void;
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
            return (
              <li key={i}>
                <span className="lm__mint num">{s.min}{s.plus ? `+${s.plus}` : ''}&apos;</span>
                <div className="lm__swap">
                  <div className="lm__up">
                    <i aria-label="투입">↑</i>{face(pin, s.in)}
                    <b>{s.in}</b>{pin?.no != null && <em className="num">#{pin.no}</em>}
                    <RatingBadge v={pin?.rating ?? undefined} cls="rtg--sm" />
                  </div>
                  <div className="lm__down">
                    <i aria-label="교체 아웃">↓</i>{face(pout, s.out)}
                    <span>{s.out}</span>{pout?.no != null && <em className="num">#{pout.no}</em>}
                    {s.injury && <b className="lm__inj">부상</b>}
                    <RatingBadge v={pout?.rating ?? undefined} cls="rtg--sm" />
                  </div>
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
              <li key={p.id}>
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
      <span className="lm__evm lm__up"><i className="lm__ico" aria-hidden="true">↑</i><b><Nm n={e.in} /></b>{e.injury && <em className="lm__inj">부상</em>}</span>
      <span className="lm__evs lm__down"><i className="lm__ico" aria-hidden="true">↓</i><Nm n={e.out} /></span>
    </>
  );
}
