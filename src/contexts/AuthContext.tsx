import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User as AppUser } from '@/types';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

interface RegisterData {
  admin_name: string;
  admin_email: string;
  company_name: string;
  whatsapp: string;
  password: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchProfile(supabaseUser: SupabaseUser): Promise<AppUser | null> {
  const { data: profile } = await (supabase.from as any)('profiles')
    .select('*, companies:company_id(name)')
    .eq('id', supabaseUser.id)
    .maybeSingle();

  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    company_id: profile.company_id,
    company_name: profile.companies?.name || '',
    role: profile.role || 'admin',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen to auth state changes FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          // Use setTimeout to avoid potential deadlocks with Supabase client
          setTimeout(async () => {
            const appUser = await fetchProfile(session.user);
            setUser(appUser);
            setLoading(false);
          }, 0);
        } else {
          setUser(null);
          setLoading(false);
        }
      }
    );

    // Then check existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const appUser = await fetchProfile(session.user);
        setUser(appUser);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  };

  const register = async (data: RegisterData) => {
    // 1. Sign up the user
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: data.admin_email,
      password: data.password,
    });

    if (signUpError || !authData.user) {
      return { success: false, error: signUpError?.message || 'Erro ao criar conta' };
    }

    // 2. Call edge function to create company + profile (uses service role to bypass RLS)
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

    // 3. Fetch full profile to set in state
    const appUser = await fetchProfile(authData.user);
    setUser(appUser);

    return { success: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
