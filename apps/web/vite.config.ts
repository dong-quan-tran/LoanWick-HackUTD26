import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => ({ plugins: [react()], define: { 'import.meta.env.VITE_DATA_MODE': JSON.stringify(mode === 'live' ? 'live' : 'fixture') }, server: { port: 5173, strictPort: true }, build: { sourcemap: false, outDir: mode === 'live' ? 'dist-live' : 'dist' } }));
