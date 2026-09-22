import { defineConfig } from 'vite';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  server: {
    port: 3000,
    host: true
  },
  plugins: [
    {
      name: 'serve-web-in-dev',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const rawUrl = req.url || '';
          const url = rawUrl.split('?')[0];

          if (url.startsWith('/css/')) {
            const filePath = join(__dirname, 'web', url);
            if (existsSync(filePath)) {
              res.setHeader('Content-Type', 'text/css; charset=utf-8');
              createReadStream(filePath).pipe(res);
              return;
            }
          }
          if (url.startsWith('/js/')) {
            const filePath = join(__dirname, 'web', url);
            if (existsSync(filePath)) {
              res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
              createReadStream(filePath).pipe(res);
              return;
            }
          }
          if (url.startsWith('/brand/')) {
            const filePath = join(__dirname, 'public', url);
            if (existsSync(filePath)) {
              if (url.endsWith('.svg')) res.setHeader('Content-Type', 'image/svg+xml');
              else if (url.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
              else if (url.endsWith('.ico')) res.setHeader('Content-Type', 'image/x-icon');
              createReadStream(filePath).pipe(res);
              return;
            }
          }
          if (url.startsWith('/fonts/')) {
            const filePath = join(__dirname, 'web', url);
            if (existsSync(filePath)) {
              res.setHeader('Content-Type', 'font/woff2');
              createReadStream(filePath).pipe(res);
              return;
            }
          }
          if (url === '/web' || url === '/web/' || url.startsWith('/web/')) {
            let rel = url.replace(/^\/web\/?/, '');
            if (!rel || rel.endsWith('/')) rel += 'index.html';
            const htmlPath = join(__dirname, 'web', rel);
            if (existsSync(htmlPath)) {
              let html = readFileSync(htmlPath, 'utf8')
                .replaceAll('{{VERSION}}', pkg.version)
                .replaceAll('{{INSTALLER_SIZE_MB}}', '18,5');
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.end(html);
              return;
            }
          }
          next();
        });
      }
    }
  ],
  build: {
    outDir: 'dist',
    target: 'esnext'
  }
});

