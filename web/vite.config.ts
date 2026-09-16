import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 프로젝트 페이지는 https://<user>.github.io/<repo>/ 형태라
  // 서브패스가 필요하다. 배포 워크플로우가 BASE_PATH 를 넣어 주고,
  // 로컬 개발(npm run dev/build)에서는 그냥 '/' 다.
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
})
