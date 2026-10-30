import type { CupRound } from '../lib/api';
import type { Match } from '../lib/types';
import { Crest } from './Crest';
import { kstParts, kstTime } from '../lib/kst';
import { roundKo } from '../lib/rounds';
import { fateOf, gameResult, tieOutcome } from '../lib/cupFate';

/**
 * 컵 대진표 — **실제로 나온 라운드부터** 결승까지.
 *
 * 컵은 순위표가 없어서 표를 만들 수가 없다(승점으로 줄 세워 봐야 의미가
 * 없다). 대신 "몇 라운드부터 나와서 어디까지 갔는지" 가 전부다.
 *
 * 라운드 목록은 지어내지 않는다 — ESPN 스코어보드가 대회마다 calendar 로
 * 준다(eng.league_cup 실측: Preliminary → First → Second → Third → Fourth →
 * Quarterfinals → Semifinals → Final). 각 라운드는 시작·종료 시각을 갖고
 * 있어서, 우리 경기 날짜를 그 구간에 떨어뜨리면 몇 라운드인지 알 수 있다.
 * 그래서 **우리가 처음 등장한 라운드** 앞쪽은 아예 그리지 않는다.
 */
/* 라운드 끝 배지 아이콘 — 진출 화살표 · 탈락 X · 우승 트로피 · 준우승/순위 메달 */
const ICO = (d: string) => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const TROPHY = <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3V3Zm-1 4v1a2 2 0 0 0 2 2V7H6Zm10 0v3a2 2 0 0 0 2-2V7h-2Z" /></svg>;
const FATE_ICON = {
  through: ICO('M5 12h12M12 6l6 6-6 6'),
  out: ICO('M6 6l12 12M18 6 6 18'),
  champ: TROPHY,
  runner: ICO('M12 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM9 14l-2 7 5-2 5 2-2-7'),
  third: ICO('M12 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM9 14l-2 7 5-2 5 2-2-7'),
  fourth: ICO('M6 6l12 12M18 6 6 18'),
} as const;

/* 라운드 이름 번역은 lib/rounds.ts — Summary 팀 비교와 같이 쓴다 */

interface Props {
  rounds: CupRound[];
  matches: Match[];
  focusTeamId: string;
  competitionName: string;
  /** 그 컵 전체 대진(cup-{대회}.json)의 같은 경기 — 팀 일정에 없는 승부차기 점수 · 경기장을 채운다 */
  extras?: Match[];
}

/** "Cody Gakpo" → "Gakpo" (득점자 줄은 성만) */
const PARTICLE = new Set(['mac', 'mc', 'van', 'von', 'de', 'da', 'di', 'del', 'der', 'den', 'dos', 'das', 'du', 'le', 'la', 'el', 'al', 'ten', 'ter', 'st', 'st.']);
const lastName = (n: string) => {
  const t = n.trim().split(/\s+/);
  let i = t.length - 1;
  while (i > 1 && PARTICLE.has(t[i - 1].toLowerCase())) i--;   // "Alexis Mac Allister" → "Mac Allister"
  return t.slice(i).join(' ') || n;
};

export function CupPath({ rounds, matches: raw, focusTeamId, competitionName, extras }: Props) {
  /* 팀 일정 경기에 전체 대진의 승부차기 점수 · 경기장을 덮는다(같은 경기 id) */
  const matches = raw.map((m) => {
    const x = extras?.find((e) => e.id === m.id);
    if (!x) return m;
    return {
      ...m,
      homePens: m.homePens ?? x.homePens,
      awayPens: m.awayPens ?? x.awayPens,
      winnerId: m.winnerId ?? x.winnerId,
      venue: m.venue ?? x.venue,
    };
  });
  if (!rounds.length) return null;

  // 라운드별로 우리 경기를 떨어뜨린다 (한 라운드에 1·2차전이 있을 수 있다)
  const within = (m: Match, r: CupRound) => m.kickoffUtc >= r.start && m.kickoffUtc <= r.end;
  const byRound = rounds.map((r) => ({
    round: r,
    games: matches.filter((m) => within(m, r)).sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc)),
  }));

  const firstIdx = byRound.findIndex((x) => x.games.length > 0);
  if (firstIdx === -1) {
    return (
      <p className="nogoal" style={{ padding: '14px 2px' }}>
        {competitionName} 경기 기록이 아직 없습니다.
      </p>
    );
  }
  const path = byRound.slice(firstIdx);

  /* 탈락 지점: 마지막으로 치른 라운드에서 졌으면 거기서 끝난 것이다.
     (다음 라운드 경기가 아직 안 잡힌 것과 구분하려면 결과를 봐야 한다)
     맞대결 라운드는 진출 여부(tieOutcome — 승부차기까지)로, 조별 라운드는 예전처럼 합산 결과로 */
  const lastPlayed = [...path].reverse().find((x) => x.games.some((g) => g.status === 'finished'));
  const lastOutcome = lastPlayed ? tieOutcome(lastPlayed.games, focusTeamId) : null;
  const out =
    !!lastPlayed &&
    lastPlayed.games.every((g) => g.status === 'finished') &&
    (lastOutcome ? lastOutcome === 'out' : resultOfTie(lastPlayed.games, focusTeamId) === 'L');

  return (
    <div className="cup">
      <div className="cup__head">
        <span className="eyebrow">{competitionName} 여정</span>
        <span className="cup__note num">
          {roundKo(path[0].round.label)} 부터 · 전체 {rounds.length}라운드
        </span>
      </div>

      <ol className="cup__path">
        {path.map((x, i) => {
          const res = x.games.length ? resultOfTie(x.games, focusTeamId) : null;
          const fate = tieOutcome(x.games, focusTeamId);
          const reached = x.games.length > 0;
          const blocked = out && i > path.findIndex((y) => y === lastPlayed);
          return (
            <li
              className="cup__r"
              key={x.round.label}
              data-res={(fate ? (fate === 'adv' ? 'W' : 'L') : res) ?? undefined}
              data-on={reached}
              data-blocked={blocked || undefined}
            >
              {/* 머리 — 라운드 이름 … 오른쪽에 결과(W/D/L) + 진출 배지를 한 묶음으로 */}
              <div className="cup__rh">
                <span className="cup__rl">{roundKo(x.round.label)}</span>
                <span className="cup__badges">
                  {x.games.length > 0 && x.games.every((g) => g.status === 'finished') && (() => {
                    /* 칩은 경기 스코어로(승부차기 승은 D — 진출은 옆 배지가 말한다) */
                    const wdl = scoreOnly(x.games, focusTeamId);
                    return <i className="fchip cup__wdl" data-r={wdl}>{wdl}</i>;
                  })()}
                  {fate && (() => {
                    const f = fateOf(x.round.label, fate);
                    return <em className="cup__fate" data-fate={f.kind}>{FATE_ICON[f.kind]}<span>{f.label}</span></em>;
                  })()}
                </span>
              </div>

              {x.games.length === 0 ? (
                <span className="cup__tbd">{blocked ? 'OUT' : '대진 미정'}</span>
              ) : (
                <div className="cup__games">
                  {x.games.map((m) => {
                    const home = m.home.id === focusTeamId;
                    const done = m.status === 'finished';
                    const r = done ? gameResult(m, focusTeamId) : null;
                    const kp = kstParts(m.kickoffUtc);
                    /* 이긴 쪽 · 진 쪽 — 진 쪽 팀 이름 · 스코어를 흐리게 */
                    const lostSide = !r ? null : r.wdl === 'D' ? (r.pk ? (r.pk === 'W' ? (home ? 'away' : 'home') : (home ? 'home' : 'away')) : null)
                      : r.wdl === 'W' ? (home ? 'away' : 'home') : (home ? 'home' : 'away');
                    const side = (k: 'home' | 'away') => {
                      const t = m[k];
                      const ours = t.id === focusTeamId;
                      return (
                        <span className={`cup__team cup__team--${k}`} data-ours={ours || undefined} data-lost={lostSide === k || undefined}>
                          <Crest team={t} size={28} />
                          <b><span className="m-full">{t.shortName}</span><span className="m-short">{t.abbr}</span></b>
                        </span>
                      );
                    };
                    /* 득점자 — 그 팀 골만, 분 순 (자책골은 상대 쪽 줄에 OG) */
                    const goalsOf = (k: 'home' | 'away') => [...m.goals]
                      .filter((g) => (g.ownGoal ? g.teamId !== m[k].id : g.teamId === m[k].id))
                      .sort((a, b) => a.minute - b.minute);
                    const scorers = (k: 'home' | 'away') => (
                      <span className={`cup__scr cup__scr--${k}`}>
                        {goalsOf(k).map((g, gi) => (
                          <span key={gi}>{lastName(g.scorer)} <i className="num">{g.clock}</i>{g.penalty && <em>P</em>}{g.ownGoal && <em>OG</em>}</span>
                        ))}
                      </span>
                    );
                    return (
                      <div className="cup__g" key={m.id}>
                        {/* 한 줄: HOME/AWAY 배지 · 날짜(요일) · 경기장 */}
                        <span className="cup__when">
                          <i className="cup__ha" data-home={home || undefined}>{home ? 'HOME' : 'AWAY'}</i>
                          <span className="num">{kp.month}.{kp.date} ({kp.weekdayKo})</span>
                          {m.venue && <span className="cup__venue">{m.venue}</span>}
                        </span>
                        {/* 전광판 — 홈 [스코어 또는 킥오프] 원정 */}
                        <div className="cup__sb">
                          {side('home')}
                          <span className="cup__mid">
                            {done ? (
                              <b className="cup__score num">
                                <span data-lost={lostSide === 'home' || undefined}>{m.homeScore}</span>
                                <i>:</i>
                                <span data-lost={lostSide === 'away' || undefined}>{m.awayScore}</span>
                              </b>
                            ) : m.timeTBD ? (
                              <b className="cup__ko cup__ko--tbd">시간 미정</b>
                            ) : (
                              <b className="cup__ko num">{kstTime(m.kickoffUtc)}</b>
                            )}
                            {r?.pk && (
                              <em className="cup__pk num" data-won={r.pk === 'W' || undefined}>
                                {r.pkScore ? `PK ${r.pkScore}` : r.pk === 'W' ? 'PK 승' : 'PK 패'}
                              </em>
                            )}
                          </span>
                          {side('away')}
                        </div>
                        {done && m.goals.length > 0 && (
                          <div className="cup__goals">
                            {scorers('home')}
                            <span className="cup__ball" aria-hidden="true">⚽</span>
                            {scorers('away')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** 한 라운드의 W/D/L — 합산 스코어만(승부차기 제외) */
function scoreOnly(games: Match[], teamId: string): 'W' | 'D' | 'L' {
  let o = 0, t = 0;
  for (const m of games) {
    const home = m.home.id === teamId;
    o += (home ? m.homeScore : m.awayScore) ?? 0;
    t += (home ? m.awayScore : m.homeScore) ?? 0;
  }
  return o > t ? 'W' : o < t ? 'L' : 'D';
}

/** 한 라운드(1·2차전 포함)의 결과 — 합산 스코어로 본다 */
function resultOfTie(games: Match[], teamId: string): 'W' | 'D' | 'L' | null {
  let ours = 0;
  let theirs = 0;
  let any = false;
  for (const m of games) {
    if (m.status !== 'finished') continue;
    any = true;
    const home = m.home.id === teamId;
    ours += (home ? m.homeScore : m.awayScore) ?? 0;
    theirs += (home ? m.awayScore : m.homeScore) ?? 0;
    // 승부차기가 있으면 그게 결론이다
    const ph = m.homePens;
    const pa = m.awayPens;
    if (ph !== undefined && pa !== undefined && (ph > 0 || pa > 0)) {
      ours += home ? (ph > pa ? 0.5 : 0) : (pa > ph ? 0.5 : 0);
      theirs += home ? (pa > ph ? 0.5 : 0) : (ph > pa ? 0.5 : 0);
    }
  }
  if (!any) return null;
  return ours > theirs ? 'W' : ours < theirs ? 'L' : 'D';
}
