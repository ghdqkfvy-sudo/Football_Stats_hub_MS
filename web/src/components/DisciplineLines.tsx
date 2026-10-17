import type { Discipline, Suspension } from '../lib/discipline';
import { CARD_RULES, susNote } from '../lib/discipline';
import { comp, mobileName } from '../config/targets';
import { kstParts } from '../lib/kst';
import { CardGlyph } from './InjuryMark';

const when = (iso: string) => { const p = kstParts(iso); return `${p.month}.${p.date} (${p.weekdayKo})`; };
const day = (iso: string) => { const p = kstParts(iso); return `${p.month}.${p.date}`; };

/** 대회 이름 — 데스크톱은 전체, 폰은 약칭(EPL · UCL) */
export function CompName({ k }: { k: string }) {
  return <><span className="m-full">{comp(k).name}</span><span className="m-short">{mobileName(k)}</span></>;
}

/** "La Liga 3경기 (~ 11.2)" · "EPL 10.19 (월) vs Arsenal" */
export function SusWhat({ s }: { s: Suspension }) {
  const n = s.missed?.length ?? 0;
  return (
    <>
      <CompName k={s.competition} />
      {n > 1
        ? ` ${n}경기 (~ ${day(s.missed![n - 1].kickoffUtc)})`
        : s.match ? ` ${when(s.match.kickoffUtc)}${s.opp ? ` vs ${s.opp}` : ''}` : ''}
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
          <i className="injb" aria-hidden="true"><CardGlyph color="red" size={11} /></i>
          <div>
            <b>출전 정지</b>
            <span className="pdis__what"><SusWhat s={s} /></span>
            <small>{susNote(s)}</small>
          </div>
        </div>
      ))}
      {d.risks.map((r) => (
        <div className="pdis" data-kind="yellow" role="note" key={r.competition}>
          <i className="injb" aria-hidden="true"><CardGlyph color="yellow" size={11} /></i>
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
