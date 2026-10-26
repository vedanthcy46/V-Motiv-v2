let appPromise: Promise<any> | null = null;

export default async function handler(req: any, res: any) {
  if (!appPromise) {
    appPromise = import('../services/api/dist/vercel.js').then((m) => m.default);
  }

  // Vercel rewrites /api/v1/foo → /api?path=v1%2Ffoo
  // Reconstruct the proper URL so Express can route it correctly.
  if (req.query && req.query.path) {
    const pathValue = Array.isArray(req.query.path) ? req.query.path[0] : req.query.path;
    const qs = new URLSearchParams(req.query);
    qs.delete('path');
    const qsStr = qs.toString();
    req.url = '/api/' + pathValue + (qsStr ? `?${qsStr}` : '');
  }

  try {
    const app = await appPromise;
    return app(req, res);
  } catch (error) {
    // Keep details in the Vercel Function Log; returning internals to a browser
    // would disclose deployment and configuration information.
    console.error('VMOTIV_API_BOOT_FAILED', error);
    const message = error instanceof Error ? error.message : '';
    const code = message.includes('DATABASE_URL') ? 'DATABASE_URL_INVALID_OR_MISSING'
      : message.includes('WEB_ORIGIN') ? 'WEB_ORIGIN_INVALID_OR_MISSING'
        : message.includes('FIREBASE_PROJECT_ID') ? 'FIREBASE_PROJECT_ID_MISSING'
          : message.includes('EMAIL_') ? 'EMAIL_CONFIGURATION_INVALID'
            : 'API_STARTUP_FAILED';
    return res.status(503).json({ code });
  }
}
