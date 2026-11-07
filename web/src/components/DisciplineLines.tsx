import type { Discipline, Suspension } from '../lib/discipline';
import { CARD_RULES, susParts } from '../lib/discipline';
import { comp, mobileName } from '../config/targets';
import { kstParts } from '../lib/kst';
import { CardShape } from './InjuryMark';

const when = (iso: string) => { const p = kstParts(iso); return `${p.month}.${p.date} (${p.weekdayKo})`; };
const day = (iso: string) => { const p = kstParts(iso); return `${p.month}.${p.date}`; };

/** 대회 이름 — 데스크톱은 전체, 폰은 약칭(EPL · UCL) */
export function CompName({ k }: { k: string }) {
  return <><span className="m-full">{comp(k).name}</span><span className="m-short">{mobileName(k)}</span></>;
}

/**
 * "La Liga 3경기 (~ 11.2)" · "EPL 10.19 (월) vs Arsenal" — 대회 · 못 뛰는 경기 · 기한을 색으로 가른다(2026-11-07).
 * 대회는 대회 색, 못 뛰는 경기는 흰색, 기한(~ 날짜)은 주황.
 */
export function SusWhat({ s }: { s: Suspension }) {
  const n = s.missed?.length ?? 0;
  return (
    <>
      <span className="sus__comp" style={{ ['--c' as string]: comp(s.competition).color }}><CompName k={s.competition} /></span>
      {n > 1
        ? <> <span className="sus__match">{n}경기</span> <span className="sus__until">~ {day(s.missed![n - 1].kickoffUtc)}</span></>
        : s.match ? <> <span className="sus__match">{when(s.match.kickoffUtc)}{s.opp ? ` vs ${s.opp}` : ''}</span></> : null}
    </>
  );
}

/** "퇴장 · 확정 · 11.8 복귀" — 사유(빨강) · 확정/예상(흐리게) · 복귀(초록) */
export function SusNote({ s }: { s: Suspension }) {
  const parts = susParts(s);
  return (
    <>
      <span className="sus__why">{parts.why}</span>
      <span className="sus__sep"> · </span>
      <span className="sus__conf">{parts.conf}</span>
      {parts.back && <><span className="sus__sep"> · </span><span className="sus__back">{parts.back}</span></>}
    </>
  );
}

/**
 * 상세·호버 카드의 징계 줄 — 폰에서 줄이 갈리지 않게 두 줄로 짧게.
 *   [레드] 출전 정지  La Liga 3경기 (~ 11.2)
 *          퇴장 · 확정 · 이후 미정
 * 대회마다 한 줄씩(리그 퇴장 + 챔스 누적이 동시에 걸릴 수 있다).
 * 정지 경기 수는 징계위원회가 정해 알 수 없다 — 날짜는 "못 뛰는 경기" 다.
 */
export function DisciplineLines({ d }: { d?: Discipline }) {
  if (!d || (!d.all.length && !d.risks.length)) return null;
  return (
    <>
      {d.all.map((s) => (
        <div className="pdis" data-kind="red" role="note" key={s.competition}>
          <i className="pdis__card" aria-hidden="true"><CardShape color="red" w={12} /></i>
          <div>
            <b>출전 정지</b>
            <span className="pdis__what"><SusWhat s={s} /></span>
            <small><SusNote s={s} /></small>
          </div>
        </div>
      ))}
      {d.risks.map((r) => (
        <div className="pdis" data-kind="yellow" role="note" key={r.competition}>
          <i className="pdis__card" aria-hidden="true"><CardShape color="yellow" w={12} /></i>
          <div>
            <b>경고 누적 주의</b>
            <span className="pdis__what"><CompName k={r.competition} /> {r.yellows}장</span>
            <small>1장 더 받으면 다음 {CARD_RULES[r.competition]?.name ?? '같은 대회'} 경기 정지</small>
          </div>
        </div>
      ))}
    </>
  );
}
