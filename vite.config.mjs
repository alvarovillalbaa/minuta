import { defineConfig } from 'vite';
export default defineConfig({ worker: { format: 'es' }, build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 0 }, server: { host: '127.0.0.1' } });
