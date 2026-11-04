import { useEffect, useState } from 'react';
import { api } from '../api';

export interface PaymentConfig {
  gateway: string;
  /** True when this API deployment accepts the sandbox/demo gateway (no real money moves). */
  sandbox: boolean;
}

let cached: Promise<PaymentConfig> | null = null;

/** Asks the API how payments work in this deployment (cached for the app session). */
export function fetchPaymentConfig(): Promise<PaymentConfig> {
  if (!cached) {
    cached = api<PaymentConfig>('/api/v2/payments/config').catch((err) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}

/** null while loading or if the API does not expose the config (older deployments). */
export function usePaymentSandbox(): boolean | null {
  const [sandbox, setSandbox] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    fetchPaymentConfig()
      .then((c) => active && setSandbox(Boolean(c.sandbox)))
      .catch(() => active && setSandbox(null));
    return () => {
      active = false;
    };
  }, []);
  return sandbox;
}
