import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User as AppUser } from '@/types';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';

interface UserCompany {
  company_id: string;
  company_name: string;
  company_slug: string;
  role: string;
}

interface AuthContextType {
  user: AppUser | null;
  companies: UserCompany[];
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string; slug?: string }>;
  logout: () => Promise<void>;
  setActiveCompany: (companyId: string) => Promise<void>;
}

interface RegisterData {
  admin_name: string;
  admin_email: string;
  company_name: string;
  whatsapp: string;
  password: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchUserCompanies(): Promise<UserCompany[]> {
  const { data, error } = await (supabase.rpc as any)('get_user_companies');
  if (error || !data) return [];
  return data;
}

async function fetchProfile(supabaseUser: SupabaseUser): Promise<AppUser | null> {
  // RLS will filter by active company via get_user_company_id()
  const { data: profile } = await (supabase.from as any)('profiles')
    .select('*, companies:company_id(name, slug)')
    .eq('user_id', supabaseUser.id)
    .maybeSingle();

  if (!profile) return null;

  return {
    id: supabaseUser.id,
    email: profile.email,
    name: profile.name,
    company_id: profile.company_id,
    company_name: profile.companies?.name || '',
    company_slug: profile.companies?.slug || '',
    role: profile.role || 'admin',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [companies, setCompanies] = useState<UserCompany[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUserData = useCallback(async (supabaseUser: SupabaseUser) => {
    const [appUser, userCompanies] = await Promise.all([
      fetchProfile(supabaseUser),
      fetchUserCompanies(),
    ]);
    setUser(appUser);
    setCompanies(userCompanies);
    setLoading(false);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setTimeout(async () => {
            await loadUserData(session.user);
          }, 0);
        } else {
          setUser(null);
          setCompanies([]);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await loadUserData(session.user);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadUserData]);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  const register = async (data: RegisterData) => {
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: data.admin_email,
      password: data.password,
    });

    if (signUpError || !authData.user) {
      return { success: false, error: signUpError?.message || 'Erro ao criar conta' };
    }

    const { data: result, error: fnError } = await supabase.functions.invoke('create-company-profile', {
      body: {
        user_id: authData.user.id,
        admin_name: data.admin_name,
        admin_email: data.admin_email,
        company_name: data.company_name,
        whatsapp: data.whatsapp,
      },
    });

    if (fnError || result?.error) {
      return { success: false, error: result?.error || 'Erro ao criar empresa' };
    }

    const appUser = await fetchProfile(authData.user);
    setUser(appUser);

    return { success: true, slug: result?.slug };
  };

  const setActiveCompany = async (companyId: string) => {
    try {
      await (supabase.rpc as any)('set_active_company', { _company_id: companyId });
      // Refetch user profile for new company
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const appUser = await fetchProfile(session.user);
        setUser(appUser);
      }
    } catch (err) {
      console.error('Error setting active company:', err);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setCompanies([]);
  };

  return (
    <AuthContext.Provider value={{ user, companies, loading, login, register, logout, setActiveCompany }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
