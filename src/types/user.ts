export interface User {
  id: string;
  email: string;
  name: string;
  company_id: string;
  company_name: string;
  company_slug: string;
  role: string;
  status?: string;
  permission_overrides?: string[];
}
