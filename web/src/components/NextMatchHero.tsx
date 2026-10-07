import { useEffect, useState } from 'react';
import type { Match } from '../lib/types';
import { countdown, kstFullDate, kstTime } from '../lib/kst';
import { Crest } from './Crest';
import { CompCrest } from './CompCrest';
import { usePalette } from '../lib/palette';
import type { FifaOf } from '../lib/fifa';
import { resolveAssists } from '../lib/assists';

/** 히어로에 붙는 팀 성적 요약 — 리그 순위와 승/무/패 */
export interface TeamStanding {
  rank?: number;
  win: number;
  draw: number;
  loss: number;
}

interface Props {
  match: Match;
  /** 우리가 보고 있는 팀 (이름을 팀 컬러로 강조한다) */
  focusTeamId: string;
  /** 팀순위 데이터에서 주입 — 없으면 해당 줄을 비운다 */
  standingOf?: (teamId: string) => TeamStanding | undefined;
  /** 국가대표 경기일 때만 — 팀명 아래 "FIFA 32위" */
  fifaOf?: FifaOf;
  /** 끝난 경기의 득점 상세를 아직 받는 중 */
  goalsLoading?: boolean;
  /** 바로 다음 경기가 아닌 미래 경기(목록에서 골랐을 때) — 꼬리표를 "예정 경기" 로 */
  notNext?: boolean;
}

const PIN = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.6" />
  </svg>
);

const BOLT = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
  </svg>
);

const ALARM = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9.5V13l2.4 1.6M5 3.4L2.6 5.6M19 3.4l2.4 2.2" />
  </svg>
);

/**
 * "3위 · 3W 0D 1L" — 레퍼런스와 같은 한 줄 요약.
 *
 * ⚠️ 모듈 바깥에 있어야 한다. 예전에는 NextMatchHero 안에서 만들었는데,
 * 렌더마다 새 컴포넌트 타입이 되어 React 가 매번 통째로 다시 마운트했다
 * (이 화면은 1초마다 카운트다운으로 리렌더된다 — 매초 두 번씩 버린 셈이다).
 */
function TeamTile({
  t, focus, standing, fifa,
}: {
  t: Match['home'];
  focus: boolean;
  standing?: TeamStanding;
  fifa?: number;
}) {
  return (
    <div className="fxt" data-focus={focus}>
      <span className="fxt__tile">
        <Crest team={t} size={58} />
      </span>
      <div className="fxt__name">{t.name}</div>
      {standing && (
        <div className="fxt__rec num">
          {standing.rank !== undefined && <b>{standing.rank}위</b>}
          {standing.rank !== undefined && ' · '}
          {standing.win}W {standing.draw}D {standing.loss}L
        </div>
      )}
      {!standing && fifa !== undefined && (
        <div className="fxt__rec num" title="FIFA 남자 랭킹">
          FIFA <b>{fifa}위</b>
        </div>
      )}
    </div>
  );
}

/**
 * 끝난(또는 진행 중) 경기의 득점자·도움 — 각 팀 엠블럼 **바로 아래**에 그 팀 골을
 * 시간순으로 쌓는다. 중계 화면의 스코어보드와 같은 배치라, 어느 쪽 골인지
 * 팀 약칭을 읽지 않아도 자리로 안다. 자책골은 득점이 인정된 팀 쪽에 OG 로.
 */
function HeroGoals({ match, loading }: { match: Match; loading?: boolean }) {
  if (loading && !match.goals.length) {
    return (
      <div className="hgoals" aria-busy="true">
        <div className="hgoals__side" data-side="home"><i className="skel" style={{ height: 13, width: 120 }} /></div>
        <span className="hgoals__mid" aria-hidden="true" />
        <div className="hgoals__side" data-side="away"><i className="skel" style={{ height: 13, width: 120 }} /></div>
      </div>
    );
  }
  if (!match.goals.length) {
    if (!match.goalsLoaded) return null;
    return (
      <p className="hgoals__none">
        {match.homeScore === 0 && match.awayScore === 0
          ? '양 팀 모두 득점이 없었습니다.'
          : '이 경기의 득점 상세 기록이 제공되지 않습니다.'}
      </p>
    );
  }

  const { inferred, leftover } = resolveAssists(match.goals, match.playerStats);
  const rows = match.goals.map((g, i) => ({ g, assist: g.assist ?? inferred.get(i)?.name, guess: !g.assist }));
  /*
   * 한 골 = [시간] [득점자 / 그 아래 도움] 두 칸.
   * 시간은 고정폭 칸에 넣어 가운데 축 쪽에 **세로 한 줄로** 맞춘다 — 예전에는 시간이
   * 이름 길이에 따라 들쭉날쭉 붙어 있어서, 눈이 골마다 시간을 다시 찾아야 했다.
   * 도움은 득점자 이름과 **같은 가장자리**에 맞춰 바로 아랫줄에 둔다.
   * 홈은 거울처럼 뒤집는다(이름 ← 시간 | 축 | 시간 → 이름).
   */
  const side = (teamId: string, key: 'home' | 'away') => (
    <ul className="hgoals__side" data-side={key}>
      {rows.filter((r) => r.g.teamId === teamId).map((r, i) => (
        <li className="hg" key={i}>
          <span className="hg__t num">{r.g.clock}</span>
          <span className="hg__body">
            <span className="hg__s">
              <b>{r.g.scorer}</b>
              {r.g.penalty && <em className="hgoals__tag">PK</em>}
              {r.g.ownGoal && <em className="hgoals__tag" data-og>OG</em>}
            </span>
            {r.assist && (
              <span className="hg__a" data-guess={r.guess || undefined}
                title={r.guess ? '출전 시간으로 좁힌 추정 도움' : undefined}>
                <i>A</i><span>{r.assist}</span>
              </span>
            )}
          </span>
        </li>
      ))}
      {leftover.filter((x) => x.teamId === teamId).map((x, i) => (
        /* 어느 골인지까지는 확인되지 않은 도움 — 시간 칸은 비워 둔다 */
        <li className="hg hg--left" key={`l${i}`}>
          <span className="hg__t" />
          <span className="hg__body">
            <span className="hg__a" title="어느 골인지까지는 확인되지 않은 도움">
              <i>A</i><span>{x.name}{x.a > 1 ? ` ×${x.a}` : ''}</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="hgoals">
      {side(match.home.id, 'home')}
      <span className="hgoals__mid" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" /><path d="M12 7.5l4.2 3-1.6 5h-5.2l-1.6-5z" />
        </svg>
      </span>
      {side(match.away.id, 'away')}
    </div>
  );
}

export function NextMatchHero({ match, focusTeamId, standingOf, fifaOf, goalsLoading, notNext }: Props) {
  const palette = usePalette();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const done = match.status === 'finished';
  const live = match.status === 'live';
  const cd = done ? null : countdown(match.kickoffUtc, now);
  const tagText = done ? '경기 결과' : live ? '진행 중' : notNext ? '예정 경기' : '다음 경기';

  return (
    <section className="hero" aria-label={tagText}>
      <div className="hero__top">
        <span className="hero__tag" data-live={live}>
          {BOLT}
          {tagText}
        </span>
        <span className="hero__comp">
          <CompCrest k={match.competition} size={17} />
          {palette.name(match.competition)}
          {match.round && <em>{match.round}</em>}
        </span>
        <span className="hero__spacer" />
        {match.venue && (
          <span className="hero__venue">
            {PIN}
            {match.venue}
          </span>
        )}
      </div>

      <div className="hero__fx">
        <TeamTile t={match.home} focus={match.home.id === focusTeamId} standing={standingOf?.(match.home.id)} fifa={fifaOf?.(match.home)} />
        <div className="fxvs">
          {done || live ? (
            <span className="num">
              {match.homeScore ?? 0}
              <i>-</i>
              {match.awayScore ?? 0}
            </span>
          ) : (
            'VS'
          )}
        </div>
        <TeamTile t={match.away} focus={match.away.id === focusTeamId} standing={standingOf?.(match.away.id)} fifa={fifaOf?.(match.away)} />
      </div>

      {(done || live) && <HeroGoals match={match} loading={goalsLoading} />}

      <div className="hero__when">
        <div className="when__date">{kstFullDate(match.kickoffUtc)}</div>
        {!done && (
          <div className="when__time">
            <span className="when__ico">{ALARM}</span>
            <b className="num">{match.timeTBD ? 'TBD' : kstTime(match.kickoffUtc)}</b>
            {!match.timeTBD && <em>KST</em>}
          </div>
        )}
      </div>

      {cd && (
        <div className="hero__cd" role="timer" aria-label="킥오프까지 남은 시간">
          {([['일', cd.days], ['시', cd.hours], ['분', cd.minutes], ['초', cd.seconds]] as const).map(
            ([label, v], i) => (
              <div className="cdu" key={label}>
                {i > 0 && <span className="cdu__sep" aria-hidden="true">:</span>}
                <b className="num">{i === 0 ? v : String(v).padStart(2, '0')}</b>
                <i>{label}</i>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}
