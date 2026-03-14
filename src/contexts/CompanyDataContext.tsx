import { createContext, useContext, ReactNode } from 'react';
import { useCompanyData } from '@/hooks/useCompanyData';

type CompanyDataReturn = ReturnType<typeof useCompanyData>;

const CompanyDataContext = createContext<CompanyDataReturn | null>(null);

export function CompanyDataProvider({ children }: { children: ReactNode }) {
  const data = useCompanyData();
  return (
    <CompanyDataContext.Provider value={data}>
      {children}
    </CompanyDataContext.Provider>
  );
}

export function useSharedCompanyData(): CompanyDataReturn {
  const ctx = useContext(CompanyDataContext);
  if (!ctx) throw new Error('useSharedCompanyData must be used within CompanyDataProvider');
  return ctx;
}
