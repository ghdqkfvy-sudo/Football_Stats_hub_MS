import { TARGETS } from '../config/targets';
import { setPrefs, usePrefs } from '../lib/prefs';
import { useClosing } from '../lib/motion';
import { ChipCrest } from './Crest';

/**
 * 관심 팀 설정 — Summary 에 보일 팀과 앱을 열 때의 첫 화면(lib/prefs.ts).
 * 바꾸는 즉시 저장되고 Summary 가 다시 그려진다. "저장" 단추는 없다.
 */
export function PrefsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prefs = usePrefs();
  const [closing, close] = useClosing(onClose);
  const on = new Set(prefs.teams ?? TARGETS.map((t) => t.id));
  const toggle = (id: string) => {
    const next = new Set(on);
    if (next.has(id)) next.delete(id); else next.add(id);
    if (next.size === 0) return;   // 마지막 한 팀은 끌 수 없다 — 빈 Summary 는 고장처럼 보인다
    const teams = TARGETS.map((t) => t.id).filter((x) => next.has(x));
    setPrefs({ ...prefs, teams: teams.length === TARGETS.length ? null : teams });
  };

  return (
    <div className="sheet rf" data-open={open} data-closing={closing || undefined} aria-hidden={!open}>
      <div className="sheet__scrim" onClick={close} />
      {open && (
        <div className="sheet__panel rf__panel" role="dialog" aria-modal="true" aria-label="관심 팀 설정">
          <div className="sheet__grab" />
          <h3 className="rf__title">관심 팀 설정</h3>
          <p className="rf__sub">Summary 에 보일 팀을 고릅니다. 끈 팀도 위쪽 팀 줄에서는 언제든 열 수 있습니다.</p>

          <div className="prefs__teams" role="group" aria-label="Summary 에 보일 팀">
            {TARGETS.map((t) => (
              <button
                key={t.id}
                className="prefs__team"
                role="switch"
                aria-checked={on.has(t.id)}
                onClick={() => toggle(t.id)}
              >
                <ChipCrest src={t.crest} teamId={t.espnTeamId} abbr={t.abbr} dark={t.darkCrest} />
                <span>{t.name}</span>
                <i aria-hidden="true" />
              </button>
            ))}
          </div>

          <label className="rf__label" htmlFor="prefs-start">앱을 열 때</label>
          <select
            id="prefs-start"
            className="prefs__start"
            value={prefs.start}
            onChange={(e) => setPrefs({ ...prefs, start: e.target.value })}
          >
            <option value="last">마지막으로 본 화면</option>
            <option value="summary">Summary</option>
            {TARGETS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <p className="prefs__note">이 기기 브라우저에만 저장됩니다. 링크로 연 화면은 이 설정보다 먼저입니다.</p>

          <button className="rf__close" onClick={close}>닫기</button>
        </div>
      )}
    </div>
  );
}
