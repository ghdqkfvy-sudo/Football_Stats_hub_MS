import { useState } from 'react';
import { feed } from '../lib/feed';
import { findIds, findProps, fotmobImage, sofascoreImage, type ProbeIds, type ProbeProps } from '../lib/photoProbe';

/** 시험할 선수 — 코리안리거 전원 + 레알 마드리드 컷아웃 보유 선수 몇 명(지금 사진과 견주려고) */
interface Sample { name: string; label: string; photo?: string }
type Shot = 'loading' | 'ok' | 'fail' | 'none';

async function samples(): Promise<Sample[]> {
  const out: Sample[] = [];
  const ko = await feed('koreans.json').catch(() => null);
  for (const p of ko?.players ?? []) out.push({ name: String(p.name), label: String(p.nameKo || p.name), photo: p.photo });
  const rma = await feed('squad-real-madrid.json').catch(() => null);
  const cut = Object.values<any>(rma?.athletes ?? {}).filter((a) => a.photoKind === 'cutout').slice(0, 9);
  for (const a of cut) out.push({ name: String(a.name), label: String(a.name).split(' ').slice(-1)[0], photo: a.photo });
  return out;
}

/** 이미지 하나 — 실제로 뜨는지(onLoad/onError)를 그대로 판정에 쓴다 */
function Img({ src, onShot }: { src?: string; onShot: (s: Shot) => void }) {
  const [st, setSt] = useState<Shot>(src ? 'loading' : 'none');
  if (!src) return <span className="pp__img" data-st="none">–</span>;
  return (
    <span className="pp__img" data-st={st}>
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={(e) => {
          /* 1×1 같은 빈 그림(없는 선수)은 실패로 */
          const ok = e.currentTarget.naturalWidth > 8;
          setSt(ok ? 'ok' : 'fail'); onShot(ok ? 'ok' : 'fail');
        }}
        onError={() => { setSt('fail'); onShot('fail'); }}
      />
    </span>
  );
}

/**
 * 숨은 갱신 시트 — "사진 소스 비교 (시험)".
 * 보기 전용이다: 수집기·데이터 파일은 그대로라 지금 컷아웃은 바뀌지 않는다.
 */
export function PhotoProbe() {
  const [rows, setRows] = useState<(Sample & { ids?: ProbeIds; err?: string })[] | null>(null);
  const [props, setProps] = useState<ProbeProps | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [shots, setShots] = useState<Record<string, Shot>>({});
  const shot = (k: string) => (s: Shot) => setShots((m) => ({ ...m, [k]: s }));

  const run = async () => {
    setBusy(true); setNote(''); setShots({});
    try {
      const list = await samples();
      setRows(list);
      const pr = await findProps();
      setProps(pr);
      if (!pr.fotmob && !pr.sofascore) setNote('위키데이터에서 FotMob·SofaScore ID 속성을 찾지 못했습니다.');
      /* 위키데이터에 무리가 가지 않게 셋씩 */
      const out = [...list] as (Sample & { ids?: ProbeIds; err?: string })[];
      for (let i = 0; i < list.length; i += 3) {
        await Promise.all(list.slice(i, i + 3).map(async (s, j) => {
          try { out[i + j] = { ...s, ids: await findIds(s.name, pr) }; } catch (e) {
            out[i + j] = { ...s, err: e instanceof Error ? e.message : '오류' };
          }
        }));
        setRows([...out]);
      }
    } catch (e) {
      setNote(`시험 실패 — ${e instanceof Error ? e.message : String(e)} (위키데이터에 연결이 안 될 수 있음)`);
    }
    setBusy(false);
  };

  const n = rows?.length ?? 0;
  const count = (pre: string) => Object.entries(shots).filter(([k, v]) => k.startsWith(pre) && v === 'ok').length;
  const withId = (k: 'fotmob' | 'sofascore') => rows?.filter((r) => r.ids?.[k]).length ?? 0;

  return (
    <details className="rf__how pp">
      <summary>사진 소스 비교 (FotMob · SofaScore 시험)</summary>
      <p>보기 전용 — 지금 받아 둔 사진(컷아웃)은 바뀌지 않습니다. 선수 ID 는 위키데이터에서 찾습니다.</p>
      <button className="rf__save pp__run" disabled={busy} onClick={run}>{busy ? '시험 중…' : `시험 (선수 ${n || 30}명)`}</button>
      {note && <p className="tsc__sum">{note}</p>}

      {rows && (
        <>
          <p className="pp__sum num">
            지금 사진 <b>{count('cur:')}</b>/{n} · FotMob <b>{count('fm:')}</b>/{n} (ID {withId('fotmob')}) ·
            SofaScore <b>{count('ss:')}</b>/{n} (ID {withId('sofascore')})
            {props && <em> · 속성 {props.fotmob ?? '없음'} / {props.sofascore ?? '없음'}</em>}
          </p>
          <div className="pp__grid">
            <span className="pp__h">선수</span><span className="pp__h">지금</span>
            <span className="pp__h">FotMob</span><span className="pp__h">SofaScore</span>
            {rows.map((r, i) => (
              <div className="pp__row" key={`${r.name}-${i}`}>
                <span className="pp__nm" title={r.err ?? r.ids?.qid ?? ''}>
                  {r.label}
                  {r.ids && !r.ids.qid && <i>위키데이터 없음</i>}
                  {r.err && <i>오류</i>}
                </span>
                <Img src={r.photo} onShot={shot(`cur:${i}`)} />
                {r.ids === undefined && !r.err
                  ? <span className="pp__img" data-st="loading">…</span>
                  : <Img src={r.ids?.fotmob ? fotmobImage(r.ids.fotmob) : undefined} onShot={shot(`fm:${i}`)} />}
                {r.ids === undefined && !r.err
                  ? <span className="pp__img" data-st="loading">…</span>
                  : <Img src={r.ids?.sofascore ? sofascoreImage(r.ids.sofascore) : undefined} onShot={shot(`ss:${i}`)} />}
              </div>
            ))}
          </div>
        </>
      )}
    </details>
  );
}
