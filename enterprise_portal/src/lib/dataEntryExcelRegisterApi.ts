import { supabase } from '@/integrations/supabase/client';

export const DATA_ENTRY_COLUMNS = ['waybill_id', 'recipient_name', 'recipient_phone', 'cod_amount', 'delivery_address'];

export const calculateRow = (row: any) => {
  return { ...row, processed_at: new Date().toISOString() };
};

export const downloadDataEntryExcelTemplate = () => {
  const headers = DATA_ENTRY_COLUMNS.join(',');
  const blob = new Blob([headers], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'DataEntryTemplate.csv';
  a.click();
};

export const fetchDataEntryDropdownSnapshot = async () => {
  // Add your logic to fetch dropdown data (e.g., townships, service types)
  return { townships: [], serviceTypes: [] };
};

export const fetchDataEntryRegisterSnapshot = async () => {
  const { data } = await supabase.from('shipments').select('*').limit(50);
  return data || [];
};

export const parseDataEntryExcelFile = async (file: File) => {
  const text = await file.text();
  // Basic CSV parser
  return text.split('\n').slice(1).map(line => line.split(','));
};

export const saveDataEntryRegisterRows = async (rows: any[]) => {
  const { error } = await supabase.from('shipments').insert(rows);
  if (error) throw error;
  return { success: true };
};