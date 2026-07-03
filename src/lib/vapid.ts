// Public VAPID key — safe to expose to clients.
// Corresponds to the VAPID_PRIVATE_KEY stored as an edge-function secret.
export const VAPID_PUBLIC_KEY = 'BGiPhdz9Zo0nXp_g0YhgHu8Rcyygrq0IDnNDS2TzhySin1dTeX8M_YN_swb0IyU3QI1qzCHZoaU-gSmpy5z2YPo';

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}