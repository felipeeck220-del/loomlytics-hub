import { supabase } from '@/integrations/supabase/client';

interface LoginInfo {
  companyId: string;
  userId: string;
  userName?: string;
  userCode?: string;
  userRole?: string;
}

function parseUserAgent(ua: string): { device: string; browser: string; os: string } {
  let device = 'Desktop';
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) {
    device = /iPad|Tablet/i.test(ua) ? 'Tablet' : 'Mobile';
  }

  let browser = 'Outro';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Opera|OPR/i.test(ua)) browser = 'Opera';

  let os = 'Outro';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua) && !/Android/i.test(ua)) os = 'Linux';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';

  return { device, browser, os };
}

async function fetchLocationFromIp(ip: string): Promise<{ country: string; city: string } | null> {
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = await res.json();
    return { country: data.country_name || '', city: data.city || '' };
  } catch {
    return null;
  }
}

export async function trackLogin(info: LoginInfo) {
  try {
    const ua = navigator.userAgent;
    const { device, browser, os } = parseUserAgent(ua);

    // Try to get public IP
    let ip = '';
    let locationCountry = '';
    let locationCity = '';
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
      if (ipRes.ok) {
        const ipData = await ipRes.json();
        ip = ipData.ip || '';
        if (ip) {
          const loc = await fetchLocationFromIp(ip);
          if (loc) {
            locationCountry = loc.country;
            locationCity = loc.city;
          }
        }
      }
    } catch {
      // IP fetch is best-effort
    }

    await (supabase.from as any)('login_history').insert({
      company_id: info.companyId,
      user_id: info.userId,
      user_name: info.userName || null,
      user_code: info.userCode || null,
      user_role: info.userRole || null,
      ip_address: ip || null,
      user_agent: ua.substring(0, 500),
      device_type: device,
      browser,
      os,
      location_country: locationCountry || null,
      location_city: locationCity || null,
    });
  } catch (err) {
    console.error('Failed to track login:', err);
  }
}
