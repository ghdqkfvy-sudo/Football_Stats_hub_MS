import type { Match, TeamRef } from '../lib/types';
import type { H2HGame, LastFiveGame } from '../lib/api';
import { Crest } from './Crest';

/**
 * 다음 경기 미리보기 — "요즘 어떤가" 와 "만나면 어땠나" 두 가지만 본다.
 *
 * 최근 5경기는 ESPN 경기 요약이 `lastFiveGames` 로 **양 팀 것을 한 번에**
 * 준다(아직 안 치른 경기의 요약에도 들어 있다). 상대전적은 우리 팀의
 * 이번 시즌·지난 시즌 일정에서 그 상대와의 경기만 추린 것이다.
 * 둘 다 스냅샷이 미리 구워 둔다(scripts/snapshot.mjs 의 nextMatchPreview).
 *
 * 배치는 위의 다음 경기 카드와 **좌우를 맞춘다** — 왼쪽이 홈, 오른쪽이 원정.
 * 같은 팀이 화면 위아래에서 다른 자리에 있으면 눈이 한 번 더 일한다.
 */
interface Props {
  match: Match;
  focusTeamId: string;
  lastFive: Record<string, LastFiveGame[]>;
  h2h: H2HGame[];
  /** 'all' 이면 "역대 n경기", 아니면 "최근 두 시즌 n경기" */
  h2hScope?: 'all' | 'recent';
}

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

export function MatchPreview({ match, focusTeamId, lastFive, h2h, h2hScope }: Props) {
  const ourFive = lastFive[focusTeamId] ?? [];
  const oppId = match.home.id === focusTeamId ? match.away.id : match.home.id;
  const theirFive = lastFive[oppId] ?? [];
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
      {/* 위 카드와 같은 순서 — 홈 / 원정 */}
      <div className="mprev__forms">
        <FormColumn
          team={match.home}
          games={lastFive[match.home.id] ?? []}
          side="HOME"
          mine={match.home.id === focusTeamId}
        />
        <FormColumn
          team={match.away}
          games={lastFive[match.away.id] ?? []}
          side="AWAY"
          mine={match.away.id === focusTeamId}
        />
      </div>

      {meetings.length > 0 && (
        <div className="mprev__h2h">
          <div className="mprev__h2hh">
            <span className="eyebrow">상대전적</span>
            <span className="mprev__note num">
              {h2hScope === 'all' ? '역대' : '최근 두 시즌'} {meetings.length}경기
            </span>
          </div>

          {/* 승·무·패 비율을 막대 하나로 — 숫자보다 먼저 눈에 들어온다 */}
          <div className="mprev__bar" aria-hidden="true">
            {(['W', 'D', 'L'] as const).map((k) => {
              const n = k === 'W' ? rec.w : k === 'D' ? rec.d : rec.l;
              return n > 0 ? <i key={k} data-r={k} style={{ flexGrow: n }} /> : null;
            })}
          </div>
          <div className="mprev__rec num">
            <b data-r="W">{rec.w}<span>W</span></b>
            <b data-r="D">{rec.d}<span>D</span></b>
            <b data-r="L">{rec.l}<span>L</span></b>
          </div>

          <div className="mprev__list">
            {meetings.slice(0, 3).map((g) => (
              <div className="mprev__m" key={g.id}>
                <i className="fchip" data-r={g.result}>{g.result}</i>
                <span className="mprev__md num">{ymd(g.date)}</span>
                <span className="mprev__mw" data-side={g.home ? 'H' : 'A'}>
                  {g.home ? 'Home' : 'Away'}
                </span>
                <Score a={g.ours} b={g.theirs} res={g.result} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 2026.03.13 — 두 시즌을 합쳐 보여 주므로 연도가 없으면 헷갈린다 */
function ymd(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  return `${kst.getUTCFullYear()}.${mm}.${dd}`;
}

/** 스코어 한 칸 — 결과 색을 띤 캡슐. 숫자만 나열하면 승패가 안 읽힌다. */
function Score({ a, b, res }: { a?: number; b?: number; res?: 'W' | 'D' | 'L' }) {
  return (
    <span className="scorepill num" data-r={res}>
      <b>{a ?? '-'}</b>
      <i>:</i>
      <b>{b ?? '-'}</b>
    </span>
  );
}

function FormColumn({
  team, games, side, mine,
}: {
  team: TeamRef;
  games: LastFiveGame[];
  side: 'HOME' | 'AWAY';
  /** 우리 팀 칸은 배경을 팀 컬러로 살짝 깐다 (글자 배지는 쓰지 않는다) */
  mine: boolean;
}) {
  const rec = recordOf(games);
  return (
    <div className="mprev__col" data-mine={mine}>
      <div className="mprev__team">
        <span className="mprev__side" data-side={side}>{side}</span>
        <Crest team={team} size={22} />
        <b>{team.shortName}</b>
      </div>

      <div className="mprev__sum">
        <span className="mprev__chips">
          {games.length === 0
            ? <i className="mprev__noform">기록 없음</i>
            : games.map((g, i) => (
                <i className="fchip" key={i} data-r={g.result || '-'}>{g.result || '-'}</i>
              ))}
        </span>
        <span className="mprev__rec2 num">
          {rec.w}W {rec.d}D {rec.l}L
        </span>
      </div>

      {games.length > 0 && (
        <div className="mprev__games">
          {games.map((g, i) => {
            const [ms, ts] = String(g.score ?? '').split('-');
            const res = (g.result || undefined) as 'W' | 'D' | 'L' | undefined;
            return (
              <div className="mprev__g" key={`${g.date}-${i}`} title={g.competition}>
                {/* 상대 표기는 항상 "vs" 로 통일하고, 홈/원정은 따로 배지로 —
                    vs 와 @ 를 섞으면 어느 쪽이 홈인지 매번 다시 읽어야 한다. */}
                <span className="mprev__gh" data-side={g.atVs === 'vs' ? 'H' : 'A'}>
                  {g.atVs === 'vs' ? 'H' : 'A'}
                </span>
                <span className="mprev__go">
                  vs
                  <Crest
                    team={{
                      id: g.opponentId,
                      name: g.opponentName || g.opponent,
                      shortName: g.opponentName || g.opponent,
                      abbr: g.opponent,
                      logo: g.opponentLogo || '',
                    }}
                    size={17}
                  />
                  <b>{g.opponentName || g.opponent}</b>
                </span>
                <Score a={num(ms)} b={num(ts)} res={res} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const num = (v?: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
