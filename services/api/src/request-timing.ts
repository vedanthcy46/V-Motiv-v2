// Finds slow endpoints from real traffic. Every request is timed; one that takes longer than the threshold is logged with its method, route
// pattern (never the real path, so ids and tokens stay out of the log), status and time. Nothing else is recorded, and a request is never
// delayed or changed by this.
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export interface RequestTimingOptions {
  /** Requests at or above this many milliseconds are logged. 0 turns the middleware off. */
  slowMs: number;
  log?: (line: string) => void;
  /** Milliseconds, from a monotonic clock. Replaceable for tests. */
  now?: () => number;
}

/** The route as written in the code ("/customer/scrap/requests/:id"), or a generic label when no route matched. */
export function routeLabel(req: Pick<Request, 'method' | 'baseUrl' | 'route'> & { route?: { path?: unknown } }): string {
  const path = typeof req.route?.path === 'string' ? req.route.path : null;
  return `${req.method} ${path !== null ? `${req.baseUrl ?? ''}${path}` : '(no route)'}`;
}

export function requestTiming(options: RequestTimingOptions): RequestHandler {
  const log = options.log ?? ((line: string) => console.warn(line));
  const now = options.now ?? (() => Number(process.hrtime.bigint()) / 1e6);
  if (options.slowMs <= 0) return (_req, _res, next) => next();
  return (req: Request, res: Response, next: NextFunction) => {
    const started = now();
    res.once('finish', () => {
      const ms = Math.round(now() - started);
      if (ms >= options.slowMs) log(`[SLOW_REQUEST] ${routeLabel(req as never)} ${res.statusCode} ${ms}ms`);
    });
    next();
  };
}

/** Reads a non-negative whole number from an environment value, or returns the fallback. */
export function milliseconds(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/** A database query log line: how long it took and the statement text. Parameter values are never included (they can hold personal data). */
export function slowQueryLine(event: { duration: number; query: string }, slowMs: number): string | null {
  if (slowMs <= 0 || event.duration < slowMs) return null;
  const statement = event.query.replace(/\s+/g, ' ').trim();
  return `[SLOW_QUERY] ${event.duration}ms ${statement.length > 300 ? `${statement.slice(0, 300)}…` : statement}`;
}
