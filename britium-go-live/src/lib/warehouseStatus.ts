// Queue presentation only: scan evidence and financial states remain unchanged.
export function warehouseQueueStatus(row: any): string {
  const delivery = String(row?.delivery_status || row?.rider_status || row?.stop_status || '').toUpperCase();
  const warehouse = String(row?.warehouse_scan_status || row?.warehouse_status || '').toUpperCase();
  const stage = String(row?.dispatch_workflow_stage || '').toUpperCase();
  if (delivery === 'DELIVERED') return 'DELIVERED';
  if (!delivery && (warehouse === 'DELIVERED' || stage === 'DELIVERED')) return 'DELIVERED';
  // A current field outcome takes priority over older spreadsheet history.
  if (!delivery) {
    const reports = Array.isArray(row?.reported_source_history) ? row.reported_source_history.filter((event: any) =>
      event && event.completion_basis === 'MD_INSTRUCTED_ASSUMPTION' && /^\d{4}-\d{2}-\d{2}$/.test(String(event.work_date || ''))
    ) : [];
    const latestDate = reports.reduce((date: string, event: any) => String(event.work_date) > date ? String(event.work_date) : date, '');
    const latest = reports.filter((event: any) => event.work_date === latestDate);
    if (latest.length && latest.every((event: any) => event.reported_outcome === 'DELIVERY_COMPLETED')) return 'DELIVERED';
  }
  return warehouse || delivery || '';
}
