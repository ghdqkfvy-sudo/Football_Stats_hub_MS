import { useEffect, useRef } from 'react';
import type { PlayerSeason } from '../lib/squad';
import { compareRows, type CompareRow } from '../lib/playerCompare';
import { useIsMobile } from '../lib/useMedia';
import { useClosing } from '../lib/motion';
import { usePalette } from '../lib/palette';
import { mobileName } from '../config/targets';
import { kstShortDate } from '../lib/kst';
import { Headshot } from './Headshot';
import { NatFlag } from './NatFlag';
import { CompCrest } from './CompCrest';

const POS_LABEL: Record<string, string> = { G: 'GK', D: 'DF', M: 'MF', F: 'FW' };

/** 비교 막대 한 줄 — 가운데 라벨, 양옆 값, 더 나은 쪽 강조 */
function Bar({ r }: { r: CompareRow }) {
  const max = Math.max(r.a ?? 0, r.b ?? 0) || 1;
  const w = (v: number | null) => `${v === null ? 0 : Math.max(4, (v / max) * 100)}%`;
  return (
    <div className="pcmp__row" data-win={r.win ?? undefined}>
      <b className="num pcmp__v pcmp__v--a">{r.fa}</b>
      <span className="pcmp__bar pcmp__bar--a"><i style={{ width: w(r.a) }} /></span>
      <span className="pcmp__lbl">{r.label}</span>
      <span className="pcmp__bar pcmp__bar--b"><i style={{ width: w(r.b) }} /></span>
      <b className="num pcmp__v pcmp__v--b">{r.fb}</b>
    </div>
  );
}

function Head({ p, side }: { p: PlayerSeason; side: 'a' | 'b' }) {
  return (
    <div className="pcmp__who" data-side={side}>
      <Headshot id={p.id} src={p.photo} kind={p.photoKind} sofa={p.sofascoreId} label={String(p.jersey)} size={52} />
      <b>{p.name}</b>
      <span>
        <NatFlag nat={p.nat} />
        <em className="pcard__pos" data-pos={p.pos}>{POS_LABEL[p.pos]}</em>
        <span className="num">#{p.jersey}</span>
      </span>
      {p.inj && <small className="pcmp__st" data-kind={p.inj.doubtful ? 'doubt' : 'inj'}>{p.inj.doubtful ? '출전 불투명' : `부상 · ${p.inj.ko}`}</small>}
      {!p.inj && p.disc?.sus && <small className="pcmp__st" data-kind="red">출전 정지</small>}
    </div>
  );
}

/** 최근 5경기 출전 시간 — 왼쪽이 오래된 것 */
function Recent({ p }: { p: PlayerSeason }) {
  const games = [...p.recent].sort((x, y) => x.kickoffUtc.localeCompare(y.kickoffUtc)).slice(-5);
  if (!games.length) return <span className="pcmp__none">기록 없음</span>;
  return (
    <span className="pcmp__recent">
      {games.map((g) => (
        <span key={g.matchId} title={`${kstShortDate(g.kickoffUtc)} vs ${g.opponentName} · ${g.minutes}분`}>
          <i style={{ height: `${Math.max(6, Math.min(100, (g.minutes / 90) * 100))}%` }} data-start={g.started || undefined} />
          <small className="num">{g.minutes}'</small>
        </span>
      ))}
    </span>
  );
}

/**
 * 팀 내 선수 비교 창 — 두 선수의 시즌 기록을 좌우로.
 *  · 시즌 기록(출전 · 선발 · 시간 · 골 · 도움 · 공격 포인트)
 *  · 90분당 · 선발률 · 카드(적을수록 좋다)
 *  · 대회별 · 최근 5경기 출전 시간 · 부상/징계 상태
 * 폰은 바텀시트, 넓은 화면은 가운데 창(선수 상세와 같은 틀).
 */
export function PlayerCompare({ pair, onClose, onChange }: {
  pair: [PlayerSeason, PlayerSeason] | null;
  onClose: () => void;
  /** 1번은 두고 2번 선수를 다시 고른다 */
  onChange: (a: PlayerSeason) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();
  const palette = usePalette();
  const [closing, close] = useClosing(onClose);

  useEffect(() => {
    if (!pair) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pair, close]);

  const rows = pair ? compareRows(pair[0], pair[1]) : null;
  const comps = pair ? [...new Set([...pair[0].byComp, ...pair[1].byComp].map((c) => c.competition))] : [];
  const split = (p: PlayerSeason, k: string) => p.byComp.find((c) => c.competition === k);

  return (
    <div className="sheet sheet--modal" data-open={!!pair} data-closing={closing || undefined} aria-hidden={!pair}>
      <div className="sheet__scrim" onClick={close} />
      {pair && rows && (
        <div className={`sheet__panel pcmp${mobile ? ' pcmp--m' : ''}`} role="dialog" aria-modal="true"
          aria-label={`${pair[0].name} vs ${pair[1].name} 비교`} tabIndex={-1} ref={panel}>
          <div className="sheet__grab" />
          <button className="pdet__x" aria-label="닫기" onClick={close}>✕</button>

          <div className="pcmp__head">
            <Head p={pair[0]} side="a" />
            <span className="pcmp__vs">vs</span>
            <Head p={pair[1]} side="b" />
          </div>

          <div className="pcmp__sec">
            <span className="eyebrow">시즌 기록</span>
            {rows.season.map((r) => <Bar key={r.key} r={r} />)}
          </div>
          <div className="pcmp__sec">
            <span className="eyebrow">90분당 · 선발률 · 카드</span>
            {rows.rate.map((r) => <Bar key={r.key} r={r} />)}
          </div>

          {comps.length > 0 && (
            <div className="pcmp__sec">
              <span className="eyebrow">대회별</span>
              {comps.map((k) => {
                const a = split(pair[0], k), b = split(pair[1], k);
                const cell = (c?: typeof a) => (c ? `${c.apps}경기 · ${c.goals}G ${c.assists}A` : '–');
                return (
                  <div className="pcmp__comp" key={k}>
                    <span className="num">{cell(a)}</span>
                    <span className="pcmp__cn"><CompCrest k={k} size={13} />
                      <span className="m-full">{palette.name(k)}</span><span className="m-short">{mobileName(k)}</span>
                    </span>
                    <span className="num">{cell(b)}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pcmp__sec">
            <span className="eyebrow">최근 5경기 출전 시간</span>
            <div className="pcmp__recents"><Recent p={pair[0]} /><Recent p={pair[1]} /></div>
          </div>

          <div className="pcmp__foot">
            <button className="pcmp__btn" onClick={() => onChange(pair[0])}>선수 바꾸기</button>
            <button className="pcmp__btn pcmp__btn--main" onClick={close}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 비교 고르기 막대 — 1번 선수를 고정한 동안 화면 아래에.
 * "비교할 선수를 고르세요" + 같은 자리 경쟁자 칩(한 번 눌러 바로 비교) + 취소(Esc).
 */
export function CompareBar({ a, rivals, onPick, onCancel }: {
  a: PlayerSeason | null;
  rivals: PlayerSeason[];
  onPick: (p: PlayerSeason) => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!a) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [a, onCancel]);
  if (!a) return null;
  return (
    <div className="cmpbar" role="status">
      <div className="cmpbar__top">
        <span className="cmpbar__pin">
          <Headshot id={a.id} src={a.photo} kind={a.photoKind} sofa={a.sofascoreId} label={String(a.jersey)} size={26} />
          <b>{a.name.split(' ').slice(-1)[0]}</b>
          <span>· 비교할 선수를 고르세요</span>
        </span>
        <button className="cmpbar__x" onClick={onCancel}>취소</button>
      </div>
      {rivals.length > 0 && (
        <div className="cmpbar__rivals">
          <small>같은 자리</small>
          {rivals.map((p) => (
            <button key={p.id} className="cmpbar__chip" onClick={() => onPick(p)}>
              <Headshot id={p.id} src={p.photo} kind={p.photoKind} sofa={p.sofascoreId} label={String(p.jersey)} size={20} />
              {p.name.split(' ').slice(-1)[0]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
