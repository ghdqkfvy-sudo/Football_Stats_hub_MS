import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 프로젝트 페이지는 https://<user>.github.io/<repo>/ 형태라
  // 서브패스가 필요하다. 배포 워크플로우가 BASE_PATH 를 넣어 주고,
  // 로컬 개발(npm run dev/build)에서는 그냥 '/' 다.
  base: process.env.BASE_PATH || '/',
  plugins: [
    react(),
    {
      /* 공유 미리보기(og:image)는 절대 주소여야 한다 — 배포가 SITE_URL 을 넣어 준다.
         없으면(로컬) 상대 주소로 떨어진다: 미리보기만 안 뜰 뿐 화면은 그대로다. */
      name: 'site-url',
      transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', (process.env.SITE_URL || process.env.BASE_PATH || '/').replace(/\/?$/, '/')),
    },
  ],
})
