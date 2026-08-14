import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  root: 'apps/dashboard',
  plugins: [react(), tsconfigPaths()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173 },
});
