import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  build: { target: 'es2022' },
  server: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:8222', '/identity': 'http://127.0.0.1:8222' } },
  test: { environment: 'node' }
});
