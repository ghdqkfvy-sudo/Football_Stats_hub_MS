import { useEffect, useMemo, useRef, useState } from 'react';
import type { Target } from '../config/targets';
import { loadNews, type Source } from '../lib/api';
import type { Article } from '../types/feedTypes';
import { kstShortDate, kstTime } from '../lib/kst';
import { useIsMobile } from '../lib/useMedia';
import { Swap } from '../components/Swap';
import { groupStories, type Story } from '../lib/newsGroup';

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

/* 처음 보여 줄 기사 수(대표 기사 포함). 한 팀 피드가 40건이라 전부 그리면
   폰에서 화면 18장 길이가 된다. 폰은 "더보기" 단추로, 넓은 화면은 목록 끝에
   닿으면 저절로 다음 묶음을 그린다. */
const MOBILE_PAGE = 12;
const DESKTOP_PAGE = 17;   // 대표 1 + 4열 × 4줄

/** 매체 이름 — ESPN 기사는 매체가 하나라 ESPN 으로 묶는다 */
const pubOf = (a: Article) => (a.source === 'ko' ? (a.publisher || '한국어') : 'ESPN');

export function NewsTab({ target }: { target: Target }) {
  const [rows, setRows] = useState<Article[] | null>(null);
  const [source, setSource] = useState<Source>('none');
  const [filter, setFilter] = useState<Filter>('ALL');
  /* "3시간 전" 의 기준 시각. 렌더 중에 Date.now() 를 부르면 같은 렌더가
     매번 다른 값을 내므로(순수하지 않다), 목록을 받은 그 순간으로 고정한다. */
  const [now, setNow] = useState(() => Date.now());
  const mobile = useIsMobile();
  const page = mobile ? MOBILE_PAGE : DESKTOP_PAGE;
  const [shown, setShown] = useState(MOBILE_PAGE);
  /* 매체 필터 ('' = 전체) */
  const [pub, setPub] = useState('');

  useEffect(() => {
    let alive = true;
    setRows(null);
    setShown(MOBILE_PAGE);
    setPub('');
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
    const byKind = filter === 'ALL' ? rows
      : filter === 'Media' ? rows.filter((x) => x.type === 'Media')
        : rows.filter((x) => x.source === filter);
    return pub ? byKind.filter((x) => pubOf(x) === pub) : byKind;
  }, [rows, filter, pub]);
  /* 같은 소식은 한 카드로 — 나머지 매체는 카드 아래 "같은 소식 N건" 에 */
  const stories = useMemo(() => groupStories(list), [list]);

  /* 매체 목록 — 기사 많은 순. 한 곳뿐이면 고를 게 없으니 그리지 않는다 */
  const pubs = useMemo(() => {
    const n = new Map<string, number>();
    for (const a of rows ?? []) n.set(pubOf(a), (n.get(pubOf(a)) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
  }, [rows]);

  /* 넓은 화면 — 목록 끝(보초)이 화면에 들어오면 다음 묶음 */
  const sentinel = useRef<HTMLDivElement>(null);
  const more = stories.length > shown;
  useEffect(() => {
    if (mobile || !more) return;
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setShown((n) => n + DESKTOP_PAGE);
    }, { rootMargin: '400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [mobile, more]);

  const hasKo = !!rows?.some((x) => x.source === 'ko');

  if (!rows) {
    return (
      <div className="page">
        <div className="skel" style={{ height: 96, borderRadius: 16 }} />
        <div className="skel" style={{ height: 420 }} />
      </div>
    );
  }

  const [lead, ...rest] = stories;
  /* 앞의 몇 건만 — 폰은 "더보기", 넓은 화면은 끝에 닿으면 저절로 */
  const restShown = rest.slice(0, Math.max(0, Math.max(shown, page) - 1));
  const hidden = rest.length - restShown.length;

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
            <button
              key={id}
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id);
                setShown(MOBILE_PAGE);
              }}
            >
              {label}
            </button>
          ))}
          {pubs.length > 1 && (
            <select
              className="nf__pub"
              aria-label="매체"
              value={pub}
              onChange={(e) => { setPub(e.target.value); setShown(MOBILE_PAGE); }}
            >
              <option value="">모든 매체</option>
              {pubs.map(([name, n]) => (
                <option key={name} value={name}>{name} ({n})</option>
              ))}
            </select>
          )}
          <span className="nf__count num">
            {list.length}건{stories.length < list.length && ` · ${stories.length}개 소식`}
          </span>
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

        {/* 필터를 바꾸면 목록이 한 번 페이드로 바뀐다 ("더보기" 로 늘어날 때는 그대로) */}
        <Swap k={`${filter}-${pub}`}>
        {lead && <StoryCard s={lead} now={now} lead />}

        {rest.length > 0 && (
          <div className="ngrid">
            {restShown.map((x) => (
              <StoryCard key={x.lead.id} s={x} now={now} />
            ))}
          </div>
        )}
        </Swap>

        {hidden > 0 && (mobile ? (
          <button className="nmore" onClick={() => setShown((n) => n + MOBILE_PAGE)}>
            기사 더보기 <span className="num">({hidden}건 남음)</span>
          </button>
        ) : (
          <div ref={sentinel} className="nmore nmore--auto" aria-hidden="true">
            기사 불러오는 중… <span className="num">({hidden}건 남음)</span>
          </div>
        ))}
      </section>
    </div>
  );
}

/**
 * 한 소식 = 대표 기사 카드 + (있으면) 같은 소식을 다룬 다른 매체 목록.
 * 카드는 통째로 링크(<a>)라 그 안에 다른 링크를 넣을 수 없다 — 목록은 카드 아래에 둔다.
 */
function StoryCard({ s, now, lead = false }: { s: Story; now: number; lead?: boolean }) {
  if (!s.related.length) return <Card a={s.lead} now={now} lead={lead} />;
  return (
    <div className="nstory" data-lead={lead}>
      <Card a={s.lead} now={now} lead={lead} />
      <details className="nrel">
        <summary>같은 소식 <span className="num">{s.related.length}</span>건 더</summary>
        <ul>
          {s.related.map((r) => (
            <li key={r.id}>
              <a href={r.href} target="_blank" rel="noreferrer noopener">
                <b>{pubOf(r)}</b>
                <span>{r.headline}</span>
                <em className="num">{ago(r.published, now)}</em>
              </a>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function Card({ a, now, lead = false }: { a: Article; now: number; lead?: boolean }) {
  const [imgOk, setImgOk] = useState(true);
  const desc = plainDesc(a);
  /* 사진이 없는 기사(한국어 구글 뉴스는 전부 그렇다)는 빈 16:9 상자를 그리지 않고
     글만 있는 카드로 — 목록의 절반이 빈 상자로 채워져 화면이 비어 보였다.
     영상은 ▶ 자리가 "영상" 이라는 정보라 상자를 남긴다. */
  const media = a.type === 'Media';
  const showPh = media || (!!a.image && imgOk);
  return (
    <a
      className="ncard"
      data-lead={lead}
      data-noimg={!showPh || undefined}
      href={a.href}
      target="_blank"
      rel="noreferrer noopener"
    >
      {showPh && (
        <div className="ncard__ph">
          {a.image && imgOk ? (
            <img src={a.image} alt="" loading="lazy" onError={() => setImgOk(false)} />
          ) : (
            <span className="ncard__noimg" aria-hidden="true">▶</span>
          )}
          {media && <span className="ncard__play" aria-hidden="true">▶</span>}
        </div>
      )}

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
