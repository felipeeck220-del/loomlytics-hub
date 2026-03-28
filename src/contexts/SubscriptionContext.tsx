import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

type SubStatus = 'active' | 'cancelling' | 'trial' | 'grace' | 'blocked' | 'free' | 'overdue' | 'cancelled' | 'unknown';

interface SubscriptionState {
  status: SubStatus;
  trialDaysLeft: number | null;
  loading: boolean;
  /** True when admin but subscription expired/cancelled — sidebar should be locked */
  sidebarLocked: boolean;
  /** True when non-admin and subscription expired/cancelled — full block */
  fullyBlocked: boolean;
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionState | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<SubStatus>('unknown');
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.company_id) return;
    const { data } = await (supabase.from as any)('company_settings')
      .select('subscription_status, trial_end_date, grace_period_end, platform_active')
      .eq('company_id', user.company_id)
      .maybeSingle();

    if (!data) {
      setStatus('unknown');
      setTrialDaysLeft(null);
      setLoading(false);
      return;
    }

    const subStatus = data.subscription_status as string;
    const now = Date.now();

    if (subStatus === 'free') {
      setStatus('free');
      setTrialDaysLeft(null);
    } else if (subStatus === 'active') {
      setStatus('active');
      setTrialDaysLeft(null);
    } else if (subStatus === 'cancelling') {
      // Check if the paid period has ended
      // If grace_period_end exists and passed, treat as cancelled
      if (data.grace_period_end && new Date(data.grace_period_end).getTime() < now) {
        setStatus('cancelled');
      } else {
        setStatus('cancelling');
      }
      setTrialDaysLeft(null);
    } else if (subStatus === 'cancelled') {
      setStatus('cancelled');
      setTrialDaysLeft(null);
    } else if (subStatus === 'blocked') {
      // Determine if blocked due to overdue or cancellation
      setStatus('blocked');
      setTrialDaysLeft(null);
    } else if (subStatus === 'trial' && data.trial_end_date) {
      const end = new Date(data.trial_end_date);
      const diff = Math.ceil((end.getTime() - now) / (1000 * 60 * 60 * 24));
      if (diff > 0) {
        setStatus('trial');
        setTrialDaysLeft(diff);
      } else {
        // Trial ended, check grace period (5 days)
        const graceEnd = end.getTime() + 5 * 24 * 60 * 60 * 1000;
        if (now < graceEnd) {
          setStatus('grace');
          setTrialDaysLeft(null);
        } else {
          setStatus('blocked');
          setTrialDaysLeft(null);
        }
      }
    } else {
      setStatus(subStatus as SubStatus);
      setTrialDaysLeft(null);
    }

    setLoading(false);
  }, [user?.company_id]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  // Listen for subscription updates
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('subscription-updated', handler);
    return () => window.removeEventListener('subscription-updated', handler);
  }, [refresh]);

  const isExpired = status === 'blocked' || status === 'cancelled' || status === 'overdue';
  const isAdmin = user?.role === 'admin';
  const sidebarLocked = isExpired && isAdmin;
  const fullyBlocked = isExpired && !isAdmin;

  return (
    <SubscriptionContext.Provider value={{ status, trialDaysLeft, loading, sidebarLocked, fullyBlocked, refresh }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error('useSubscription must be used within SubscriptionProvider');
  return context;
}
