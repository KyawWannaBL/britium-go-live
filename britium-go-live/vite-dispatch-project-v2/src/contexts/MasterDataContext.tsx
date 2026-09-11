import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type DropdownOption = { value: string; label: string; meta?: any };

interface MasterDataContextType {
  merchants: DropdownOption[];
  riders: DropdownOption[];
  drivers: DropdownOption[];
  helpers: DropdownOption[];
  fleets: DropdownOption[];
  townships: DropdownOption[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const MasterDataContext = createContext<MasterDataContextType>({} as any);

export function MasterDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState({
    merchants: [], riders: [], drivers: [], helpers: [], fleets: [], townships: []
  });
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.rpc('be_master_data_dropdown_snapshot');
      if (!error && res) {
        setData({
          merchants: res.merchants || [],
          riders: res.riders || [],
          drivers: res.drivers || [],
          helpers: res.helpers || [],
          fleets: res.fleets || [],
          townships: res.townships || []
        });
      }
    } catch (e) {
      console.error("MasterData Context Sync Error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  return (
    <MasterDataContext.Provider value={{ ...data, loading, refresh }}>
      {children}
    </MasterDataContext.Provider>
  );
}

export const useMasterData = () => useContext(MasterDataContext);
