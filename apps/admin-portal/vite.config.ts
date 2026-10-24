import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const localhostOrigin: Plugin = {
  name: 'localhost-oauth-origin',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const host = req.headers.host;
      if (host && /^127\.0\.0\.1(?::\d+)?$/.test(host)) {
        res.writeHead(302, { Location: `http://${host.replace('127.0.0.1', 'localhost')}${req.url || '/'}` });
        res.end();
        return;
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), localhostOrigin],
  publicDir: '../customer-web/public',
  server: {
    port: 3200,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:4100', changeOrigin: true } },
  },
});
