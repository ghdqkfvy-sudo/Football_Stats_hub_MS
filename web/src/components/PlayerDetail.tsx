import { useEffect, useRef, useState } from 'react';
import type { PlayerSeason } from '../lib/squad';
import { usePalette } from '../lib/palette';
import { kstShortDate } from '../lib/kst';
import { useIsMobile } from '../lib/useMedia';
import { useClosing } from '../lib/motion';
import { Headshot } from './Headshot';
import { NatFlag } from './NatFlag';
import { InjuryLine } from './InjuryMark';
import { DisciplineLines } from './DisciplineLines';
import { Crest } from './Crest';
import { CompCrest } from './CompCrest';
import { RatingBadge } from './RatingBadge';
import { seasonRatingTitle } from '../lib/rating';
import { fmtRating, ratingTier } from '../lib/rating';
import { byMonth, ourScore, per90, recentDelta, seasonAvg, startShare, teamRanks } from '../lib/playerForm';
import { FormChart } from './FormChart';
import { BenchLine, Cards, GameRow, PlayerSummary, PosTag } from './PlayerCardParts';

const POS_LABEL: Record<string, string> = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' };

/**
 * 선수 상세 — 이번 시즌 출전한 **모든 경기**의 기록.
 *
 *  · 넓은 화면 — 가운데 창, 두 단(2026-11-12). 왼쪽은 "어떤 시즌인가"(핵심 수치 · 팀 내 순위 ·
 *    대회별), 오른쪽은 "어떻게 흘러왔나"(경기별 폼 차트 + 경기 목록). 예전에는 같은 모양의
 *    경기 줄 열여섯 개가 전부라 줄마다 읽어야 흐름이 보였다.
 *  · 폰 — 바텀시트. 호버 카드와 **같은 모양**(PlayerCardParts): 폰에는 호버 카드가
 *    없으므로(탭하면 이 시트만 뜬다) 넓은 화면의 카드에서 보던 그대로 보여 준다.
 *    경기 목록만 최근 3경기 → 시즌 전 경기.
 */
export function PlayerDetail({ p, onClose, onCompare, players }: {
  p: PlayerSeason | null;
  onClose: () => void;
  /** 같은 팀 선수 전부 — 있으면 "득점 팀 1위" 같은 팀 내 순위를 적는다 */
  players?: PlayerSeason[];
  /** "이 선수와 비교" — 길게 누르기를 모르는 사람 · 마우스용 입구 */
  onCompare?: (p: PlayerSeason) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();
  /* 닫을 때 시트는 내려가고, 가운데 창은 흐려지며 닫힌다(motion.css data-closing) */
  const [closing, close] = useClosing(onClose);

  /* Esc 로 닫고, 열릴 때 창으로 초점을 옮긴다(키보드·스크린리더가 창 안에서 시작) */
  useEffect(() => {
    if (!p) return;
    const back = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      back?.focus?.({ preventScroll: true });
    };
  }, [p, close]);

  return (
    <div className="sheet sheet--modal" data-open={!!p} data-closing={closing || undefined} aria-hidden={!p}>
      <div className="sheet__scrim" onClick={close} />
      {p && (
        <div
          className={`sheet__panel pdet${mobile ? ' pdet--card' : ' pdet--wide'}`}
          role="dialog"
          aria-modal="true"
          aria-label={`${p.name} 시즌 경기 기록`}
          tabIndex={-1}
          ref={panel}
        >
          <div className="sheet__grab" />
          <button className="pdet__x" aria-label="닫기" onClick={close}>✕</button>
          {/* 비교 — 넓은 화면은 닫기 옆 작은 버튼, 폰은 첫 상자 아래 넓은 버튼(카드 밖 머리 자리는 가려져 안 보였다) */}
          {onCompare && !mobile && (
            <button className="pdet__cmp" onClick={() => onCompare(p)} title="다른 선수와 시즌 기록 비교">⇄ 비교</button>
          )}
          {mobile ? <CardBody p={p} onCompare={onCompare} /> : <TableBody key={p.id} p={p} players={players} />}
        </div>
      )}
    </div>
  );
}

/** 폰 — 호버 카드와 같은 두 상자 */
function CardBody({ p, onCompare }: { p: PlayerSeason; onCompare?: (p: PlayerSeason) => void }) {
  const [hot, setHot] = useState<string | null>(null);
  const charted = p.recent.filter((g) => typeof g.rating === 'number').length >= 3;
  return (
    <div className="pdet__body">
      <div className="pcard__main">
        <PlayerSummary p={p} />
        {onCompare && <button className="pdet__cmpm" onClick={() => onCompare(p)}>⇄ 다른 선수와 비교</button>}
      </div>
      <BenchLine p={p} />
      <div className="pcard__side">
        <div className="pcard__sideh">
          <b>시즌 {p.recent.length}경기</b>
          <span>최신순</span>
        </div>
        {charted && <FormChart games={p.recent} avg={seasonAvg(p)} hot={hot} onHot={setHot} />}
        {p.recent.length === 0
          ? <p className="pdet__none">{p.inj && p.apps === 0 ? '부상으로 이번 시즌 출전 기록이 없습니다.' : '경기별 라인업 기록이 아직 없습니다.'}</p>
          : p.recent.map((g) => <GameRow key={g.matchId} g={g} hot={g.matchId === hot} />)}
      </div>
    </div>
  );
}

/** 넓은 화면 — 왼쪽 요약 · 오른쪽 폼 차트 + 경기 목록 */
function TableBody({ p, players }: { p: PlayerSeason; players?: PlayerSeason[] }) {
  const palette = usePalette();
  const games = p.recent;
  /* 차트 막대 ↔ 목록 줄 — 한쪽에 올리면 다른 쪽도 켜진다 */
  const [hot, setHot] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hotFromChart = (id: string | null) => {
    setHot(id);
    if (id) listRef.current?.querySelector(`[data-mid="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  const avg = seasonAvg(p);
  const charted = games.filter((g) => typeof g.rating === 'number').length >= 3;
  const p90 = per90(p.points, p.minutes);
  const share = startShare(p);
  const trend = recentDelta(p);
  const ranks = players ? teamRanks(p, players) : [];

  return (
    <div className="pdet__cols">
      <aside className="pdet__side">
        <div className="pdet__top">
          <Headshot id={p.id} src={p.photo} kind={p.photoKind} sofa={p.sofascoreId} label={String(p.jersey)} size={64} />
          <div>
            <b className="pdet__name">{p.name}</b>
            <span className="pdet__meta">
              <NatFlag nat={p.nat} />
              <em className="pcard__pos" data-pos={p.pos}>{POS_LABEL[p.pos]}</em>
              {` #${p.jersey}`}{p.age ? ` · ${p.age}세` : ''}
            </span>
          </div>
        </div>
        <InjuryLine inj={p.inj} />
        <DisciplineLines d={p.disc} />

        {/* 크게 보이는 숫자는 둘뿐 — 공격 포인트와 시즌 평점. 여섯 칸이 같은 크기면 어디를 볼지 모른다 */}
        <div className="pdet__hero num">
          <div data-k="ap" data-on={p.points > 0 || undefined}>
            <b>{p.points}</b>
            <span>공격 포인트</span>
            <em>{p.goals}골 · {p.assists}도움</em>
          </div>
          <div data-k="rtg" data-tier={p.rating != null ? ratingTier(p.rating) : undefined} title={p.rating != null ? seasonRatingTitle(p) : undefined}>
            <b>{p.rating != null ? fmtRating(p.rating) : '–'}</b>
            <span>시즌 평점</span>
            {trend
              ? <em data-d={trend.delta > 0 ? 'up' : trend.delta < 0 ? 'down' : undefined} title={`최근 5경기 평균 ${trend.recent.toFixed(2)}`}>
                  최근 5경기 {trend.delta > 0 ? '▲' : trend.delta < 0 ? '▼' : '='} {Math.abs(trend.delta).toFixed(1)}
                </em>
              : <em>FotMob</em>}
          </div>
        </div>

        <div className="pdet__mini num">
          <div><b>{p.apps}</b><span>출전</span></div>
          <div><b>{p.starts}</b><span>선발{share != null ? ` ${share}%` : ''}</span></div>
          <div><b>{p.minutes}</b><span>{p.realMinutes ? '분' : '분(리그)'}</span></div>
          <div title="90분당 공격 포인트(골 + 도움)"><b>{p90 != null ? p90.toFixed(2) : '–'}</b><span>90분당 공격P</span></div>
        </div>

        {ranks.length > 0 && (
          <div className="pdet__ranks">
            {ranks.map((r) => (
              <span key={r.key} data-first={r.rank === 1 || undefined}>{r.label} <b className="num">팀 {r.rank}위</b></span>
            ))}
          </div>
        )}

        <div className="pcard__cards">
          <span>카드</span>
          <Cards yellow={p.yellow} red={p.red} zero />
        </div>

        {/* 대회별 — 호버 카드 · 폰 시트에는 있고 여기만 빠져 있었다 */}
        {p.byComp.length > 0 && (
          <div className="pcard__comps">
            <span className="eyebrow">대회별</span>
            {p.byComp.map((c) => (
              <div className="pcard__comp" key={c.competition}>
                <CompCrest k={c.competition} size={14} />
                <span className="pcard__cn">{palette.name(c.competition)}</span>
                <span className="pcard__ca num">
                  <b>{c.apps}</b>경기<i>(선발 <b>{c.starts}</b>)</i>
                </span>
                <span className="pcard__cg num">
                  <span className="g" data-zero={c.goals === 0}><b>{c.goals}</b>G</span>
                  <span className="a" data-zero={c.assists === 0}><b>{c.assists}</b>A</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </aside>

      <div className="pdet__main">
        {games.length === 0 ? (
          <p className="pdet__none">{p.inj && p.apps === 0 ? '부상으로 이번 시즌 출전 기록이 없습니다.' : '경기별 라인업 기록이 아직 없습니다.'}</p>
        ) : (
          <>
            {charted && (
              <>
                <div className="pdet__h"><span>경기별 폼 · 평점</span></div>
                <FormChart games={games} avg={avg} hot={hot} onHot={hotFromChart} />
              </>
            )}

            <BenchLine p={p} />

            <div className="pdet__h pdet__h--list"><span>경기 기록 · {games.length}경기 · 최신순</span></div>
            <div className="pdet__g pdet__g--head" aria-hidden="true">
              <span>날짜</span><span /><span>상대</span><span>결과</span><span>자리</span><span>출전</span><span>기록</span><span>평점</span>
            </div>
            <div className="pdet__list" ref={listRef} onPointerLeave={() => setHot(null)}>
              {byMonth(games).map((m) => (
                <section key={`${m.month}-${m.games[0].matchId}`}>
                  <h4 className="pdet__month num">{m.month}월</h4>
                  <ol>
                    {m.games.map((g) => {
                      /* 90분을 채웠으면 풀타임 — 추가시간에 바뀐 경기(subOut 90+)도 막대를 그릴 이유가 없다 */
                      const full = g.started && g.minutes >= 90;
                      return (
                        <li
                          key={g.matchId}
                          className="pdet__g"
                          data-mid={g.matchId}
                          data-hot={g.matchId === hot || undefined}
                          data-ga={g.goals + g.assists > 0 || undefined}
                          data-edge={g.rating == null ? undefined : g.rating >= 8.5 ? 'hi' : g.rating < 6.5 ? 'lo' : undefined}
                          onPointerEnter={() => setHot(g.matchId)}
                        >
                          <span className="pdet__when num">{kstShortDate(g.kickoffUtc)}</span>
                          <span className="pdet__comp" title={palette.name(g.competition)}>
                            <CompCrest k={g.competition} size={14} />
                          </span>
                          <span className="pdet__opp">
                            <i className="hachip" data-side={g.homeAway === '홈' ? 'H' : 'A'}>
                              {g.homeAway === '홈' ? 'H' : 'A'}
                            </i>
                            <Crest
                              team={{
                                id: g.opponentId, name: g.opponentName, shortName: g.opponentName,
                                abbr: g.opponent, logo: g.opponentLogo ?? '',
                              }}
                              size={16}
                            />
                            <b>{g.opponentName}</b>
                          </span>
                          {/* 스코어는 우리 팀 기준 — 원정 승리가 "W 0:3" 으로 읽히지 않게 */}
                          <span className="pdet__sc num" title={`홈 : 원정 ${g.scoreline}`}>
                            <i className="fchip" data-r={g.result}>{g.result}</i>
                            {ourScore(g)}
                          </span>
                          <PosTag g={g} />
                          {/* 풀타임은 숫자만 — 주전은 열여섯 줄이 전부 같은 막대였다. 막대는 덜 뛴 경기에만 */}
                          <span className="pdet__min" data-full={full || undefined} title={g.started ? (full ? '선발 · 풀타임' : `선발 · ${g.subOut}분 교체 아웃`) : g.subIn !== undefined ? `${g.subIn}분 교체 투입` : '교체'}>
                            {!full && (
                              <i data-start={g.started || undefined}>
                                <u style={{ width: `${Math.min(100, (g.minutes / 90) * 100)}%` }} />
                              </i>
                            )}
                            <em className="num">{g.started ? '' : '↑'}{g.minutes}&apos;</em>
                          </span>
                          <span className="pdet__ga num">
                            {g.goals > 0 && <em className="pcard__gg">{g.goals}G</em>}
                            {g.assists > 0 && <em className="pcard__aa">{g.assists}A</em>}
                            {(g.yellow > 0 || g.red > 0) && <Cards yellow={g.yellow} red={g.red} />}
                          </span>
                          <span className="pdet__rtg"><RatingBadge v={g.rating} cls="rtg--sm" title="FotMob 경기 평점" /></span>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}
            </div>
            <p className="pdet__key">↑ = 교체 투입 · 막대 = 풀타임이 아닌 경기의 출전 시간 · 왼쪽 띠 = 평점 8.5 이상(파랑) / 6.5 미만(빨강)</p>
          </>
        )}
      </div>
    </div>
  );
}
