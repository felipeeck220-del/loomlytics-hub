import { useState, useEffect } from "react";
import { Navigate, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { CompanyDataProvider } from "@/contexts/CompanyDataContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import CompanyRouteInner from "./CompanyRouteInner";

export default function CompanyRoute() {
  const { user, loading, companies, setActiveCompany } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [companyResolved, setCompanyResolved] = useState(false);

  useEffect(() => {
    if (!user || !slug || !companies.length) return;
    
    const company = companies.find(c => c.company_slug === slug);
    if (!company) {
      navigate(`/${companies[0].company_slug}`, { replace: true });
      return;
    }
    
    if (company.company_id !== user.company_id) {
      setActiveCompany(company.company_id).then(() => {
        setCompanyResolved(true);
      });
    } else {
      setCompanyResolved(true);
    }
  }, [slug, user?.company_id, companies]);

  if (loading) return null;
  if (!user) return <Navigate to={`/${slug}/login`} replace />;
  if (!companyResolved) return null;

  return (
    <CompanyDataProvider>
      <SubscriptionProvider>
        <CompanyRouteInner />
      </SubscriptionProvider>
    </CompanyDataProvider>
  );
}
