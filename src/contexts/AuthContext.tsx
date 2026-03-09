import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (data: RegisterData) => Promise<boolean>;
  logout: () => void;
}

interface RegisterData {
  admin_name: string;
  admin_email: string;
  company_name: string;
  whatsapp: string;
  password: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('malharia_user');
    if (stored) {
      setUser(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    const users = JSON.parse(localStorage.getItem('malharia_users') || '[]');
    const found = users.find((u: any) => u.email === email && u.password === password);
    if (found) {
      const userData: User = {
        id: found.id,
        email: found.email,
        name: found.admin_name,
        company_id: found.company_id,
        company_name: found.company_name,
        role: 'Administrador',
      };
      setUser(userData);
      localStorage.setItem('malharia_user', JSON.stringify(userData));
      return true;
    }
    return false;
  };

  const register = async (data: RegisterData): Promise<boolean> => {
    const users = JSON.parse(localStorage.getItem('malharia_users') || '[]');
    const exists = users.find((u: any) => u.email === data.admin_email);
    if (exists) return false;

    const companyId = crypto.randomUUID();
    const userId = crypto.randomUUID();

    const newUser = {
      id: userId,
      email: data.admin_email,
      admin_name: data.admin_name,
      company_id: companyId,
      company_name: data.company_name,
      whatsapp: data.whatsapp,
      password: data.password,
    };

    users.push(newUser);
    localStorage.setItem('malharia_users', JSON.stringify(users));

    const userData: User = {
      id: userId,
      email: data.admin_email,
      name: data.admin_name,
      company_id: companyId,
      company_name: data.company_name,
      role: 'Administrador',
    };
    setUser(userData);
    localStorage.setItem('malharia_user', JSON.stringify(userData));
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('malharia_user');
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
