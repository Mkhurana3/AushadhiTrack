import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` makes the GitHub Pages site. `npm run build:single` makes one self-contained HTML file for previews.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', chunkSizeWarningLimit: 1200 },
  test: { environment: 'node' },
}));
