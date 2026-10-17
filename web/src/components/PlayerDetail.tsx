import { useEffect, useRef } from 'react';
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
import { BenchLine, Cards, GameRow, PlayerSummary, PosTag } from './PlayerCardParts';

const POS_LABEL: Record<string, string> = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' };

/**
 * 선수 상세 — 이번 시즌 출전한 **모든 경기**의 기록.
 *
 *  · 넓은 화면 — 가운데 창. 요약 숫자 + 경기별 표(출전 시간 막대로 주전 흐름이 보인다)
 *  · 폰 — 바텀시트. 호버 카드와 **같은 모양**(PlayerCardParts): 폰에는 호버 카드가
 *    없으므로(탭하면 이 시트만 뜬다) 넓은 화면의 카드에서 보던 그대로 보여 준다.
 *    경기 목록만 최근 3경기 → 시즌 전 경기.
 */
export function PlayerDetail({ p, onClose, onCompare }: {
  p: PlayerSeason | null;
  onClose: () => void;
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
          className={`sheet__panel pdet${mobile ? ' pdet--card' : ''}`}
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
          {mobile ? <CardBody p={p} onCompare={onCompare} /> : <TableBody p={p} />}
        </div>
      )}
    </div>
  );
}

/** 폰 — 호버 카드와 같은 두 상자 */
function CardBody({ p, onCompare }: { p: PlayerSeason; onCompare?: (p: PlayerSeason) => void }) {
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
        {p.recent.length === 0
          ? <p className="pdet__none">{p.inj && p.apps === 0 ? '부상으로 이번 시즌 출전 기록이 없습니다.' : '경기별 라인업 기록이 아직 없습니다.'}</p>
          : p.recent.map((g) => <GameRow key={g.matchId} g={g} />)}
      </div>
    </div>
  );
}

/** 넓은 화면 — 요약 숫자 + 경기별 표 */
function TableBody({ p }: { p: PlayerSeason }) {
  const palette = usePalette();
  const games = p.recent;
  const maxMin = Math.max(90, ...games.map((g) => g.minutes));
  return (
    <>
    <div className="pdet__top">
      <Headshot id={p.id} src={p.photo} kind={p.photoKind} sofa={p.sofascoreId} label={String(p.jersey)} size={54} />
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

    {/* 호버 카드와 같은 규칙 — 골·도움은 값이 있으면 숫자만 팀 컬러,
        강조 **상자**는 공격 포인트 하나만(여섯 칸이 다 빛나면 어디를 볼지 모른다) */}
    <div className="pdet__sum num">
      {([
        ['출전', p.apps, ''], ['선발', p.starts, ''], ['분', p.minutes, ''],
        ['골', p.goals, 'tint'], ['도움', p.assists, 'tint'], ['공격P', p.points, 'ap'],
      ] as const).map(([k, v, hl]) => (
        <div key={k} data-hl={v > 0 && hl ? hl : undefined}><b>{v}</b><span>{k}</span></div>
      ))}
    </div>

    <BenchLine p={p} />

    {games.length === 0 ? (
      <p className="pdet__none">{p.inj && p.apps === 0 ? '부상으로 이번 시즌 출전 기록이 없습니다.' : '경기별 라인업 기록이 아직 없습니다.'}</p>
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
              <PosTag g={g} />
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
    </>
  );
}
