import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // 백엔드 서버 주소
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''), // 필요에 따라 경로 재작성
      },
    },
  },
});
