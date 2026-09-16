import type { Match } from '../lib/types';
import type { H2HGame, LastFiveGame } from '../lib/api';
import { Crest } from './Crest';
import { kstShortDate } from '../lib/kst';

/**
 * 다음 경기 미리보기 — "요즘 어떤가" 와 "만나면 어땠나" 두 가지만 본다.
 *
 * 최근 5경기는 ESPN 경기 요약이 `lastFiveGames` 로 **양 팀 것을 한 번에**
 * 준다(아직 안 치른 경기의 요약에도 들어 있다). 상대전적은 우리 팀의
 * 이번 시즌·지난 시즌 일정에서 그 상대와의 경기만 추린 것이다.
 * 둘 다 스냅샷이 미리 구워 둔다(scripts/snapshot.mjs 의 nextMatchPreview).
 */
interface Props {
  match: Match;
  focusTeamId: string;
  lastFive: Record<string, LastFiveGame[]>;
  h2h: H2HGame[];
}

/** 우리 기준 승/무/패 */
function recordOf(games: { result?: string }[]) {
  let w = 0;
  let d = 0;
  let l = 0;
  for (const g of games) {
    if (g.result === 'W') w++;
    else if (g.result === 'L') l++;
    else d++;
  }
  return { w, d, l };
}

export function MatchPreview({ match, focusTeamId, lastFive, h2h }: Props) {
  const us = match.home.id === focusTeamId ? match.home : match.away;
  const them = match.home.id === focusTeamId ? match.away : match.home;

  const ourFive = lastFive[us.id] ?? [];
  const theirFive = lastFive[them.id] ?? [];
  if (!ourFive.length && !theirFive.length && !h2h.length) return null;

  /* 상대전적은 **우리 기준** 으로 다시 읽는다 — 저장된 값은 홈/원정 스코어라
     어느 쪽이 이겼는지가 팀 id 를 봐야 나온다. */
  const meetings = h2h.map((g) => {
    const home = g.homeId === focusTeamId;
    const ours = home ? g.homeScore : g.awayScore;
    const theirs = home ? g.awayScore : g.homeScore;
    const result: 'W' | 'D' | 'L' =
      (ours ?? 0) > (theirs ?? 0) ? 'W' : (ours ?? 0) < (theirs ?? 0) ? 'L' : 'D';
    return { ...g, home, ours, theirs, result };
  });
  const rec = recordOf(meetings);

  return (
    <div className="mprev">
      <div className="mprev__forms">
        <FormColumn team={us} games={ourFive} mine />
        <FormColumn team={them} games={theirFive} />
      </div>

      {meetings.length > 0 && (
        <div className="mprev__h2h">
          <div className="mprev__h2hh">
            <span className="eyebrow">상대전적</span>
            <span className="mprev__note num">최근 두 시즌 {meetings.length}경기</span>
          </div>

          {/* 승·무·패 비율을 막대 하나로 — 숫자보다 먼저 눈에 들어온다 */}
          <div className="mprev__bar" aria-hidden="true">
            {(['W', 'D', 'L'] as const).map((k) => {
              const n = k === 'W' ? rec.w : k === 'D' ? rec.d : rec.l;
              return n > 0 ? (
                <i key={k} data-r={k} style={{ flexGrow: n }}>
                  {n}
                </i>
              ) : null;
            })}
          </div>
          <div className="mprev__rec num">
            <b data-r="W">{rec.w}승</b>
            <b data-r="D">{rec.d}무</b>
            <b data-r="L">{rec.l}패</b>
          </div>

          <div className="mprev__list">
            {meetings.slice(0, 5).map((g) => (
              <div className="mprev__m" key={g.id}>
                <i className="fchip" data-r={g.result}>{g.result}</i>
                <span className="mprev__md num">{kstShortDate(g.date)}</span>
                <span className="mprev__mw">{g.home ? '홈' : '원정'}</span>
                <span className="mprev__ms num">
                  {g.ours ?? '-'} : {g.theirs ?? '-'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FormColumn({
  team, games, mine = false,
}: {
  team: { id: string; name: string; shortName: string; abbr: string; logo: string };
  games: LastFiveGame[];
  mine?: boolean;
}) {
  const rec = recordOf(games);
  return (
    <div className="mprev__col" data-mine={mine}>
      <div className="mprev__team">
        <Crest team={team} size={20} />
        <b>{team.shortName}</b>
        <span className="num">
          {rec.w}승 {rec.d}무 {rec.l}패
        </span>
      </div>

      {games.length === 0 ? (
        <p className="nogoal">최근 경기 기록 없음</p>
      ) : (
        <div className="mprev__games">
          {games.map((g, i) => (
            <div className="mprev__g" key={`${g.date}-${i}`} title={g.competition}>
              <i className="fchip" data-r={g.result || '-'}>{g.result || '-'}</i>
              <span className="mprev__go">
                {g.atVs === 'vs' ? 'vs' : '@'} {g.opponent}
              </span>
              <span className="mprev__gs num">{g.score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
