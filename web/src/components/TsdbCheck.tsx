import { useEffect, useState } from 'react';
import { feed } from '../lib/feed';
import { PUBLIC_KEYS, checkKey, maskKey, probeUrl, type KeyCheck, type KeyVerdict, type ServerTsdb } from '../lib/tsdbCheck';

const LABEL: Record<KeyVerdict, string> = {
  ok: '성공', limited: '일부', denied: '실패', blocked: '차단', error: '오류',
};
const TONE: Record<KeyVerdict, 'ok' | 'busy' | 'bad'> = {
  ok: 'ok', limited: 'busy', denied: 'bad', blocked: 'bad', error: 'bad',
};

/**
 * 숨은 갱신 시트 안의 "사진 소스 점검" — TheSportsDB 키 여러 개를 바로 시험한다.
 *
 *  · 이 기기에서 지금 시험: 공개 키(123 · 3) + 직접 넣은 키(유료 키를 사기 전/넣기 전에)
 *    직접 넣은 키는 저장하지 않는다 — 수집기에 쓰려면 저장소 Secret TSDB_KEY 에 넣는다
 *  · 수집 서버 최근 결과: 수집기가 마지막 느린 회차에 남긴 값(meta-slow.json 의 tsdb)
 * 두 결과가 다르면(여기선 되는데 서버는 실패) 서버 IP 가 막힌 것이다.
 */
export function TsdbCheck() {
  const [custom, setCustom] = useState('');
  const [rows, setRows] = useState<KeyCheck[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState<ServerTsdb | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    feed('meta-slow.json')
      .then((j) => { if (alive) setServer((j?.tsdb as ServerTsdb | undefined) ?? null); })
      .catch(() => { if (alive) setServer(null); });
    return () => { alive = false; };
  }, []);

  const run = async () => {
    setBusy(true);
    setRows(null);
    const keys = [...new Set([custom.trim(), ...PUBLIC_KEYS].filter(Boolean))];
    /* 한도에 걸리지 않게 하나씩 */
    const out: KeyCheck[] = [];
    for (const k of keys) {
      out.push(await checkKey(k));
      setRows([...out]);
    }
    setBusy(false);
  };

  const best = rows?.find((r) => r.verdict === 'ok') ?? rows?.find((r) => r.verdict === 'limited');

  return (
    <details className="rf__how tsc">
      <summary>사진 소스 점검 (TheSportsDB 키)</summary>

      <div className="tsc__srv">
        <span className="eyebrow">수집 서버 · 최근 회차</span>
        {server === undefined ? (
          <p>불러오는 중…</p>
        ) : server === null ? (
          <p>기록 없음 — 다음 전체 갱신부터 남습니다.</p>
        ) : (
          <>
            <p className="tsc__line" data-tone={server.key ? 'ok' : 'bad'}>
              <i aria-hidden="true" />
              {server.key ? `키 ${server.key} 사용` : '답하는 키 없음'}
              <em>{new Date(server.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</em>
            </p>
            <p className="tsc__sub">
              {server.tried.map((t) => `${t.key}: ${t.status}`).join(' · ')}
              {server.statuses && Object.keys(server.statuses).length > 0 && (
                <> · 응답 {Object.entries(server.statuses).map(([st, n]) => `${st}×${n}`).join(' · ')}</>
              )}
            </p>
            {!!server.gone?.length && (
              <p className="tsc__sub">이 키로 안 되는 기능(404): {server.gone.join(' · ')} — 건너뛰고 이름 검색으로 받습니다</p>
            )}
          </>
        )}
      </div>

      <span className="eyebrow">이 기기에서 지금 시험</span>
      <div className="rf__row tsc__row">
        <input
          className="rf__input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="유료 키 (비워 두면 공개 키 123 · 3 만)"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void run(); }}
        />
        <button className="rf__save" disabled={busy} onClick={run}>{busy ? '시험 중…' : '점검'}</button>
      </div>

      {rows && (
        <ul className="tsc__list">
          {rows.map((r) => (
            <li key={r.key} className="tsc__line" data-tone={TONE[r.verdict]}>
              <i aria-hidden="true" />
              <b>{maskKey(r.key)}</b>
              <span className="tsc__v">{LABEL[r.verdict]}</span>
              <em className="num">{r.ms}ms</em>
              <span className="tsc__d">
                {r.detail}
                {/* 공개 키만 — 유료 키를 주소창·방문 기록에 남기지 않는다 */}
                {PUBLIC_KEYS.includes(r.key) && (
                  <> · <a href={probeUrl(r.key)} target="_blank" rel="noreferrer">직접 열기</a></>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {rows && !busy && (
        <p className="tsc__sum">
          {best
            ? best.verdict === 'ok'
              ? `→ ${maskKey(best.key)} 키로 전체 로스터를 받을 수 있습니다.`
              : `→ ${maskKey(best.key)} 키는 되지만 로스터 일부만 줍니다(무료 키 제한).`
            : server?.key
              ? `→ 이 기기에서는 연결이 안 되지만, 수집 서버는 키 ${server.key} 로 연결됩니다 — 수집에는 문제없습니다.`
              : '→ 이 기기에서 되는 키가 없습니다.'}
          {best && server && !server.key && ' 수집 서버는 실패 중 — 서버 쪽이 막힌 것일 수 있습니다.'}
        </p>
      )}
      <p>직접 넣은 키는 저장하지 않습니다. 수집기에 쓰려면 저장소 Settings → Secrets → Actions 에 <code>TSDB_KEY</code> 로 넣으세요.</p>
    </details>
  );
}
