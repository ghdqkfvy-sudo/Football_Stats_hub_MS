import type { CupRound } from '../lib/api';
import type { Match } from '../lib/types';
import { Crest } from './Crest';
import { kstShortDate } from '../lib/kst';

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
const ROUND_KO: Record<string, string> = {
  'preliminary round': '예선',
  'first round': '1라운드',
  'second round': '2라운드',
  'third round': '3라운드',
  'fourth round': '4라운드',
  'fifth round': '5라운드',
  'sixth round': '6라운드',
  'round of 32': '32강',
  'round of 16': '16강',
  'quarterfinals': '8강',
  'quarter-finals': '8강',
  'semifinals': '4강',
  'semi-finals': '4강',
  'final': '결승',
  'third place': '3위 결정전',
};
const roundKo = (label: string) => ROUND_KO[label.toLowerCase()] ?? label;

interface Props {
  rounds: CupRound[];
  matches: Match[];
  focusTeamId: string;
  competitionName: string;
}

export function CupPath({ rounds, matches, focusTeamId, competitionName }: Props) {
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
     (다음 라운드 경기가 아직 안 잡힌 것과 구분하려면 결과를 봐야 한다) */
  const lastPlayed = [...path].reverse().find((x) => x.games.some((g) => g.status === 'finished'));
  const out =
    lastPlayed &&
    lastPlayed.games.every((g) => g.status === 'finished') &&
    resultOfTie(lastPlayed.games, focusTeamId) === 'L';

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
          const reached = x.games.length > 0;
          const blocked = out && i > path.findIndex((y) => y === lastPlayed);
          return (
            <li
              className="cup__r"
              key={x.round.label}
              data-res={res ?? undefined}
              data-on={reached}
              data-blocked={blocked || undefined}
            >
              <span className="cup__rl">{roundKo(x.round.label)}</span>

              {x.games.length === 0 ? (
                <span className="cup__tbd">{blocked ? '탈락' : '미정'}</span>
              ) : (
                x.games.map((m) => {
                  const home = m.home.id === focusTeamId;
                  const opp = home ? m.away : m.home;
                  const done = m.status === 'finished';
                  return (
                    <span className="cup__tie" key={m.id}>
                      <Crest team={opp} size={18} />
                      <b>{opp.shortName}</b>
                      <em className="num">{home ? '홈' : '원정'}</em>
                      <span className="cup__sc num">
                        {done ? `${home ? m.homeScore : m.awayScore} : ${home ? m.awayScore : m.homeScore}` : kstShortDate(m.kickoffUtc)}
                      </span>
                    </span>
                  );
                })
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
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
