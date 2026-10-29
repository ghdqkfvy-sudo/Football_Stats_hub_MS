import { useMemo, useState } from 'react';
import type { CupRoundData } from '../lib/api';
import { currentRound, isKnockoutTree, tiesOf, treeOrder, type Tie } from '../lib/cupBracket';
import { roundKo } from '../lib/rounds';
import { kstShortDate, kstTime } from '../lib/kst';
import { koreansOf } from '../config/targets';
import { Crest } from './Crest';
import { KorFlag } from './KorFlag';
import { Swap, type SwapDir } from './Swap';

/**
 * 컵 라운드 대진 (2026-10-26) — Summary › 대회 순위에서 컵을 고르면 순위표 대신.
 *
 * 한 라운드씩 ‹ › 로 넘긴다. 맞대결마다 카드 한 장 — 끝나면 이긴 쪽에 THROUGH, 진 쪽은 흐리게.
 * 우리 팀(일곱 팀 · 코리안리거 소속팀) 경기는 따로 빼지 않고 제자리에서 팀 컬러로만 표시한다.
 * 넓은 화면은 8강 · 4강 · 결승을 한 장의 대진표(트리)로, 폰은 그것도 라운드마다 ‹ › 로.
 */
type Page = { kind: 'list'; round: number } | { kind: 'tree'; rounds: number[] };

export function CupBracket({ rounds, colors, mobile }: {
  rounds: CupRoundData[];
  /** ESPN 팀 id → 우리 팀 컬러 */
  colors: Record<string, string>;
  mobile: boolean;
}) {
  const pages = useMemo<Page[]>(() => {
    const ko = rounds.map((r, i) => ({ r, i })).filter((x) => isKnockoutTree(x.r.label)).map((x) => x.i);
    const out: Page[] = [];
    rounds.forEach((r, i) => {
      if (!r.matches.length) return;
      if (!mobile && ko.includes(i)) return;
      out.push({ kind: 'list', round: i });
    });
    /* 바로 다음 라운드는 대진이 아직 없어도 "대진 미정" 한 장으로 — 폰은 8강부터도 한 라운드씩,
       넓은 화면은 트리 앞 라운드(포칼 16강처럼)만 */
    const last = out.length ? (out[out.length - 1] as { round: number }).round : -1;
    if (last >= 0 && last + 1 < rounds.length && (mobile || !ko.includes(last + 1))) out.push({ kind: 'list', round: last + 1 });
    if (!mobile && ko.length && (ko.some((i) => rounds[i].matches.length) || out.length)) {
      out.push({ kind: 'tree', rounds: ko });
    }
    return out;
  }, [rounds, mobile]);

  const start = useMemo(() => {
    const cur = currentRound(rounds);
    const at = pages.findIndex((p) => (p.kind === 'list' ? p.round === cur : p.rounds.includes(cur)));
    return at === -1 ? Math.max(0, pages.length - 1) : at;
  }, [pages, rounds]);
  const [picked, setPicked] = useState<number | null>(null);
  const [dir, setDir] = useState<SwapDir>('fade');
  const at = Math.min(picked ?? start, pages.length - 1);
  const go = (to: number) => {
    if (to < 0 || to >= pages.length || to === at) return;
    setDir(to > at ? 'next' : 'prev');
    setPicked(to);
  };
  if (!pages.length) return null;
  const page = pages[at];
  const labelOf = (p: Page) => (p.kind === 'tree' ? '8강 · 4강 · 결승' : roundKo(rounds[p.round].label));

  /* 머리 오른쪽 — 이 라운드 몇 경기 중 몇 경기 끝났나 / 대진표면 결승 날짜 */
  const meta = (() => {
    if (page.kind === 'list') {
      const ts = tiesOf(rounds[page.round].matches);
      if (!ts.length) return <>대진 미정</>;
      return <>{ts.length}경기 · <b className="num">{ts.filter((t) => t.state === 'done').length} / {ts.length}</b> 종료</>;
    }
    const fin = rounds[page.rounds[page.rounds.length - 1]];
    const fm = fin?.matches[0];
    return fm ? <>결승 <b className="num">{kstShortDate(fm.kickoffUtc)}</b>{fm.venue ? ` · ${fm.venue}` : ''}</> : <>결승 대진 미정</>;
  })();

  return (
    <div className="cbr">
      <div className="cbr__nav">
        <button type="button" className="cbr__arr" onClick={() => go(at - 1)} disabled={at === 0} aria-label="이전 라운드">‹</button>
        {[at - 1, at, at + 1].map((i) => (i >= 0 && i < pages.length ? (
          <button key={i} type="button" className="cbr__rb" data-on={i === at || undefined} onClick={() => go(i)}>{labelOf(pages[i])}</button>
        ) : <span key={i} className="cbr__rb cbr__rb--gap" aria-hidden="true" />))}
        <button type="button" className="cbr__arr" onClick={() => go(at + 1)} disabled={at === pages.length - 1} aria-label="다음 라운드">›</button>
        <span className="cbr__meta">{meta}</span>
      </div>
      <Swap k={`p${at}`} dir={dir}>
        {page.kind === 'list'
          ? <TieList ties={tiesOf(rounds[page.round].matches)} colors={colors} />
          : <Tree rounds={page.rounds.map((i) => rounds[i])} colors={colors} />}
      </Swap>
      <p className="cbr__key"><span data-k="ours">우리 팀 경기 — 팀 컬러</span><span data-k="thr">THROUGH = 다음 라운드 진출</span></p>
    </div>
  );
}

const tcOf = (t: Tie, colors: Record<string, string>) => colors[t.a.id] ?? colors[t.b.id];

function TieList({ ties, colors }: { ties: Tie[]; colors: Record<string, string> }) {
  if (!ties.length) return <p className="cbr__none">이 라운드 대진이 아직 나오지 않았습니다.</p>;
  return (
    <div className="cbr__grid">
      {ties.map((t) => <TieCard key={t.key} t={t} tc={tcOf(t, colors)} />)}
    </div>
  );
}

function Side({ t, team, goals }: { t: Tie; team: Tie['a']; goals: number }) {
  const won = t.winnerId === team.id;
  const lost = !!t.winnerId && !won;
  const kor = koreansOf(team.id);
  /* H · A — 단판이면 그 경기, 1·2차전이면 1차전 기준 */
  const home = t.legs[0].home.id === team.id;
  return (
    <>
      <span className="cbr__row" data-lost={lost || undefined}>
        <i className="cbr__ha" data-home={home || undefined} title={home ? '홈' : '원정'}>{home ? 'H' : 'A'}</i>
        <Crest team={team} size={22} />
        <b>{team.shortName}</b>
        {kor.map((n) => <span key={n} className="kortag"><KorFlag />{n}</span>)}
        {won && <em className="cbr__thr">THROUGH</em>}
      </span>
      {t.state !== 'scheduled' && <span className="cbr__sc num" data-lost={lost || undefined}>{goals}</span>}
    </>
  );
}

function TieCard({ t, tc }: { t: Tie; tc?: string }) {
  const first = t.legs[0];
  const live = t.legs.find((l) => l.status === 'live');
  /* 1·2차전 — 다리별 스코어(첫 경기 홈팀 기준) */
  const legsLine = t.legs.length > 1
    ? t.legs.map((l, i) => {
      if (l.status !== 'finished') return `${i + 1}차 ${kstShortDate(l.kickoffUtc)}`;
      const aHome = l.home.id === t.a.id;
      return `${i + 1}차 ${aHome ? l.homeScore : l.awayScore}-${aHome ? l.awayScore : l.homeScore}`;
    }).join(' · ')
    : null;
  return (
    <div className="cbr__tie" data-ours={tc ? true : undefined} data-state={t.state} style={tc ? { ['--tc' as string]: tc } : undefined}>
      <Side t={t} team={t.a} goals={t.agg[0]} />
      <Side t={t} team={t.b} goals={t.agg[1]} />
      {t.state === 'scheduled' && (
        <span className="cbr__ko num">
          <b>{first.timeTBD ? 'TBD' : kstTime(first.kickoffUtc)}</b>
          <span>{kstShortDate(first.kickoffUtc)}</span>
        </span>
      )}
      {(live || t.pens || legsLine) && (
        <span className="cbr__sub num">
          {live && <em className="cbr__live"><i aria-hidden="true" />{live.statusDetail || 'LIVE'}</em>}
          {t.pens && <span>PK {t.pens[0]}:{t.pens[1]}</span>}
          {legsLine && <span>{legsLine}</span>}
        </span>
      )}
    </div>
  );
}

/** 8강 → 4강 → 결승 — 다음 라운드에서 만나는 두 맞대결을 위아래로 붙여 선으로 잇는다 */
function Tree({ rounds, colors }: { rounds: CupRoundData[]; colors: Record<string, string> }) {
  const cols = rounds.map((r) => tiesOf(r.matches));
  for (let i = cols.length - 2; i >= 0; i--) cols[i] = treeOrder(cols[i], cols[i + 1]);
  const slots = [4, 2, 1];
  const fin = cols[cols.length - 1]?.[0];
  const champ = fin?.winnerId ? (fin.a.id === fin.winnerId ? fin.a : fin.b) : null;
  return (
    <div className="cbr__tree">
      {rounds.map((r, ci) => (
        <div key={r.label} className="cbr__col">
          <div className="cbr__colh">{r.label.toUpperCase().replace('QUARTERFINALS', 'QUARTER-FINALS').replace('SEMIFINALS', 'SEMI-FINALS')}</div>
          <div className="cbr__colb">
            {Array.from({ length: Math.max(slots[ci] ?? 1, cols[ci].length) }, (_, k) => {
              const t = cols[ci][k];
              if (!t) return <div key={k} className="cbr__m" data-empty><span>대진 미정</span></div>;
              const tc = tcOf(t, colors);
              const when = t.state === 'scheduled' ? t.legs.map((l) => kstShortDate(l.kickoffUtc)).join(' · ') : null;
              return (
                <div key={t.key} className="cbr__m" data-ours={tc ? true : undefined} style={tc ? { ['--tc' as string]: tc } : undefined}>
                  {when && <span className="cbr__when num">{when}</span>}
                  {[t.a, t.b].map((tm, j) => {
                    const won = t.winnerId === tm.id;
                    return (
                      <div key={tm.id} className="cbr__mt" data-win={won || undefined} data-lost={(!!t.winnerId && !won) || undefined}>
                        <i className="cbr__ha" data-home={j === 0 || undefined}>{j === 0 ? 'H' : 'A'}</i>
                        <Crest team={tm} size={20} />
                        <b>{tm.shortName}</b>
                        {t.state !== 'scheduled' && <i className="num">{t.agg[j]}</i>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {ci === rounds.length - 1 && (
              <div className="cbr__champ">
                {champ
                  ? <span className="cbr__cup"><span aria-hidden="true">🏆</span>CHAMPIONS<Crest team={champ} size={18} /><b>{champ.shortName}</b></span>
                  : <span className="cbr__cup" data-wait>🏆 CHAMPIONS</span>}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
