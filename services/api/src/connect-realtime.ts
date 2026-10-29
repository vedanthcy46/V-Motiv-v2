import { createServer, type Server as HttpServer } from 'node:http';
import crypto from 'node:crypto';
import { Server } from 'socket.io';

export type Ticket = { callSessionId: string; role: 'OWNER' | 'VISITOR'; exp: number };
const secret = () => process.env.CONNECT_REALTIME_SECRET || process.env.CONNECT_WEBHOOK_SECRET || 'vmotiv_connect_realtime_secret_default';

export function issueRealtimeTicket(ticket: Ticket): string {
  const s = secret();
  const body = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  const signature = crypto.createHmac('sha256', s).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyRealtimeTicket(value: unknown): Ticket | null {
  const s = secret();
  if (typeof value !== 'string' || !s) return null;
  const [body, signature] = value.split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', s).update(body).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const ticket = JSON.parse(Buffer.from(body, 'base64url').toString()) as Ticket;
    return ticket.exp > Date.now() && /^[0-9a-f-]{36}$/i.test(ticket.callSessionId) ? ticket : null;
  } catch {
    return null;
  }
}

/** Attach Socket.IO to an existing HTTP server (e.g. the primary Express server) */
export function attachConnectRealtime(http: HttpServer) {
  const io = new Server(http, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  io.use((socket, next) => {
    const rawTicket = socket.handshake.auth?.ticket || (socket.handshake.query?.ticket as string | undefined);
    const ticket = verifyRealtimeTicket(rawTicket);
    if (!ticket) return next(new Error('UNAUTHORIZED'));
    socket.data.ticket = ticket;
    next();
  });

  io.on('connection', socket => {
    const ticket = socket.data.ticket as Ticket;
    const room = `connect:${ticket.callSessionId}`;
    socket.join(room);

    // Notify existing peer in the room that a participant joined
    socket.to(room).emit('peer:joined', { from: ticket.role });

    socket.on('webrtc:signal', (message: unknown) => {
      socket.to(room).emit('webrtc:signal', { from: ticket.role, message });
    });

    socket.on('chat:message', (message: unknown) => {
      socket.to(room).emit('chat:message', {
        from: ticket.role,
        message,
        sentAt: new Date().toISOString(),
      });
    });

    socket.on('call:hangup', () => {
      socket.to(room).emit('call:hangup', { from: ticket.role });
    });

    socket.on('disconnect', () => {
      socket.to(room).emit('peer:left', { from: ticket.role });
    });
  });

  return io;
}

/** Persistent Socket.IO host for private V MOTIV Connect calls and chat. Do not deploy this to Vercel functions. */
export function startConnectRealtimeServer(port = Number(process.env.REALTIME_PORT || 4300)) {
  const http = createServer();
  attachConnectRealtime(http);
  http.listen(port, () => console.info(`V MOTIV Connect realtime server listening on :${port}`));
  return http;
}

if (process.argv[1]?.includes('connect-realtime.')) startConnectRealtimeServer();
