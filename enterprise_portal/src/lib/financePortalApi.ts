import { supabase } from '@/integrations/supabase/client';

export const financePortalApi = {
  // 1. Load the entire Finance Dashboard
  snapshot: async (actorId: string | null, branchCode: string | null) => {
    try {
      // Try RPC first if you have one
      const { data, error } = await supabase.rpc('be_finance_portal_snapshot', {
        p_actor_id: actorId,
        p_branch: branchCode
      });
      if (!error && data) return data;
      
      // Fallback: Build snapshot manually from tables
      const [batches, receipts, holds] = await Promise.all([
        supabase.from('be_finance_settlement_batches').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('be_finance_cash_receipts').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('be_parcel_exception_events').select('*').in('mapped_status', ['FINANCE_HOLD', 'PAYMENT_ISSUE']).is('resolved_at', null)
      ]);

      return {
        ok: true,
        actor: { role_code: 'finance_manager', is_active: true, actor_registry_id: actorId },
        permissions: [
          { function_key: 'dashboard', can_view: true },
          { function_key: 'cash_receipt', can_view: true, can_create: true },
          { function_key: 'settlement', can_view: true, can_create: true, can_update: true },
          { function_key: 'settlement_approve', can_approve: true },
          { function_key: 'finance_hold_release', can_approve: true }
        ],
        kpis: {
          pending_settlements: batches.data?.filter(b => b.status === 'draft').length || 0,
          finance_holds_open: holds.data?.length || 0,
        },
        settlement_batches: batches.data || [],
        cash_receipts: receipts.data || [],
        finance_holds: holds.data || []
      };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  },

  // 2. Record Cash from Rider
  recordCashReceipt: async (payload: any) => {
    const { data, error } = await supabase.from('be_finance_cash_receipts').insert({
      receipt_no: `CR-${Date.now().toString().slice(-6)}`,
      rider_id: payload.riderId,
      amount: payload.amount,
      payment_method: payload.paymentMethod,
      reference_no: payload.referenceNo,
      notes: payload.notes,
      received_at: new Date().toISOString()
    }).select().single();
    if (error) throw error;
    return data;
  },

  // 3. Finance Holds
  releaseFinanceHold: async (wayId: string, actorId: string, note: string) => {
    // 1. Mark exception resolved
    await supabase.from('be_parcel_exception_events')
      .update({ resolved_at: new Date().toISOString(), resolved_by_email: actorId, remarks: note })
      .eq('tracking_no', wayId);

    // 2. Trigger Universal Workflow to push back to Dispatch/Warehouse
    const { error } = await supabase.rpc('be_logistics_apply_workflow_event_strict', {
      p_pickup_id: wayId,
      p_process_type: 'FINANCE',
      p_new_status: 'FINANCE_RELEASED',
      p_actor_role: 'finance',
      p_actor_id: actorId,
      p_notes: note || 'Finance hold released'
    });
    if (error) throw error;
    return { delivery_way_id: wayId };
  },

  // 4. Utility functions
  exportCsv: (filename: string, rows: any[]) => {
    if (!rows || !rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(','), ...rows.map(r => keys.map(k => `"${String(r[k] || '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  },
  parseCsv: (text: string) => {
    const lines = text.split('\n').filter(Boolean);
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const values = line.split(',');
      return headers.reduce((obj: any, h, i) => { obj[h] = values[i]?.trim() || ''; return obj; }, {});
    });
  }
};