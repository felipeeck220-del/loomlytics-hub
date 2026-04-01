import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import TvHeader from '@/components/tv/TvHeader';
import TvMachineGrid from '@/components/tv/TvMachineGrid';
import { Loader2 } from 'lucide-react';

interface PanelData {
  panel_id: string;
  panel_name: string;
  panel_type: string;
  enabled_machines: string[];
  company_id: string;
  company_name: string;
  company_slug: string;
  logo_url: string | null;
  shift_settings: {
    shift_manha_start: string;
    shift_manha_end: string;
    shift_tarde_start: string;
    shift_tarde_end: string;
    shift_noite_start: string;
    shift_noite_end: string;
  };
}

export default function TvPanel() {
  const navigate = useNavigate();
  const [panelData, setPanelData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPanel = useCallback(async () => {
    const savedData = localStorage.getItem('tv_panel_data');
    const savedCode = localStorage.getItem('tv_panel_code');
    if (!savedData || !savedCode) {
      navigate('/tela', { replace: true });
      return;
    }
    try {
      const data = JSON.parse(savedData) as PanelData;
      setPanelData(data);
    } catch {
      navigate('/tela', { replace: true });
      return;
    }
    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    loadPanel();
  }, [loadPanel]);

  // Listen for realtime changes to this panel
  useEffect(() => {
    if (!panelData?.panel_id) return;

    const channel = supabase
      .channel(`tv-panel-${panelData.panel_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tv_panels',
          filter: `id=eq.${panelData.panel_id}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            // Panel deleted by admin
            localStorage.removeItem('tv_panel_code');
            localStorage.removeItem('tv_panel_data');
            navigate('/tela', { replace: true });
            return;
          }
          const updated = payload.new as any;
          if (updated.is_connected === false) {
            // Disconnected by admin
            localStorage.removeItem('tv_panel_code');
            localStorage.removeItem('tv_panel_data');
            navigate('/tela', { replace: true });
            return;
          }
          // Update enabled machines and other settings
          setPanelData(prev => prev ? {
            ...prev,
            panel_name: updated.name || prev.panel_name,
            panel_type: updated.panel_type || prev.panel_type,
            enabled_machines: updated.enabled_machines || prev.enabled_machines,
          } : prev);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [panelData?.panel_id, navigate]);

  if (loading || !panelData) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col cursor-none overflow-hidden">
      <TvHeader
        companyName={panelData.company_name}
        panelName={panelData.panel_name}
        logoUrl={panelData.logo_url}
        shiftSettings={panelData.shift_settings}
      />
      <div className="flex-1 p-4">
        {panelData.panel_type === 'machine_grid' && (
          <TvMachineGrid
            companyId={panelData.company_id}
            enabledMachines={panelData.enabled_machines}
            shiftSettings={panelData.shift_settings}
          />
        )}
      </div>
    </div>
  );
}
