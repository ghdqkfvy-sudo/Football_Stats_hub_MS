import { useCallback, useEffect, useState } from 'react';
import { useClosing } from '../lib/motion';
import { TsdbCheck } from './TsdbCheck';
import { PhotoProbe } from './PhotoProbe';
import {
  JOBS, TOKEN_NEW_URL, REPO, clearToken, dispatch, getToken, latestRun, runLabel, setToken,
  type Outcome, type Run,
} from '../lib/dispatch';

const explain = (o: Outcome): string =>
  o === 'unauthorized' ? '토큰이 틀렸거나 만료됐습니다. 새 토큰을 넣어 주세요.'
    : o === 'forbidden' ? `토큰에 ${REPO} 저장소의 Actions 권한이 없습니다.`
      : '네트워크 오류 — 잠시 뒤 다시 시도해 주세요.';

/**
 * 숨은 "지금 갱신" 시트 — 머리줄의 갱신 시각 배지를 **길게 누르면** 열린다.
 * 평소 화면에는 아무 흔적도 없다(보는 사람에게는 필요 없는 기능이라서).
 *
 *  · 토큰이 없으면: 붙여 넣는 칸 + 만드는 방법
 *  · 토큰이 있으면: 빠른 갱신 / 전체 갱신 버튼과 각각의 최근 실행 상태
 * 수집이 끝나 새 데이터가 배포되면 앱의 자동 갱신이 알아서 받아 온다.
 */
export function RefreshSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [closing, close] = useClosing(onClose);
  const [token, setTok] = useState(getToken);
  const [draft, setDraft] = useState('');
  const [runs, setRuns] = useState<Record<string, Run | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);

  /** 최근 실행 상태를 모두 다시 읽는다. 토큰이 무효면 지우고 입력 화면으로 */
  const refreshRuns = useCallback(async (t: string) => {
    const res = await Promise.all(JOBS.map((j) => latestRun(t, j.file)));
    const bad = res.find((r) => r.outcome !== 'ok');
    if (bad && bad.outcome === 'unauthorized') {
      clearToken(); setTok(''); setMsg({ text: explain(bad.outcome), tone: 'bad' });
      return false;
    }
    if (bad) { setMsg({ text: explain(bad.outcome), tone: 'bad' }); return false; }
    setRuns(Object.fromEntries(JOBS.map((j, i) => [j.file, res[i].run])));
    return true;
  }, []);

  /* 열릴 때마다 상태를 새로 — 이펙트 본문에서 바로 setState 하지 않게 한 틱 미룬다 */
  useEffect(() => {
    if (!open || !token) return;
    const t = window.setTimeout(() => { void refreshRuns(token); }, 0);
    return () => window.clearTimeout(t);
  }, [open, token, refreshRuns]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const save = async () => {
    const t = draft.trim();
    if (!t) return;
    setBusy('save'); setMsg(null);
    const ok = await refreshRuns(t);
    setBusy(null);
    if (!ok) return;
    setToken(t); setTok(t); setDraft('');
    setMsg({ text: '토큰을 이 기기에 저장했습니다.', tone: 'ok' });
  };

  const run = async (file: string, eta: string) => {
    setBusy(file); setMsg(null);
    const o = await dispatch(token, file);
    if (o !== 'ok') {
      setBusy(null);
      if (o === 'unauthorized') { clearToken(); setTok(''); }
      setMsg({ text: explain(o), tone: 'bad' });
      return;
    }
    setMsg({ text: `요청했습니다 — ${eta} 뒤 화면에 반영됩니다.`, tone: 'ok' });
    /* GitHub 가 실행을 만드는 데 몇 초 걸린다 — 잠깐 뒤에 상태를 다시 본다 */
    window.setTimeout(() => { void refreshRuns(token).finally(() => setBusy(null)); }, 3500);
  };

  const forget = () => {
    clearToken(); setTok(''); setRuns({});
    setMsg({ text: '이 기기에서 토큰을 지웠습니다.', tone: 'ok' });
  };

  return (
    <div className="sheet rf" data-open={open} data-closing={closing || undefined} aria-hidden={!open}>
      <div className="sheet__scrim" onClick={close} />
      {open && (
        <div className="sheet__panel rf__panel" role="dialog" aria-modal="true" aria-label="데이터 지금 갱신">
          <div className="sheet__grab" />
          <h3 className="rf__title">데이터 지금 갱신</h3>
          <p className="rf__sub">ESPN 수집을 바로 실행합니다. 끝나면 앱이 자동으로 새 데이터를 받아 옵니다.</p>

          {token ? (
            <>
              <div className="rf__jobs">
                {JOBS.map((j) => {
                  const st = runLabel(runs[j.file] ?? null);
                  const running = st.tone === 'busy';
                  return (
                    <button
                      key={j.file}
                      className="rf__job"
                      disabled={busy !== null}
                      data-busy={busy === j.file || undefined}
                      onClick={() => run(j.file, j.eta)}
                    >
                      <span className="rf__jh">
                        <b>{j.label}</b>
                        <em>{j.eta}</em>
                      </span>
                      <span className="rf__jd">{j.desc}</span>
                      <span className="rf__js" data-tone={st.tone}>
                        <i aria-hidden="true" />
                        {runs[j.file] === undefined ? '상태 확인 중…' : st.text}
                        {running && runs[j.file]?.status === 'in_progress' && ' — 지금 누르면 끝난 뒤 한 번 더'}
                      </span>
                    </button>
                  );
                })}
              </div>
              {msg && <p className="rf__msg" data-tone={msg.tone}>{msg.text}</p>}
              <button className="rf__forget" onClick={forget}>이 기기에서 토큰 지우기</button>
            </>
          ) : (
            <>
              <label className="rf__label" htmlFor="rf-token">GitHub 토큰 (처음 한 번만)</label>
              <div className="rf__row">
                <input
                  id="rf-token"
                  className="rf__input"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="github_pat_…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
                />
                <button className="rf__save" disabled={!draft.trim() || busy !== null} onClick={save}>
                  {busy === 'save' ? '확인 중…' : '저장'}
                </button>
              </div>
              {msg && <p className="rf__msg" data-tone={msg.tone}>{msg.text}</p>}

              <details className="rf__how">
                <summary>토큰 만드는 방법</summary>
                <ol>
                  <li>
                    <a href={TOKEN_NEW_URL} target="_blank" rel="noreferrer">GitHub 토큰 만들기 화면</a>을 엽니다
                    (GitHub 로그인 필요).
                  </li>
                  <li><b>Token name</b>: 아무 이름 (예: <code>stats-hub-refresh</code>)</li>
                  <li><b>Expiration</b>: 원하는 기간 — 만료되면 이 화면이 다시 토큰을 묻습니다</li>
                  <li><b>Repository access</b>: Only select repositories → <code>{REPO.split('/')[1]}</code></li>
                  <li><b>Permissions</b> → Repository permissions → <b>Actions: Read and write</b> (나머지는 그대로)</li>
                  <li><b>Generate token</b> → 나온 <code>github_pat_…</code> 를 복사해 위 칸에 붙여 넣기</li>
                </ol>
                <p>토큰은 이 기기 브라우저에만 저장되고, 이 저장소의 수집 실행 말고는 할 수 있는 일이 없습니다.</p>
              </details>
            </>
          )}

          {/* 사진(컷아웃) 소스가 막혔는지 — GitHub 토큰 없이도 쓸 수 있다 */}
          <TsdbCheck />
          {/* 대안 사진 소스 시험 — 보기 전용(수집·데이터는 그대로) */}
          <PhotoProbe />

          <button className="rf__close" onClick={close}>닫기</button>
        </div>
      )}
    </div>
  );
}
