import type { RecentGame } from '../lib/squad';
import { fmtRating, ratingTier } from '../lib/rating';
import { ourScore } from '../lib/playerForm';
import { kstShortDate } from '../lib/kst';

/* 평점 축 — 5.0 아래 · 10.0 위는 없다고 본다(FotMob 평점의 실제 범위) */
const LO = 5;
const HI = 10;
const pct = (v: number) => ((Math.min(HI, Math.max(LO, v)) - LO) / (HI - LO)) * 100;

/**
 * 경기별 폼 — 시즌 전 경기를 막대 하나씩, 왼쪽이 시즌 초 · 오른쪽이 최근.
 *
 * 경기 목록은 줄마다 읽어야 흐름이 보인다. 막대 높이(평점)와 색(평점 배지와 같은 구간)으로
 * "언제 좋았고 언제 꺾였나" 를 한눈에 보이게 한다.
 *  · 막대 위 점 — 골(노랑) · 도움(하늘색) — 경기 줄의 1G · 1A 배지와 같은 색
 *  · 흐린 막대 — 교체 출전   · 바닥의 짧은 회색 — 평점이 없는 경기
 *  · 가로 점선 — 시즌 평균
 * 막대에 올리면(누르면) 아래 목록의 그 경기 줄이 함께 켜진다(hot / onHot).
 */
export function FormChart({ games, avg, hot, onHot }: {
  /** 최신순(PlayerSeason.recent 그대로) — 안에서 뒤집어 그린다 */
  games: RecentGame[];
  avg: number | null;
  hot: string | null;
  onHot: (matchId: string | null) => void;
}) {
  const list = [...games].reverse();
  const at = hot ? list.findIndex((g) => g.matchId === hot) : -1;
  const g = at >= 0 ? list[at] : undefined;
  /* 설명 상자는 막대 위에 — 양 끝에서는 안쪽으로 붙인다 */
  const tipX = list.length > 1 ? (at / (list.length - 1)) * 100 : 50;

  return (
    <div className="form" onPointerLeave={(e) => { if (e.pointerType === 'mouse') onHot(null); }}>
      <div className="form__plot" role="img" aria-label={`경기별 평점 — ${list.length}경기${avg != null ? `, 시즌 평균 ${fmtRating(avg)}` : ''}`}>
        {[6, 7, 8, 9].map((v) => (
          <span key={v} className="form__grid" style={{ bottom: `${pct(v)}%` }}><i className="num">{v}</i></span>
        ))}
        {avg != null && (
          <span className="form__avg" style={{ bottom: `${pct(avg)}%` }}>
            <i className="num">평균 {fmtRating(avg)}</i>
          </span>
        )}
        <div className="form__bars">
          {list.map((x) => {
            const rated = typeof x.rating === 'number';
            const n = x.goals + x.assists;
            return (
              <button
                key={x.matchId}
                type="button"
                className="form__col"
                data-hot={x.matchId === hot || undefined}
                data-dim={(hot && x.matchId !== hot) || undefined}
                aria-label={`${kstShortDate(x.kickoffUtc)} ${x.opponentName} ${rated ? `평점 ${fmtRating(x.rating!)}` : '평점 없음'}`}
                onPointerEnter={() => onHot(x.matchId)}
                onFocus={() => onHot(x.matchId)}
                onClick={() => onHot(x.matchId)}
              >
                <span
                  className="form__bar"
                  data-tier={rated ? ratingTier(x.rating!) : 'none'}
                  data-sub={!x.started || undefined}
                  style={{ height: rated ? `${Math.max(6, pct(x.rating!))}%` : '5px' }}
                >
                  {n > 0 && (
                    <span className="form__ga">
                      {n <= 3
                        ? [...Array(x.goals).fill('g'), ...Array(x.assists).fill('a')].map((k, i) => <i key={i} data-k={k} />)
                        : <><i data-k={x.goals ? 'g' : 'a'} /><b className="num">{n}</b></>}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {g && (
          <div
            className="form__tip"
            style={{ left: `${tipX}%`, transform: `translateX(${-tipX}%)` }}
            role="status"
          >
            <span className="num">{kstShortDate(g.kickoffUtc)}</span>
            <b>{g.homeAway === '홈' ? 'vs' : '@'} {g.opponentName}</b>
            <i className="fchip" data-r={g.result}>{g.result}</i>
            <span className="num">{ourScore(g)}</span>
            <span className="num">{g.started ? '' : '교체 '}{g.minutes}&apos;</span>
            {g.goals > 0 && <em className="pcard__gg">{g.goals}G</em>}
            {g.assists > 0 && <em className="pcard__aa">{g.assists}A</em>}
          </div>
        )}
      </div>

      <ul className="form__key">
        <li><i data-k="g" />골</li>
        <li><i data-k="a" />도움</li>
        <li><i data-k="sub" />교체 출전</li>
        <li className="form__dir">← 시즌 초 · 최근 →</li>
      </ul>
    </div>
  );
}
