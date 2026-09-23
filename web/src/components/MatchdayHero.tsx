import { useEffect, useState } from 'react';
import type { Match } from '../lib/types';
import { comp, type Target } from '../config/targets';
import { countdown, kstFullDate, kstShortDate, kstTime } from '../lib/kst';
import type { TeamStanding } from './NextMatchHero';
import { Crest } from './Crest';
import { CompCrest } from './CompCrest';

/**
 * Summary 의 매치데이 카드.
 *
 * 팀 탭의 히어로(`.hero`)와 **같은 디자인 언어**를 쓴다 — 둥근 26px 카드,
 * 팀 컬러 글로우, 80px 엠블럼 타일, 큰 킥오프 시각, 카운트다운 스트립.
 * 다른 점은 하나뿐이다: 여기서는 "어느 팀 경기인가" 가 먼저 읽혀야 하므로
 * 카드마다 그 팀 컬러를 입힌다.
 *
 * ⚠️ 색은 `theme.brand` 가 아니라 `theme.accent` 다. brand 가 거의 검정인
 * 팀(뉴캐슬 #241F20)·짙은 남색인 팀(토트넘 #132257)은 어두운 배경에서
 * 테두리도 글자도 사라진다.
 */

const PIN = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);

interface Props {
  target: Target;
  match: Match;
  /** 우리 팀 기준 순위·승무패 (없으면 줄을 그리지 않는다) */
  standingOf?: (teamId: string) => TeamStanding | undefined;
  hero?: boolean;
  onSelect?: () => void;
}

function Countdown({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const c = countdown(iso, now);
  if (c.past) return <div className="mdh__cd"><span className="mdh__soon">곧 시작</span></div>;
  const two = (n: number) => String(n).padStart(2, '0');
  const units: [number | string, string][] = [
    [c.days, 'DAYS'], [two(c.hours), 'HOURS'], [two(c.minutes), 'MINS'], [two(c.seconds), 'SECS'],
  ];
  return (
    <div className="mdh__cd">
      {units.map(([v, l], i) => (
        <div className="mdh__cdu" key={l}>
          {i > 0 && <span className="mdh__cdsep" aria-hidden="true">:</span>}
          <b>{v}</b>
          <i>{l}</i>
        </div>
      ))}
    </div>
  );
}

/** 한 팀 — 엠블럼 타일 + 이름 + 순위·승무패 */
function Side({
  team, focus, standing, big,
}: {
  team: Match['home'];
  focus: boolean;
  standing?: TeamStanding;
  big: boolean;
}) {
  return (
    <div className="mdt" data-focus={focus || undefined} data-big={big || undefined}>
      <span className="mdt__tile">
        <Crest team={team} size={big ? 52 : 30} />
      </span>
      <span className="mdt__name">{big ? team.shortName : team.abbr}</span>
      {standing && (
        <span className="mdt__rec num">
          {standing.rank !== undefined && <b>{standing.rank}위</b>}
          {standing.rank !== undefined && ' · '}
          {standing.win}W {standing.draw}D {standing.loss}L
        </span>
      )}
    </div>
  );
}

export function MatchdayCard({ target, match, standingOf, hero = false, onSelect }: Props) {
  const c = comp(match.competition);
  const home = match.home.id === target.espnTeamId;
  const live = match.status === 'live';
  const Tag = onSelect ? 'button' : 'div';

  return (
    <Tag
      className="mdh__card"
      data-hero={hero || undefined}
      style={{ ['--team' as string]: target.theme.accent }}
      onClick={onSelect}
      {...(onSelect ? { type: 'button' as const, 'aria-label': `${target.nameEn} 경기를 크게 보기` } : {})}
    >
      <header className="mdh__top">
        <span className="mdh__badge">
          <Crest
            team={{
              id: target.espnTeamId, name: target.name, shortName: target.name,
              abbr: target.abbr, logo: target.crest,
            }}
            size={hero ? 22 : 18}
          />
          {target.name}
        </span>
        <span className="mdh__comp">
          <CompCrest k={match.competition} size={hero ? 16 : 13} />
          {c.name}
        </span>
        {live && <em className="mdh__live">LIVE</em>}
        <span className="mdh__ha" data-home={home || undefined}>{home ? 'HOME' : 'AWAY'}</span>
      </header>

      <div className="mdh__fx">
        <Side team={match.home} focus={home} standing={standingOf?.(match.home.id)} big={hero} />
        <div className="mdh__vs">
          {match.status === 'finished'
            ? <span className="num">{match.homeScore}<i>-</i>{match.awayScore}</span>
            : <span className="num">VS</span>}
        </div>
        <Side team={match.away} focus={!home} standing={standingOf?.(match.away.id)} big={hero} />
      </div>

      {hero ? (
        <>
          <div className="mdh__when">
            <div className="mdh__date">{kstFullDate(match.kickoffUtc)}</div>
            <div className="mdh__time">
              <b>{match.timeTBD ? 'TBD' : kstTime(match.kickoffUtc)}</b>
              <em>KST</em>
            </div>
            {match.venue && <div className="mdh__venue">{PIN}{match.venue}</div>}
          </div>
          {!live && <Countdown iso={match.kickoffUtc} />}
        </>
      ) : (
        <footer className="mdh__foot">
          {match.venue && <span className="mdh__venue">{PIN}{match.venue}</span>}
          <span className="mdh__when2 num">
            {kstShortDate(match.kickoffUtc)} {match.timeTBD ? 'TBD' : kstTime(match.kickoffUtc)}
          </span>
        </footer>
      )}
    </Tag>
  );
}
