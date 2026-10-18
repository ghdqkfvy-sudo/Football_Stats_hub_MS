import { useEffect, useState } from 'react';
import type { LiveEvent, LiveMatch, LivePlayer, LiveSide } from '../types/feedTypes';
import type { Match } from '../lib/types';
import { onPitch } from '../lib/live';
import { fotmobImage } from '../lib/injury';
import { kstFullDate, kstTime } from '../lib/kst';
import { PitchMarkings } from './PitchMarkings';
import { Headshot } from './Headshot';
import { RatingBadge } from './RatingBadge';
import { CardShape } from './InjuryMark';
import { Crest } from './Crest';

/**
 * 오늘의 경기 — 양 팀 포메이션(한 경기장 위아래) · 교체 · 벤치 · 경기 흐름 (2026-10-18).
 *
 * 데이터는 경기 중 수집 워크플로가 1분마다 고치는 live-{slug}.json(scripts/lib/live.mjs).
 * 화면에는 5~7분 늦게 닿는다 — 머리에 "n분 전 갱신" 을 늘 적는다.
 *  · 우리 팀은 아래, 상대는 위(상대는 좌우를 뒤집어 우리 쪽에서 보는 방향으로)
 *  · 칩 = 지금 경기장에 있는 선수. 교체로 들어온 선수는 "↑분", 나간 선수는 교체 목록에
 *  · 카드 · 평점은 이 경기의 것(평점은 FotMob 실시간)
 */
export function LiveMatchView({ live, match }: { live: LiveMatch; match?: Match }) {
  const ours = live.ours ?? 'home';
  const theirs = ours === 'home' ? 'away' : 'home';
  const order: ('home' | 'away')[] = [ours, theirs];

  return (
    <div className="lm">
      <LiveHead live={live} match={match} />
      {live.lineupType === 'predicted' && <p className="lm__note">아직 공식 라인업 발표 전 — FotMob 예상 라인업입니다.</p>}

      <div className="lm__pitch">
        <span className="lm__fm">{live[theirs].name}<em className="num">{live[theirs].formation ?? ''}</em></span>
        <div className="lm__field">
          <PitchMarkings />
          <Half side={live[theirs]} subs={subsOf(live, theirs)} top />
          <Half side={live[ours]} subs={subsOf(live, ours)} />
        </div>
        <span className="lm__fm">{live[ours].name}<em className="num">{live[ours].formation ?? ''}</em></span>
      </div>
      <p className="lm__key">칩의 평점 · 카드는 이 경기 기록(FotMob) · ↑ 교체 투입 분</p>

      <div className="lm__teams">
        {order.map((k) => <BenchCol key={k} side={live[k]} subs={subsOf(live, k)} />)}
      </div>

      <Timeline live={live} />
    </div>
  );
}

const subsOf = (live: LiveMatch, side: 'home' | 'away') =>
  live.events.filter((e): e is Extract<LiveEvent, { t: 'sub' }> => e.t === 'sub' && e.side === side);

/** 머리 — 대회 · 상태 · 스코어 · 갱신 시각 */
function LiveHead({ live, match }: { live: LiveMatch; match?: Match }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  const ago = Math.max(0, Math.round((now - Date.parse(live.updatedAt)) / 60_000));
  const state = live.phase === 'live' ? (live.clock ?? 'LIVE') : live.phase === 'done' ? '경기 종료' : '킥오프 전';
  const team = (k: 'home' | 'away') => {
    const t = match?.[k];
    return t
      ? <Crest team={t} size={34} />
      : <img className="lm__logo" src={`https://images.fotmob.com/image_resources/logo/teamlogo/${live[k].fm}_small.png`} alt="" width={34} height={34} />;
  };
  return (
    <div className="lm__head">
      <div className="lm__meta">
        <span className="lm__state" data-phase={live.phase}>{live.phase === 'live' && <i />}{state}</span>
        {live.league && <span>{live.league}</span>}
        <span className="lm__ago">{ago < 1 ? '방금' : `${ago}분 전`} 갱신</span>
      </div>
      <div className="lm__score">
        <div className="lm__team">{team('home')}<b>{live.home.name}</b></div>
        <div className="lm__sc num">
          {live.phase === 'pre'
            ? <span className="lm__ko">{kstTime(live.kickoffUtc)}<small>{kstFullDate(live.kickoffUtc)}</small></span>
            : <>{live.score[0]}<i>-</i>{live.score[1]}</>}
        </div>
        <div className="lm__team">{team('away')}<b>{live.away.name}</b></div>
      </div>
      <Scorers live={live} />
    </div>
  );
}

/** 득점자 — 홈 왼쪽 · 원정 오른쪽 */
function Scorers({ live }: { live: LiveMatch }) {
  const goals = live.events.filter((e): e is Extract<LiveEvent, { t: 'goal' }> => e.t === 'goal').sort((a, b) => a.min - b.min);
  if (!goals.length) return null;
  const col = (s: 'home' | 'away') => goals.filter((g) => g.side === s).map((g, i) => (
    <span key={i}>{lastName(g.player)} <em className="num">{g.min}{g.plus ? `+${g.plus}` : ''}&apos;{g.pen ? ' (PK)' : ''}{g.og ? ' (자책)' : ''}</em></span>
  ));
  return <div className="lm__goals"><div>{col('home')}</div><i>⚽</i><div>{col('away')}</div></div>;
}

const lastName = (n: string) => n.split(' ').slice(-1)[0] ?? n;

/** 경기장 반쪽 — top 이면 상대(위쪽 · 좌우 뒤집음) */
function Half({ side, subs, top = false }: { side: LiveSide; subs: Extract<LiveEvent, { t: 'sub' }>[]; top?: boolean }) {
  return (
    <>
      {side.starters.filter((p) => p.x != null && p.y != null).map((p) => {
        const { now } = onPitch(p, subs, side.bench);
        const left = (top ? 1 - p.x! : p.x!) * 100;
        /* FotMob y 는 골키퍼 0.1 ~ 최전방 0.9 쯤 — 반쪽(50%)을 다 쓰면 두 팀 최전방이 하프라인에서 겹쳐서
           골문 쪽 4% ~ 하프라인 7% 앞까지로 줄인다 */
        const y = Math.min(1, Math.max(0, p.y!));
        const t = top ? 4 + y * 41 : 96 - y * 41;
        return <Chip key={p.id} p={now} starter={p} style={{ left: `${left}%`, top: `${t}%` }} />;
      })}
    </>
  );
}

function Chip({ p, starter, style }: { p: LivePlayer; starter: LivePlayer; style: React.CSSProperties }) {
  const red = p.cards.some((c) => c.kind !== 'y');
  const yellow = !red && p.cards.length > 0;
  const subbed = p !== starter;
  const title = [
    p.name,
    subbed ? `${p.in ?? '?'}분 ${starter.name} 대신 투입` : '',
    p.rating ? `평점 ${p.rating}` : '',
    p.cards.map((c) => `${c.kind === 'y' ? '경고' : '퇴장'}${c.min ? ` ${c.min}'` : ''}`).join(' · '),
  ].filter(Boolean).join(' · ');
  return (
    <div className="lm__p" style={style} data-red={red || undefined} title={title}>
      <span className="lm__ring">
        <Headshot id={`fm-${p.id}`} src={fotmobImage(p.id)} kind="espn" label={p.no != null ? String(p.no) : p.last.slice(0, 1)} size={34} />
        <i className="lm__no num">{p.no ?? ''}</i>
        {(red || yellow) && <span className="lm__card"><CardShape color={red ? 'red' : 'yellow'} w={9} /></span>}
        <RatingBadge v={p.rating ?? undefined} cls="lm__rtg" />
      </span>
      <b>{p.cap && <em className="lm__cap">C</em>}{p.last}</b>
      {(subbed || p.goals > 0 || p.assists > 0) && (
        <small className="num">
          {subbed && <em className="lm__in">↑{p.in ?? ''}&apos;</em>}
          {p.goals > 0 && <em>⚽{p.goals > 1 ? p.goals : ''}</em>}
          {p.assists > 0 && <em className="lm__a">A{p.assists > 1 ? p.assists : ''}</em>}
        </small>
      )}
    </div>
  );
}

/** 팀별 교체 · 벤치 대기 */
function BenchCol({ side, subs }: { side: LiveSide; subs: Extract<LiveEvent, { t: 'sub' }>[] }) {
  const byId = new Map([...side.starters, ...side.bench].map((p) => [p.id, p]));
  const usedIds = new Set(subs.map((s) => s.inId));
  const waiting = side.bench.filter((p) => !usedIds.has(p.id) && p.in == null);
  return (
    <section className="lm__col">
      <h3>
        <b>{side.name}</b>
        <span>{side.formation ?? ''}{side.coach ? ` · 감독 ${side.coach}` : ''}</span>
      </h3>
      <div className="lm__sh">교체 {subs.length ? `(${subs.length})` : ''}</div>
      {subs.length === 0 ? <p className="lm__none">아직 교체 없음</p> : (
        <ul className="lm__subs">
          {[...subs].sort((a, b) => a.min - b.min).map((s, i) => {
            const pin = byId.get(s.inId), pout = byId.get(s.outId);
            return (
              <li key={i}>
                <span className="lm__min num">{s.min}{s.plus ? `+${s.plus}` : ''}&apos;</span>
                <span className="lm__swap">
                  <span className="lm__up"><i>↑</i>{pin?.no != null && <em className="num">{pin.no}</em>}{s.in}<RatingBadge v={pin?.rating ?? undefined} cls="rtg--sm" /></span>
                  <span className="lm__down"><i>↓</i>{pout?.no != null && <em className="num">{pout.no}</em>}{s.out}<RatingBadge v={pout?.rating ?? undefined} cls="rtg--sm" />{s.injury && <b className="lm__inj">부상</b>}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="lm__sh">벤치 대기 {waiting.length ? `(${waiting.length})` : ''}</div>
      <ul className="lm__wait">
        {waiting.map((p) => (
          <li key={p.id}><em className="num">{p.no ?? ''}</em>{p.name}</li>
        ))}
      </ul>
    </section>
  );
}

/** 경기 흐름 — 시간순, 홈은 왼쪽 · 원정은 오른쪽 */
function Timeline({ live }: { live: LiveMatch }) {
  const evs = [...live.events].sort((a, b) => a.min - b.min || ((a as { plus?: number }).plus ?? 0) - ((b as { plus?: number }).plus ?? 0));
  if (!evs.length) return null;
  return (
    <section className="lm__tl">
      <div className="lm__sh">경기 흐름</div>
      <ol>
        {evs.map((e, i) => {
          if (e.t === 'half') return <li key={i} className="lm__half"><span>{e.label || '하프타임'}</span></li>;
          const min = `${e.min}${e.plus ? `+${e.plus}` : ''}'`;
          /* 한 줄째 = 아이콘 + 주인공, 두 줄째 = 덧붙임(스코어 · 나간 선수) — 폰의 좁은 칸에서 아이콘만 따로 떨어지지 않게 */
          const [main, sub] = e.t === 'goal'
            ? [<><i className="lm__ico">⚽</i><b>{e.player}</b>{e.pen && <em>PK</em>}{e.og && <em>자책</em>}</>, e.score ? `${e.score[0]} - ${e.score[1]}` : null]
            : e.t === 'card'
              ? [<><span className="lm__ico"><CardShape color={e.kind === 'y' ? 'yellow' : 'red'} w={9} /></span><b>{e.player}</b></>, e.kind === 'yr' ? '경고 누적 퇴장' : e.kind === 'r' ? '퇴장' : null]
              : [<><i className="lm__ico lm__ico--sub">↑</i><b>{e.in}</b>{e.injury && <i className="lm__inj">부상</i>}</>, <><i className="lm__ico lm__ico--out">↓</i>{e.out}</>];
          return (
            <li key={i} data-side={e.side}>
              <span className="lm__min num">{min}</span>
              <span className="lm__ev">
                <span className="lm__evm">{main}</span>
                {sub && <span className="lm__evs">{sub}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
