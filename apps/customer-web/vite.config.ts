import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// Firebase authorizes localhost, but does not automatically authorize the IP
// alias 127.0.0.1. Keep browser origins consistent before OAuth starts.
const localhostOrigin: Plugin = {
  name: 'localhost-oauth-origin',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const host = req.headers.host;
      if (host && /^127\.0\.0\.1(?::\d+)?$/.test(host)) {
        res.writeHead(302, { Location: `http://${host.replace('127.0.0.1', 'localhost')}${req.url || '/'}` });
        res.end(); return;
      }
      next();
    });
  },
};
export default defineConfig({
  plugins: [tailwindcss(), react(), localhostOrigin],
  server: {
    port: 3100,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4100',
        changeOrigin: true,
      },
    },
  },
});

