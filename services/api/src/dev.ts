// Watch mode must respect NODE_ENV supplied by the shell or .env.
process.env.NODE_ENV ??= 'development';
await import('./server.js');
export {};
