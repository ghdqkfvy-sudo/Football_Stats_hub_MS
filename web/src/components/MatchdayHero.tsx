import { useEffect, useState } from 'react';
import type { Match } from '../lib/types';
import { SUMMARY_OPP, comp, summaryColor, type Target } from '../config/targets';
import { countdown, dayKey, kstFullDate, kstParts, kstShortDate, kstTime, todayKey } from '../lib/kst';
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

/* 팀 탭 히어로(.when__ico)와 같은 알람 아이콘 — 킥오프 시각의 무게를 맞춘다 */
const ALARM = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9.5V13l2.4 1.6M5 3.4L2.6 5.6M19 3.4l2.4 2.2" />
  </svg>
);

const PIN = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);

/**
 * KST **달력 날짜** 기준 남은 일수.
 * 시간 차이로 계산하면 "오늘 밤 23시" 와 "내일 새벽 1시" 가 둘 다 0일이 되어
 * 어느 쪽이 오늘인지 알 수 없다. 자정 경계로 세는 편이 사람이 읽는 방식이다.
 */
function daysUntilKst(iso: string, now: number = Date.now()): number {
  const a = Date.parse(`${dayKey(iso)}T00:00:00Z`);
  const b = Date.parse(`${todayKey(now)}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

function dday(iso: string, now: number = Date.now()): { text: string; tone: 'now' | 'soon' | 'far' | 'past' } {
  const d = daysUntilKst(iso, now);
  if (d === 0) return { text: '오늘', tone: 'now' };
  if (d === 1) return { text: '내일', tone: 'soon' };
  if (d > 1) return { text: `D-${d}`, tone: d <= 3 ? 'soon' : 'far' };
  return { text: `${-d}일 전`, tone: 'past' };
}

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
  const done = match.status === 'finished';
  const dd = dday(match.kickoffUtc);
  const Tag = onSelect ? 'button' : 'div';

  return (
    <Tag
      className="mdh__card"
      data-hero={hero || undefined}
      /* --opp 는 앱 전역(현재 팀) 값이라 Summary 에서는 맞지 않는다.
         카드마다 그 팀의 상대 색으로 갈아 끼운다 (뉴캐슬만 하늘색). */
      style={{
        ['--team' as string]: summaryColor(target),
        ['--opp' as string]: SUMMARY_OPP,
      }}
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
          {/* 팀 탭 캘린더의 선택된 막대처럼, 지금 크게 보고 있는 카드가
              살아 있음을 펄스로 알린다. 배지 **안**에 두는 이유는 좁은
              화면에서 머리줄이 접힐 때 점만 홀로 떨어지지 않게 하기 위해서다.
              LIVE 일 때는 LIVE 배지가 이미 깜빡이므로 내보내지 않는다. */}
          {hero && !live && !done && <span className="mdh__pulse" aria-hidden="true" />}
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
          {done
            ? (
              /* 이달의 결과와 같은 규칙 — 우리 득점은 팀 컬러, 상대는 흰색.
                 순서는 홈-원정 그대로 두고 색으로만 가른다. */
              <span className="num">
                <b className={home ? 'mdh__su' : 'mdh__so'}>{match.homeScore}</b>
                <i>-</i>
                <b className={home ? 'mdh__so' : 'mdh__su'}>{match.awayScore}</b>
              </span>
            )
            : <span className="num">VS</span>}
        </div>
        <Side team={match.away} focus={!home} standing={standingOf?.(match.away.id)} big={hero} />
      </div>

      {hero ? (
        <>
          <div className="mdh__when">
            <div className="mdh__date">{kstFullDate(match.kickoffUtc)}</div>
            <div className="mdh__time">
              {!done && <span className="mdh__ico">{ALARM}</span>}
              <b>{match.timeTBD ? 'TBD' : kstTime(match.kickoffUtc)}</b>
              {!match.timeTBD && <em>KST</em>}
            </div>
            {match.venue && <div className="mdh__venue">{PIN}{match.venue}</div>}
          </div>
          {/* 주간 캘린더에서 지난 경기를 고르면 히어로에 끝난 경기가 올라온다.
              그때 카운트다운을 그리면 "0일 00:00:00" 이나 "곧 시작" 이 뜬다 —
              대신 결과 한 줄을 놓는다. */}
          {done
            ? (
              <div className="mdh__cd" data-done="true">
                <span className="mdh__fin">
                  경기 종료
                  <b className="num">{match.homeScore}<i>-</i>{match.awayScore}</b>
                </span>
              </div>
            )
            : !live && <Countdown iso={match.kickoffUtc} />}
        </>
      ) : (
        /*
         * 작은 카드에서 제일 먼저 찾는 것은 "언제 하나" 다. 예전에는 경기장과
         * 같은 10.5px 회색 한 줄에 섞여 있어 여섯 장을 훑어도 날짜가 안 잡혔다.
         * 킥오프를 팀 컬러 스트립으로 떼어 내고 D-day 칩을 앞에 세운다.
         */
        <footer className="mdh__foot">
          <div className="mdh__kick" data-tone={dd.tone}>
            <em className="mdh__dday">{done ? '종료' : dd.text}</em>
            <b className="mdh__kdate num">{kstShortDate(match.kickoffUtc)}</b>
            <b className="mdh__ktime num">{match.timeTBD ? 'TBD' : kstTime(match.kickoffUtc)}</b>
          </div>
          {match.venue && <span className="mdh__venue">{PIN}{match.venue}</span>}
        </footer>
      )}
    </Tag>
  );
}

/**
 * 큰 카드(히어로)가 화면 밖이면 그리로 부드럽게 올라간다 — 폰에서 아래 목록이나
 * 주간 일정을 눌렀을 때 "무엇이 바뀌었는지" 보이게. 이미 보이면 움직이지 않는다
 * (괜히 화면이 튄다). 다음 그림 뒤에 재야 새 경기로 바뀐 카드 위치를 읽는다.
 */
export function revealHero() {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>('.mdh__card[data-hero]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight * 0.5) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

/**
 * 폰 전용 한 줄 카드 — Summary "다음 경기" 의 나머지 6팀.
 *
 * 작은 카드(엠블럼 타일 두 개 + 순위 줄 + 킥오프 스트립)를 폰에서 한 줄에
 * 하나씩 쌓으면 장당 200px, 여섯 장이면 화면 1.5장이었다. 폰에서 이 목록으로
 * 찾는 건 "우리 팀 누구랑 · 언제" 두 가지라 그것만 남긴다:
 *
 *   ▌[우리 엠블럼]  vs [상대] 상대팀        D-3   9/27 (토)
 *   ▌               Premier League · HOME          23:00
 *
 * 누르면 위 큰 카드가 이 경기로 바뀌고, 큰 카드가 화면 밖이면 그리로 올라간다.
 * 넓은 화면에서는 쓰지 않는다(SummaryTab 이 useIsMobile 로 고른다).
 */
export function MatchdayRow({ target, match, onSelect }: Omit<Props, 'hero' | 'standingOf'>) {
  const c = comp(match.competition);
  const home = match.home.id === target.espnTeamId;
  const opp = home ? match.away : match.home;
  const live = match.status === 'live';
  const done = match.status === 'finished';
  const dd = dday(match.kickoffUtc);
  const kp = kstParts(match.kickoffUtc);
  const ours = (home ? match.homeScore : match.awayScore) ?? 0;
  const theirs = (home ? match.awayScore : match.homeScore) ?? 0;

  return (
    <button
      type="button"
      className="mdr"
      style={{
        ['--team' as string]: summaryColor(target),
        ['--opp' as string]: SUMMARY_OPP,
      }}
      onClick={() => {
        onSelect?.();
        revealHero();
      }}
      aria-label={`${target.nameEn} 대 ${opp.shortName} 경기를 크게 보기`}
    >
      <span className="mdr__us">
        <Crest
          team={{
            id: target.espnTeamId, name: target.name, shortName: target.name,
            abbr: target.abbr, logo: target.crest,
          }}
          size={30}
        />
      </span>
      <span className="mdr__mid">
        <span className="mdr__vs">
          <i>vs</i>
          <Crest team={opp} size={16} />
          <b>{opp.shortName}</b>
        </span>
        <span className="mdr__meta">
          <CompCrest k={match.competition} size={12} />
          <span className="mdr__comp">{c.name}</span>
          <span className="mdr__ha" data-home={home || undefined}>{home ? 'HOME' : 'AWAY'}</span>
        </span>
      </span>
      <span className="mdr__when">
        {live ? (
          <em className="mdr__live">LIVE</em>
        ) : done ? (
          <b className="mdr__score num" data-r={ours > theirs ? 'W' : ours < theirs ? 'L' : 'D'}>
            {match.homeScore}<i>-</i>{match.awayScore}
          </b>
        ) : (
          <em className="mdr__dday" data-tone={dd.tone}>{dd.text}</em>
        )}
        {/* 날짜가 이 줄에서 제일 먼저 찾는 값이다 — 맨 위에 크게, 주말은
            요일 색으로(토 파랑 · 일 빨강). 그 아래에 D-day 칩과 킥오프 시각. */}
        <span className="mdr__dt num">
          <span className="mdr__date">
            <b>{kp.month}.{kp.date}</b>
            <i data-wd={kp.weekday}>{kp.weekdayKo}</i>
          </span>
          {!done && <b className="mdr__time">{match.timeTBD ? 'TBD' : kstTime(match.kickoffUtc)}</b>}
        </span>
      </span>
    </button>
  );
}
