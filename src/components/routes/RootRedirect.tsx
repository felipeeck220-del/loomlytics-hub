import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";

export default function RootRedirect() {
  const { user, loading } = useAuth();
  const { defaultRoute } = usePermissions();
  const [checking, setChecking] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    if (loading || !user) { setChecking(false); return; }
    supabase.from('platform_admins').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        setIsPlatformAdmin(!!data);
        setChecking(false);
      });
  }, [user, loading]);

  if (loading || checking) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (isPlatformAdmin) return <Navigate to="/admin" replace />;
  const target = defaultRoute ? `/${user.company_slug}/${defaultRoute}` : `/${user.company_slug}`;
  return <Navigate to={target} replace />;
}
