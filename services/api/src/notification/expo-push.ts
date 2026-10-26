export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  badge?: number;
  channelId?: string;
  categoryId?: string;
  ttl?: number;
}

export interface ExpoPushSuccessTicket {
  status: 'ok';
  id: string;
}

export interface ExpoPushErrorTicket {
  status: 'error';
  message: string;
  details?: {
    error?:
      | 'DeviceNotRegistered'
      | 'MessageTooBig'
      | 'MessageRateExceeded'
      | 'MismatchSenderId'
      | 'InvalidCredentials'
      | string;
  };
}

export type ExpoPushTicketResponse = ExpoPushSuccessTicket | ExpoPushErrorTicket;

export interface ExpoPushReceiptResponse {
  status: 'ok' | 'error';
  message?: string;
  details?: {
    error?: string;
  };
}

export function isExpoPushToken(token: string): boolean {
  if (typeof token !== 'string') return false;
  return (
    (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')) &&
    token.endsWith(']')
  ) || /^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$/i.test(token);
}

export class ExpoPushClient {
  private readonly apiUrl: string = 'https://exp.host/--/api/v2/push/send';
  private readonly receiptUrl: string = 'https://exp.host/--/api/v2/push/getReceipts';
  private readonly accessToken?: string;

  constructor(accessToken?: string) {
    this.accessToken = accessToken;
  }

  async sendPushNotifications(messages: ExpoPushMessage[]): Promise<ExpoPushTicketResponse[]> {
    if (!messages.length) return [];

    // Chunk into batches of up to 100 as recommended by Expo
    const batches: ExpoPushMessage[][] = [];
    for (let i = 0; i < messages.length; i += 100) {
      batches.push(messages.slice(i, i + 100));
    }

    const allTickets: ExpoPushTicketResponse[] = [];

    for (const batch of batches) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        };
        if (this.accessToken) {
          headers['Authorization'] = `Bearer ${this.accessToken}`;
        }

        const res = await fetch(this.apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(batch),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.error(`[EXPO_PUSH_HTTP_ERROR] Status ${res.status}: ${errText}`);
          batch.forEach(() => {
            allTickets.push({
              status: 'error',
              message: `HTTP_${res.status}: ${errText}`,
            });
          });
          continue;
        }

        const json = await res.json() as { data: ExpoPushTicketResponse[] };
        if (Array.isArray(json.data)) {
          allTickets.push(...json.data);
        } else {
          batch.forEach(() => {
            allTickets.push({ status: 'error', message: 'INVALID_EXPO_RESPONSE' });
          });
        }
      } catch (err: any) {
        console.error('[EXPO_PUSH_NETWORK_ERROR]', err?.message || err);
        batch.forEach(() => {
          allTickets.push({
            status: 'error',
            message: err?.message || 'NETWORK_ERROR',
          });
        });
      }
    }

    return allTickets;
  }

  async getPushNotificationReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceiptResponse>> {
    if (!ticketIds.length) return {};

    const receipts: Record<string, ExpoPushReceiptResponse> = {};
    const batches: string[][] = [];
    for (let i = 0; i < ticketIds.length; i += 300) {
      batches.push(ticketIds.slice(i, i + 300));
    }

    for (const batch of batches) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        };
        if (this.accessToken) {
          headers['Authorization'] = `Bearer ${this.accessToken}`;
        }

        const res = await fetch(this.receiptUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ids: batch }),
        });

        if (!res.ok) {
          console.error(`[EXPO_RECEIPTS_HTTP_ERROR] Status ${res.status}`);
          continue;
        }

        const json = await res.json() as { data: Record<string, ExpoPushReceiptResponse> };
        if (json.data && typeof json.data === 'object') {
          Object.assign(receipts, json.data);
        }
      } catch (err: any) {
        console.error('[EXPO_RECEIPTS_NETWORK_ERROR]', err?.message || err);
      }
    }

    return receipts;
  }
}
