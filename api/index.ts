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

  const app = await appPromise;
  return app(req, res);
}
