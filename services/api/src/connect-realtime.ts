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
  const allowed = (process.env.REALTIME_ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const io = new Server(http, {
    cors: {
      origin: allowed.length ? allowed : '*',
      methods: ['GET', 'POST'],
      credentials: true,
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

  const roomSignals = new Map<string, Array<{ from: 'OWNER' | 'VISITOR'; message: unknown; at: number }>>();

  io.on('connection', socket => {
    const ticket = socket.data.ticket as Ticket;
    const room = `connect:${ticket.callSessionId}`;
    socket.join(room);

    // Replay any buffered signals from the other party so late-joining peers (like the owner picking up) receive OFFER and ICE candidates immediately
    const existing = roomSignals.get(room) || [];
    for (const item of existing) {
      if (item.from !== ticket.role) {
        socket.emit('webrtc:signal', { from: item.from, message: item.message });
      }
    }

    // Notify existing peer in the room that a participant joined
    socket.to(room).emit('peer:joined', { from: ticket.role });

    socket.on('call:ready', () => {
      // Broadcast ready event so caller can re-send OFFER if needed
      socket.to(room).emit('call:ready', { from: ticket.role });
    });

    socket.on('webrtc:signal', (message: unknown) => {
      // Buffer signals in memory for late joiners (keep last 40 signals, max 15 mins)
      const list = roomSignals.get(room) || [];
      list.push({ from: ticket.role, message, at: Date.now() });
      if (list.length > 50) list.shift();
      roomSignals.set(room, list);

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
      roomSignals.delete(room);
      socket.to(room).emit('call:hangup', { from: ticket.role });
    });

    socket.on('disconnect', () => {
      socket.to(room).emit('peer:left', { from: ticket.role });
    });
  });

  return io;
}

/** Persistent Socket.IO host for private V MOTIV Connect calls and chat. Listen on 0.0.0.0 and process.env.PORT for Render/cloud hosts. */
export function startConnectRealtimeServer(port = Number(process.env.PORT || process.env.REALTIME_PORT || 4300)) {
  const host = '0.0.0.0';
  const http = createServer((req, res) => {
    if (req.url === '/' || req.url === '/health' || req.url === '/healthz') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ status: 'HEALTHY', service: 'vmotiv-connect-realtime', port }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  attachConnectRealtime(http);
  http.listen(port, host, () => {
    console.info(`V MOTIV Connect realtime server listening on ${host}:${port}`);
  });
  return http;
}

if (process.argv[1]?.includes('connect-realtime.')) startConnectRealtimeServer();
