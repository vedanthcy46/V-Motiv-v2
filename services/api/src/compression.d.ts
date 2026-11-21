declare module 'compression' {
  import type { RequestHandler } from 'express';
  /** Response compression middleware. Only the options this service uses are described. */
  export default function compression(options?: { threshold?: number | string; level?: number }): RequestHandler;
}
