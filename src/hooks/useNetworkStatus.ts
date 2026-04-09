import { useState, useEffect } from 'react';

export type ConnectionQuality = 'good' | 'medium' | 'poor' | 'offline';

interface NetworkStatus {
  quality: ConnectionQuality;
  label: string;
}

function getQuality(): ConnectionQuality {
  if (!navigator.onLine) return 'offline';

  const conn = (navigator as any).connection;
  if (!conn) return 'good'; // API not supported, assume good if online

  const downlink: number = conn.downlink ?? 10; // Mbps
  const rtt: number = conn.rtt ?? 0; // ms
  const effectiveType: string = conn.effectiveType ?? '4g';

  if (effectiveType === 'slow-2g' || effectiveType === '2g' || downlink < 0.5 || rtt > 800) {
    return 'poor';
  }
  if (effectiveType === '3g' || downlink < 2 || rtt > 400) {
    return 'medium';
  }
  return 'good';
}

const LABELS: Record<ConnectionQuality, string> = {
  good: 'Conexão boa',
  medium: 'Conexão média',
  poor: 'Conexão fraca',
  offline: 'Sem conexão',
};

export function useNetworkStatus(): NetworkStatus {
  const [quality, setQuality] = useState<ConnectionQuality>(getQuality);

  useEffect(() => {
    const update = () => setQuality(getQuality());

    window.addEventListener('online', update);
    window.addEventListener('offline', update);

    const conn = (navigator as any).connection;
    if (conn) {
      conn.addEventListener('change', update);
    }

    // Poll every 10s as fallback
    const id = setInterval(update, 10000);

    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      conn?.removeEventListener('change', update);
      clearInterval(id);
    };
  }, []);

  return { quality, label: LABELS[quality] };
}
