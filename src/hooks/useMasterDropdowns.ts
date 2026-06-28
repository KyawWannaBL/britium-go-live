// @ts-nocheck
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useMasterDropdowns() {
  const [riders, setRiders] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [helpers, setHelpers] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [zones, setZones] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from('riders').select('id,full_name,phone,zone').eq('is_active', true),
      supabase.from('drivers').select('id,full_name,phone,vehicle_id').eq('is_active', true),
      supabase.from('helpers').select('id,full_name,phone').eq('is_active', true),
      supabase.from('merchants').select('id,business_name,contact_name,phone').eq('is_active', true),
      supabase.from('zones').select('name').order('name'),
    ]).then(([r, d, h, m, z]) => {
      const toOption = (x: any, label: string) => ({ value: x.id, label: x[label] ?? x.id, ...x });
      setRiders((r.data ?? []).map((x: any) => toOption(x, 'full_name')));
      setDrivers((d.data ?? []).map((x: any) => toOption(x, 'full_name')));
      setHelpers((h.data ?? []).map((x: any) => toOption(x, 'full_name')));
      setMerchants((m.data ?? []).map((x: any) => toOption(x, 'business_name')));
      setZones((z.data ?? []).map((x: any) => x.name));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return { riders, drivers, helpers, merchants, zones, loading };
}
