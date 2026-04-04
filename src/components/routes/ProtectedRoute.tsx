import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

export default function ProtectedRoute({ routeKey, children }: { routeKey: string; children: React.ReactNode }) {
  const { canAccess, defaultRoute } = usePermissions();
  const { user } = useAuth();
  if (!canAccess(routeKey)) {
    const fallback = defaultRoute ? `/${user?.company_slug}/${defaultRoute}` : `/${user?.company_slug}`;
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}
