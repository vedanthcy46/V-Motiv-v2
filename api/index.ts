let appPromise: Promise<any> | null = null;

export default async function handler(req: any, res: any) {
  if (!appPromise) {
    appPromise = import('../services/api/dist/vercel.js').then((m) => m.default);
  }
  const app = await appPromise;
  return app(req, res);
}
