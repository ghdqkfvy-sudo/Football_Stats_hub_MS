import { useEffect, useRef } from 'react';
import type { PlayerSeason } from '../lib/squad';
import { usePalette } from '../lib/palette';
import { kstShortDate } from '../lib/kst';
import { Headshot } from './Headshot';
import { Crest } from './Crest';
import { CompCrest } from './CompCrest';
import { Cards } from './PlayerTable';

const POS_LABEL: Record<string, string> = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' };

/**
 * 선수 상세 — 이번 시즌 출전한 **모든 경기**의 기록.
 *
 * 호버 카드는 최근 3경기까지라 "시즌 초에는 주전이었다가 밀렸나" 같은 흐름이
 * 안 보였다. 경기별 출전 시간을 막대로 늘어놓으면 그 흐름이 한눈에 읽힌다.
 * 넓은 화면은 가운데 창, 폰은 바텀시트(.sheet 를 같이 쓴다).
 */
export function PlayerDetail({ p, onClose }: { p: PlayerSeason | null; onClose: () => void }) {
  const palette = usePalette();
  const panel = useRef<HTMLDivElement>(null);

  /* Esc 로 닫고, 열릴 때 창으로 초점을 옮긴다(키보드·스크린리더가 창 안에서 시작) */
  useEffect(() => {
    if (!p) return;
    const back = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      back?.focus?.();
    };
  }, [p, onClose]);

  const games = p?.recent ?? [];
  const maxMin = Math.max(90, ...games.map((g) => g.minutes));

  return (
    <div className="sheet sheet--modal" data-open={!!p} aria-hidden={!p}>
      <div className="sheet__scrim" onClick={onClose} />
      {p && (
        <div
          className="sheet__panel pdet"
          role="dialog"
          aria-modal="true"
          aria-label={`${p.name} 시즌 경기 기록`}
          tabIndex={-1}
          ref={panel}
        >
          <div className="sheet__grab" />
          <button className="pdet__x" aria-label="닫기" onClick={onClose}>✕</button>

          <div className="pdet__top">
            <Headshot id={p.id} src={p.photo} kind={p.photoKind} jersey={p.jersey} size={54} />
            <div>
              <b className="pdet__name">{p.name}</b>
              <span className="pdet__meta">
                <em className="pcard__pos" data-pos={p.pos}>{POS_LABEL[p.pos]}</em>
                {` #${p.jersey}`}{p.age ? ` · ${p.age}세` : ''}
              </span>
            </div>
          </div>

          <div className="pdet__sum num">
            {([
              ['출전', p.apps], ['선발', p.starts], ['분', p.minutes],
              ['골', p.goals], ['도움', p.assists], ['공격P', p.points],
            ] as const).map(([k, v]) => (
              <div key={k}><b>{v}</b><span>{k}</span></div>
            ))}
          </div>

          {games.length === 0 ? (
            <p className="pdet__none">경기별 라인업 기록이 아직 없습니다.</p>
          ) : (
            <>
              <div className="pdet__h">
                <span>경기별 기록 · 최신순</span>
                <span>막대 = 출전 시간</span>
              </div>
              <ol className="pdet__list">
                {games.map((g) => (
                  <li key={g.matchId} className="pdet__g">
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
                    <span className="pdet__sc num">
                      <i className="fchip" data-r={g.result}>{g.result}</i>
                      {g.scoreline}
                    </span>
                    <span className="pdet__min" title={g.started ? '선발' : g.subIn !== undefined ? `${g.subIn}분 교체 투입` : '교체'}>
                      <i data-start={g.started || undefined}>
                        <u style={{ width: `${(g.minutes / maxMin) * 100}%` }} />
                      </i>
                      <em className="num">{g.started ? '' : '↑'}{g.minutes}&apos;</em>
                    </span>
                    <span className="pdet__ga num">
                      {g.goals > 0 && <em className="pcard__gg">{g.goals}G</em>}
                      {g.assists > 0 && <em className="pcard__aa">{g.assists}A</em>}
                      {(g.yellow > 0 || g.red > 0) && <Cards yellow={g.yellow} red={g.red} />}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="pdet__key">↑ = 교체 투입 · 진한 막대 = 선발</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
