import type { Discipline } from '../lib/discipline';
import { CARD_RULES } from '../lib/discipline';
import { comp } from '../config/targets';
import { kstParts } from '../lib/kst';
import { CardGlyph } from './InjuryMark';

const REASON: Record<string, string> = { red: '퇴장', yellow: '경고 누적', fotmob: '징계' };

/**
 * 상세·호버 카드의 징계 줄.
 *  · 출전 정지: [레드] 출전 정지 · 프리미어리그 · 10.19 (일) vs Arsenal — 퇴장 · 확정/예상
 *  · 경고 위험: [옐로] 경고 누적 주의 · 챔스 2장 — 1장 더 받으면 다음 챔스 경기 정지
 * 정지 경기 수는 징계위원회가 정해 알 수 없다 — 날짜는 "못 뛰는 다음 경기" 다.
 */
export function DisciplineLines({ d }: { d?: Discipline }) {
  if (!d || (!d.sus && !d.risks.length)) return null;
  const s = d.sus;
  const when = (iso: string) => { const p = kstParts(iso); return `${p.month}.${p.date} (${p.weekdayKo})`; };
  return (
    <>
      {s && (
        <div className="pdis" data-kind="red" role="note">
          <i className="injb" aria-hidden="true"><CardGlyph color="red" size={11} /></i>
          <div>
            <b>출전 정지</b>
            <span className="pdis__what">
              {comp(s.competition).name}
              {(s.missed?.length ?? 0) > 1
                ? ` · ${s.missed!.length}경기 (${s.missed!.map((m) => when(m.kickoffUtc)).join(', ')})`
                : s.match ? ` · ${when(s.match.kickoffUtc)}${s.opp ? ` vs ${s.opp}` : ''}` : ''}
            </span>
            <small>
              {REASON[s.reason]}{s.yellows ? ` ${s.yellows}장` : ''} · {s.confirmed ? '확정(FotMob)' : '카드 기록으로 예상'}
              {s.back ? ` · ${when(s.back.kickoffUtc)} 경기부터 출전 가능` : s.confirmed ? ' · 이후 경기는 아직 미정' : ''}
              {s.ret ? ` · 복귀 예상 ${s.ret}` : ''}
            </small>
          </div>
        </div>
      )}
      {d.risks.map((r) => (
        <div className="pdis" data-kind="yellow" role="note" key={r.competition}>
          <i className="injb" aria-hidden="true"><CardGlyph color="yellow" size={11} /></i>
          <div>
            <b>경고 누적 주의</b>
            <span className="pdis__what">{CARD_RULES[r.competition]?.name ?? comp(r.competition).name} 경고 {r.yellows}장</span>
            <small>1장 더 받으면 다음 {CARD_RULES[r.competition]?.name ?? '같은 대회'} 경기 출전 정지</small>
          </div>
        </div>
      ))}
    </>
  );
}
