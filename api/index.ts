import { existsSync } from 'node:fs';
import { join } from 'node:path';

function preparePrismaEnvironment() {
  const cwd = process.cwd();

  // 1. Locate and set PRISMA_QUERY_ENGINE_LIBRARY if not already valid
  if (!process.env.PRISMA_QUERY_ENGINE_LIBRARY || !existsSync(process.env.PRISMA_QUERY_ENGINE_LIBRARY)) {
    const candidateEngineNames = [
      'libquery_engine-rhel-openssl-3.0.x.so.node',
      'libquery_engine-rhel-openssl-1.0.x.so.node',
      'libquery_engine-debian-openssl-3.0.x.so.node',
      'libquery_engine-debian-openssl-1.1.x.so.node',
      'query_engine-windows.dll.node',
    ];

    const candidateSearchDirs = [
      join(cwd, 'node_modules/.prisma/client'),
      join(cwd, 'node_modules/@prisma/client'),
      join(cwd, 'node_modules/prisma'),
      join(cwd, 'services/api/node_modules/.prisma/client'),
      join(cwd, 'services/api/node_modules/@prisma/client'),
      join(cwd, 'services/api/node_modules/prisma'),
      '/var/task/node_modules/.prisma/client',
      '/var/task/node_modules/@prisma/client',
      '/var/task/node_modules/prisma',
      '/var/task/services/api/node_modules/.prisma/client',
      '/var/task/services/api/node_modules/@prisma/client',
    ];

    for (const dir of candidateSearchDirs) {
      for (const name of candidateEngineNames) {
        const candidate = join(dir, name);
        try {
          if (existsSync(candidate)) {
            process.env.PRISMA_QUERY_ENGINE_LIBRARY = candidate;
            break;
          }
        } catch {}
      }
      if (process.env.PRISMA_QUERY_ENGINE_LIBRARY) break;
    }
  }

  // 2. Locate and set PRISMA_SCHEMA_PATH if not already valid
  if (!process.env.PRISMA_SCHEMA_PATH || !existsSync(process.env.PRISMA_SCHEMA_PATH)) {
    const candidateSchemas = [
      join(cwd, 'services/api/prisma/schema.prisma'),
      join(cwd, 'node_modules/.prisma/client/schema.prisma'),
      '/var/task/services/api/prisma/schema.prisma',
      '/var/task/node_modules/.prisma/client/schema.prisma',
      join(cwd, 'prisma/schema.prisma'),
    ];

    for (const schemaPath of candidateSchemas) {
      try {
        if (existsSync(schemaPath)) {
          process.env.PRISMA_SCHEMA_PATH = schemaPath;
          break;
        }
      } catch {}
    }
  }
}

preparePrismaEnvironment();

let appPromise: Promise<any> | null = null;

export default async function handler(req: any, res: any) {
  if (!appPromise) {
    appPromise = import('../services/api/dist/vercel.js').then((m) => m.default);
  }

  // Vercel rewrites: reconstruct proper path and query params for Express
  if (req.query && req.query.path !== undefined) {
    const rawPath = (Array.isArray(req.query.path) ? req.query.path[0] : String(req.query.path)).replace(/^\/+/, '');
    const qs = new URLSearchParams(req.query);
    qs.delete('path');
    const qsStr = qs.toString();
    req.url = '/' + rawPath + (qsStr ? `?${qsStr}` : '');
  } else if (req.headers && (req.headers['x-matched-path'] || req.headers['x-forwarded-uri'])) {
    const matched = String(req.headers['x-matched-path'] || req.headers['x-forwarded-uri']);
    if (matched && matched !== '/api') {
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      req.url = (matched.startsWith('/') ? matched : `/${matched}`) + qs;
    }
  }

  try {
    const app = await appPromise;
    return app(req, res);
  } catch (error) {
    // Keep details in the Vercel Function Log; returning internals to a browser
    // would disclose deployment and configuration information.
    console.error('VMOTIV_API_BOOT_FAILED', error);
    const message = error instanceof Error ? error.message : '';
    const diagnostic = `${message}\n${error instanceof Error ? error.stack || '' : ''}`;
    const code = message.includes('DATABASE_URL') ? 'DATABASE_URL_INVALID_OR_MISSING'
      : message.includes('WEB_ORIGIN') ? 'WEB_ORIGIN_INVALID_OR_MISSING'
        : message.includes('FIREBASE_PROJECT_ID') ? 'FIREBASE_PROJECT_ID_MISSING'
          : message.includes('EMAIL_') ? 'EMAIL_CONFIGURATION_INVALID'
            : diagnostic.includes('/config.') ? 'API_CONFIGURATION_INVALID'
              : diagnostic.includes('@prisma/client') || diagnostic.includes('PrismaClient') ? 'PRISMA_RUNTIME_STARTUP_FAILED'
                : diagnostic.includes('firebase-admin') || diagnostic.includes('Firebase') ? 'FIREBASE_RUNTIME_STARTUP_FAILED'
                  : diagnostic.includes('Cannot find module') || diagnostic.includes('ERR_MODULE_NOT_FOUND') ? 'API_RUNTIME_DEPENDENCY_MISSING'
                    : 'API_STARTUP_FAILED';
    return res.status(503).json({
      code,
      message,
      detail: diagnostic.split('\n').slice(0, 5).join('\n'),
    });
  }
}
