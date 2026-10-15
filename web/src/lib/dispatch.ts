/**
 * 숨은 "지금 갱신" — 데이터 수집 액션(GitHub Actions)을 앱에서 바로 실행한다.
 *
 * 사이트는 서버 없는 정적 페이지라, 액션을 돌릴 권한(토큰)을 코드에 넣으면
 * 누구나 볼 수 있다. 그래서 토큰은 **그 기기에만** 저장한다(localStorage —
 * 앱을 껐다 켜도 남는다). 토큰은 이 저장소의 Actions 권한만 가진
 * fine-grained 토큰을 쓴다 — 새어 나가도 할 수 있는 일은 수집 실행뿐이다.
 */

/** 저장소 — 배포 워크플로우가 VITE_GH_REPO 로 넣어 준다(포크해도 그대로 동작) */
export const REPO = String(import.meta.env.VITE_GH_REPO || 'ghdqkfvy-sudo/Football_Stats_hub_MS');

export interface Job {
  file: string;
  label: string;
  desc: string;
  eta: string;
}

export const JOBS: Job[] = [
  { file: 'snapshot.yml', label: '빠른 갱신', desc: '팀 일정·경기 결과·뉴스', eta: '약 10분' },
  { file: 'snapshot-leagues.yml', label: '전체 갱신', desc: '순위·스쿼드·코리안리거·Future', eta: '약 20분' },
];

/** 토큰 만드는 화면 — 이름·저장소·권한을 고르는 GitHub 페이지 */
export const TOKEN_NEW_URL = 'https://github.com/settings/personal-access-tokens/new';

const KEY = 'msh:gh-token';

export function getToken(): string {
  try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; }
}
export function setToken(t: string): void {
  try { localStorage.setItem(KEY, t.trim()); } catch { /* 저장 불가 — 이번 화면에서만 쓴다 */ }
}
export function clearToken(): void {
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
}

export type Outcome = 'ok' | 'unauthorized' | 'forbidden' | 'error';

/** HTTP 상태 → 화면에서 갈라 쓸 결과 */
export function outcomeOf(status: number): Outcome {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401) return 'unauthorized';          // 토큰이 틀렸거나 만료
  if (status === 403 || status === 404) return 'forbidden';   // 이 저장소·Actions 권한이 없다
  return 'error';
}

const api = (path: string, token: string, init?: RequestInit) =>
  fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
  });

/** 수집 액션 실행 (main 브랜치) */
export async function dispatch(token: string, file: string): Promise<Outcome> {
  try {
    const r = await api(`/actions/workflows/${file}/dispatches`, token, {
      method: 'POST', body: JSON.stringify({ ref: 'main' }),
    });
    return outcomeOf(r.status);
  } catch {
    return 'error';
  }
}

export interface Run {
  status: string;          // queued · in_progress · completed …
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 그 액션의 가장 최근 실행 — 토큰 확인도 겸한다 */
export async function latestRun(token: string, file: string): Promise<{ outcome: Outcome; run: Run | null }> {
  try {
    const r = await api(`/actions/workflows/${file}/runs?per_page=1`, token);
    const outcome = outcomeOf(r.status);
    if (outcome !== 'ok') return { outcome, run: null };
    const j = await r.json();
    const x = j?.workflow_runs?.[0];
    return {
      outcome,
      run: x ? {
        status: String(x.status ?? ''),
        conclusion: x.conclusion ?? null,
        createdAt: String(x.created_at ?? ''),
        updatedAt: String(x.updated_at ?? ''),
      } : null,
    };
  } catch {
    return { outcome: 'error', run: null };
  }
}

/** 최근 실행 한 줄 — "실행 중 · 3분째" / "완료 · 12분 전" / "실패 · 1시간 전" */
export function runLabel(run: Run | null, now = Date.now()): { text: string; tone: 'busy' | 'ok' | 'bad' | 'idle' } {
  if (!run) return { text: '실행 기록 없음', tone: 'idle' };
  const mins = (iso: string) => Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  const ago = (iso: string) => {
    const m = mins(iso);
    return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.floor(m / 60)}시간 전` : `${Math.floor(m / 1440)}일 전`;
  };
  if (run.status === 'in_progress') return { text: `실행 중 · ${mins(run.createdAt)}분째`, tone: 'busy' };
  if (run.status !== 'completed') return { text: '대기 중', tone: 'busy' };
  if (run.conclusion === 'success') return { text: `완료 · ${ago(run.updatedAt)}`, tone: 'ok' };
  if (run.conclusion === 'cancelled') return { text: `취소됨 · ${ago(run.updatedAt)}`, tone: 'idle' };
  return { text: `실패 · ${ago(run.updatedAt)}`, tone: 'bad' };
}
