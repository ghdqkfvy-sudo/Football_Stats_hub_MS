import { useEffect, useMemo, useState } from 'react';
import type { Target } from '../config/targets';
import { loadNews, type Source } from '../lib/api';
import type { Article } from '../types/feedTypes';
import { kstShortDate, kstTime } from '../lib/kst';

const KIND: Record<string, string> = {
  HeadlineNews: '뉴스',
  Story: '기사',
  Media: '영상',
  Recap: '리뷰',
  Preview: '프리뷰',
};

/** 며칠 전인지 — 목록에서 최신성을 바로 읽게 한다 */
function ago(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const m = Math.floor((now - t) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return kstShortDate(iso);
}

/**
 * 기사 설명을 글자로만. 예전 스냅샷의 구글 뉴스 설명에는 HTML 조각
 * (`<a href="https://news.google.com/…`)이 220자에서 잘린 채 들어 있어
 * 화면에 주소가 그대로 찍혔다. 스냅샷도 고쳤지만, 이미 받아 둔 피드와
 * 실시간 프록시 응답을 위해 그리기 직전에 한 번 더 걸러 낸다.
 * 제목과 같은 말로 시작하면(구글 설명 = 제목 + 매체명) 보여 주지 않는다.
 */
function plainDesc(a: Article): string {
  const d = (a.description ?? '')
    .replace(/<[^>]*(>|$)/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!d || d === a.headline) return '';
  if (d.startsWith(a.headline.slice(0, 20))) return '';
  return d;
}

type Filter = 'ALL' | 'ko' | 'espn' | 'Media';

export function NewsTab({ target }: { target: Target }) {
  const [rows, setRows] = useState<Article[] | null>(null);
  const [source, setSource] = useState<Source>('none');
  const [filter, setFilter] = useState<Filter>('ALL');
  /* "3시간 전" 의 기준 시각. 렌더 중에 Date.now() 를 부르면 같은 렌더가
     매번 다른 값을 내므로(순수하지 않다), 목록을 받은 그 순간으로 고정한다. */
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    setRows(null);
    const league = target.league ?? target.competitions[0];
    loadNews(league, target.espnTeamId, target.newsQuery).then((r) => {
      if (!alive) return;
      setRows(r.data);
      setSource(r.source);
      setNow(Date.now());
    });
    return () => {
      alive = false;
    };
  }, [target]);

  const list = useMemo(() => {
    if (!rows) return [];
    if (filter === 'ALL') return rows;
    if (filter === 'Media') return rows.filter((x) => x.type === 'Media');
    return rows.filter((x) => x.source === filter);
  }, [rows, filter]);

  const hasKo = !!rows?.some((x) => x.source === 'ko');

  if (!rows) {
    return (
      <div className="page">
        <div className="skel" style={{ height: 96, borderRadius: 16 }} />
        <div className="skel" style={{ height: 420 }} />
      </div>
    );
  }

  const [lead, ...rest] = list;

  return (
    <div className="page">
      <section>
        <div className="sec__head">
          <h2 className="sec__title">뉴스</h2>
          <span className="sec__note">
            {source === 'live'
              ? `ESPN${hasKo ? ' · 한국어 뉴스' : ''} 실시간 피드`
              : source === 'feed'
                ? `자동 갱신 피드${hasKo ? ' · 한국어 포함' : ''}`
                : '데이터를 불러오지 못했습니다'}
          </span>
        </div>

        <nav className="nf" aria-label="뉴스 필터">
          {([
            ['ALL', '전체'],
            ['ko', '한국어'],
            ['espn', 'ESPN'],
            ['Media', '영상'],
          ] as const).map(([id, label]) => (
            <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
          <span className="nf__count num">{list.length}건</span>
        </nav>

        {!list.length && (
          <div className="empty">
            <h3>해당 조건의 기사가 없습니다</h3>
            <p>
              뉴스는 ESPN 팀 피드와 한국어 구글 뉴스를 합쳐서 보여 줍니다.
              프록시나 정적 피드 중 하나는 연결되어 있어야 합니다.
            </p>
          </div>
        )}

        {lead && <Card a={lead} now={now} lead />}

        {rest.length > 0 && (
          <div className="ngrid">
            {rest.map((x) => (
              <Card key={x.id} a={x} now={now} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ a, now, lead = false }: { a: Article; now: number; lead?: boolean }) {
  const [imgOk, setImgOk] = useState(true);
  const desc = plainDesc(a);
  return (
    <a className="ncard" data-lead={lead} href={a.href} target="_blank" rel="noreferrer noopener">
      <div className="ncard__ph">
        {a.image && imgOk ? (
          <img src={a.image} alt="" loading="lazy" onError={() => setImgOk(false)} />
        ) : (
          <span className="ncard__noimg" aria-hidden="true">
            {a.type === 'Media' ? '▶' : '“”'}
          </span>
        )}
        {a.type === 'Media' && <span className="ncard__play" aria-hidden="true">▶</span>}
      </div>

      <div className="ncard__body">
        <div className="ncard__meta">
          <span className="ncard__kind" data-ko={a.source === 'ko'}>
            {a.source === 'ko' ? (a.publisher || '한국어') : KIND[a.type] ?? a.type}
          </span>
          <span className="ncard__when num">{ago(a.published, now)}</span>
          {lead && a.published && (
            <span className="ncard__abs num">
              {kstShortDate(a.published)} {kstTime(a.published)} KST
            </span>
          )}
        </div>
        <h3 className="ncard__h">{a.headline}</h3>
        {desc && <p className="ncard__d">{desc}</p>}
        {a.byline && <span className="ncard__by">{a.byline}</span>}
      </div>
    </a>
  );
}
