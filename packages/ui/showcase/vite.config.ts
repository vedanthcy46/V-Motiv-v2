import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Living style guide for the shared design system: `npm run showcase -w @vmotiv/ui`
export default defineConfig({
  root: __dirname,
  publicDir: '../../../apps/sales-portal/public',
  plugins: [tailwindcss(), react()],
  server: { port: 3900, strictPort: true },
  build: { outDir: '../dist-showcase', emptyOutDir: true },
});
