/* 앱 셸만 캐싱하는 최소 서비스워커.
   데이터(/api/*, /data/*)는 절대 캐싱하지 않는다 — 낡은 스코어를 보여주는 것이
   로딩 스피너보다 나쁘다. 네트워크 우선, 실패 시에만 셸을 돌려준다.

   GitHub Pages 프로젝트 페이지는 https://<user>.github.io/<repo>/ 처럼
   서브패스에서 서빙되므로 경로를 '/'로 하드코딩하지 않고
   registration.scope 에서 실제 베이스 경로를 읽어 쓴다. */
const SHELL = 'shell-v3';   /* 셸 파일이 바뀌면 올린다 — 낡은 캐시가 남지 않게 */
const BASE = new URL(self.registration.scope).pathname; // 예: '/' 또는 '/k-stats-hub/'
const ASSETS = [BASE, `${BASE}index.html`, `${BASE}manifest.webmanifest`];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === self.location.origin) {
    const rel = url.pathname.slice(BASE.length);
    if (rel.startsWith('api/') || rel.startsWith('data/')) return;
  }

  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match(`${BASE}index.html`)));
    return;
  }

  /* ⚠️ 매니페스트는 **항상 네트워크 먼저**.
     아래 같은 출처 규칙은 캐시 우선이라, 앱 아이콘을 바꿔도 이미 설치한
     사람에게는 캐시에 남은 옛 매니페스트가 계속 나갔다. 캐시 이름을
     올려야만 풀리는 건 고칠 때마다 잊기 좋은 조건이다. 오프라인일 때만
     캐시로 떨어진다. */
  if (url.origin === self.location.origin && url.pathname.endsWith('manifest.webmanifest')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request)),
    );
    return;
  }
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ??
          fetch(e.request).then((res) => {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(e.request, copy));
            return res;
          }),
      ),
    );
  }
});
