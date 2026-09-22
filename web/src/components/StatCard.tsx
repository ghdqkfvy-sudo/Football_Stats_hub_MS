import { useState, type ReactNode } from 'react';
import { CREST } from '../config/targets';
import { tintOf } from '../config/crestTint';
import { usePalette } from '../lib/palette';
import type { AthleteInfo } from '../types/feedTypes';
import { Crest } from './Crest';
import { Headshot } from './Headshot';

/**
 * 선수 카드 — 코리안리거 탭과 Future Resources 탭이 **같은 양식**을 쓴다.
 *
 * 예전에는 두 탭이 각자 다른 카드를 그렸다(Future 는 숫자 네 칸짜리 타일).
 * 같은 "선수 한 명의 시즌 기록" 인데 모양이 다르면 눈이 매번 다시 적응해야
 * 하고, 고칠 일이 생기면 두 곳을 고쳐야 한다. 그래서 한 컴포넌트로 합쳤다.
 * CSS 는 이미 있던 `.krc*` / `.krr*` 를 그대로 쓴다.
 */

export interface CompLine {
  /** 대회 슬러그 — 색과 이름을 여기서 끌어온다 */
  competition: string;
  label: string;
  logo?: string;
  apps: number;
  starts: number;
  goals: number;
  assists: number;
}

export interface RecentLine {
  competition?: string;
  result?: 'W' | 'D' | 'L';
  opponent: string;
  score?: string;
  /** 선발 여부 — undefined 면 "확인 못 했다"(0분으로 꾸미지 않는다) */
  started?: boolean;
  minutes?: number;
  subIn?: number;
  goals: number;
  assists: number;
  yellow?: boolean;
}

/**
 * 대회 앰블럼 — 스냅샷이 core 리그 객체에서 받아 둔 주소를 쓴다.
 * 주소가 없거나(오래된 피드) 이미지가 막힌 환경이면 대회 색 점으로 떨어진다.
 */
export function LeagueMark({ src, color }: { src?: string; color: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <i className="krcc__dot" style={{ background: color }} aria-hidden="true" />;
  return (
    <img
      className="krcc__logo"
      src={src}
      alt=""
      width={15}
      height={15}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

interface Props {
  id: string;
  name: string;
  /** GK / DF / MF / FW */
  posLabel?: string;
  photo?: string;
  photoKind?: AthleteInfo['photoKind'];
  /** 이미지가 없을 때 원 안에 넣을 글자 */
  fallbackLabel: string;
  clubId?: string;
  club?: string;
  age?: number;
  league?: string;
  leagueName?: string;
  leagueLogo?: string;
  comps: CompLine[];
  recent: RecentLine[];
  /** 오른쪽 위 배지 (Future 의 조항 종류 같은 것) */
  tag?: ReactNode;
  /** 대회 기록이 하나도 없을 때의 문구 */
  emptyNote?: string;
  /** 최근 경기가 없을 때의 문구 */
  recentNote?: string;
  open: boolean;
  onHover: (v: boolean) => void;
}

export function StatCard({
  id, name, posLabel, photo, photoKind, fallbackLabel,
  clubId, club, age, league, leagueName, leagueLogo,
  comps, recent, tag, emptyNote, recentNote, open, onHover,
}: Props) {
  const palette = usePalette();
  const [bg, fg] = tintOf(clubId ?? '0');

  const sum = (k: 'goals' | 'assists') => comps.reduce((a, r) => a + r[k], 0);
  const g = sum('goals');
  const a = sum('assists');

  /** 아는 대회면 사람이 읽는 이름으로 — 피드의 leagueName 은 비면 슬러그다 */
  const leagueText = league
    ? (palette.name(league) === league ? (leagueName || league) : palette.name(league))
    : leagueName;

  return (
    <article
      className="krc"
      style={{ ['--club' as string]: bg, ['--clubfg' as string]: fg }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      tabIndex={0}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
    >
      <div className="krc__top">
        <Headshot
          id={id}
          src={photo}
          kind={photoKind}
          label={fallbackLabel}
          size={46}
          className="krc__hs"
        />
        <div className="krc__id">
          <b>
            {name}
            {posLabel && <em>{posLabel}</em>}
          </b>
          {club && (
            <span className="krc__club">
              <Crest
                team={{
                  id: clubId ?? '0',
                  name: club,
                  shortName: club,
                  abbr: club.slice(0, 3).toUpperCase(),
                  logo: !clubId || clubId === '0' ? '' : CREST(clubId),
                }}
                size={15}
              />
              {club}
              {age ? ` · ${age}세` : ''}
            </span>
          )}
          {leagueText && (
            <span className="krc__lg">
              {/* 리그 앰블럼도 API 가 준 주소다 — 로고 id 를 코드에 적어 두면
                  선수가 새 리그로 옮길 때마다 빈칸이 된다. */}
              <LeagueMark src={leagueLogo} color={palette.color(league ?? '')} />
              {leagueText}
            </span>
          )}
        </div>
        {tag && <span className="krc__tag">{tag}</span>}
      </div>

      {comps.length === 0 ? (
        <p className="krc__none">{emptyNote ?? '이번 시즌 출전 기록이 아직 없습니다.'}</p>
      ) : (
        <>
          {/* 게이지는 **출전 대비 선발 비율** 이다.
              예전에는 공격포인트 비중이라, 골·도움이 없는 선수는 전부 0 이고
              하나라도 있으면 꽉 찬 막대가 되어 아무 정보도 주지 않았다.
              "얼마나 주전인가" 가 이 카드에서 훨씬 많이 궁금한 값이다. */}
          <div className="krc__label">대회별 출전 · 게이지는 선발 비율</div>
          <div className="krc__comps">
            {comps.map((s) => {
              const share = s.apps > 0 ? Math.round((s.starts / s.apps) * 100) : 0;
              return (
                <div
                  className="krcc"
                  key={s.competition}
                  style={{ ['--c' as string]: palette.color(s.competition) }}
                >
                  <LeagueMark src={s.logo} color={palette.color(s.competition)} />
                  <span className="krcc__n">{s.label}</span>
                  <span
                    className="krcc__bar"
                    title={s.apps > 0 ? `선발 ${s.starts} / 출전 ${s.apps} (${share}%)` : '출전 기록 없음'}
                  >
                    <b style={{ width: `${share}%` }} />
                  </span>
                  <span className="krcc__a num">
                    {s.apps}경기 <em>(선발 {s.starts})</em>
                  </span>
                  <span className="krcc__ga num">
                    <b data-k="g" data-on={s.goals > 0}>{s.goals}</b>
                    <b data-k="a" data-on={s.assists > 0}>{s.assists}</b>
                  </span>
                  <span className="krcc__p num">{s.goals + s.assists}</span>
                </div>
              );
            })}
          </div>

          <div className="krc__foot">
            <span className="eyebrow">합계</span>
            <span className="krc__sum num">
              <b data-k="g" data-on={g > 0}><i>G</i>{g}</b>
              <b data-k="a" data-on={a > 0}><i>A</i>{a}</b>
              <b data-k="p" data-on={g + a > 0}><i>AP</i>{g + a}</b>
            </span>
          </div>
        </>
      )}

      <RecentPanel name={name} recent={recent} note={recentNote} open={open} />
    </article>
  );
}

/** 호버 — 최근 경기 기록 */
function RecentPanel({
  name, recent, note, open,
}: {
  name: string;
  recent: RecentLine[];
  note?: string;
  open: boolean;
}) {
  const palette = usePalette();

  /* 명단에만 있었던 경기는 "교체" 로 잡히면 안 된다 — 스냅샷에서 이미
     걸러 내지만, 예전 피드가 남아 있을 수 있어 화면에서도 막는다. */
  const rows = recent.filter((gm) => gm.started !== false || gm.subIn !== undefined);

  /* 넓은 화면에서는 카드 위에 떠오르는 호버 패널이고, 좁은 화면에서는
     카드 아래에 그대로 붙는다(모바일에는 호버가 없어 안 보였다).
     둘 다 CSS 가 정한다 — 항상 그려 두고 data-open 만 넘긴다. */
  return (
    <div className="krr" role="tooltip" data-open={open}>
      <div className="krr__h">
        <span className="eyebrow">최근 {rows.length || ''}경기 기록</span>
        <b>{name}</b>
      </div>

      {rows.length === 0 ? (
        <p className="krr__none">{note ?? '경기별 기록이 아직 없습니다.'}</p>
      ) : (
        rows.map((gm, i) => (
          <div className="krr__g" key={i}>
            {gm.result ? <i className="fchip" data-r={gm.result}>{gm.result}</i> : <i />}
            <i className="krr__c" style={{ background: palette.color(gm.competition ?? '') }} />
            <span className="krr__opp">vs {gm.opponent || '—'}</span>
            <span className="krr__sc num">{gm.score ?? ''}</span>
            <span className="krr__m num">
              {/* 선발/교체·출전시간은 경기 로스터에서 온 실제 값일 때만 적는다.
                  없으면 "-" — 예전처럼 0분으로 꾸미지 않는다. */}
              {gm.started === undefined
                ? '-'
                : gm.started
                  ? `선발 ${gm.minutes ?? 90}'`
                  : gm.subIn !== undefined
                    ? `교체 ${gm.subIn}'(${gm.minutes ?? 0})`
                    : '교체'}
              {gm.goals > 0 && <em className="krr__gg">{gm.goals}G</em>}
              {gm.assists > 0 && <em className="krr__aa">A{gm.assists}</em>}
              {gm.yellow && <em className="krr__y" />}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
