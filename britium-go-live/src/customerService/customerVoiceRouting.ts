import type { CustomerVoiceDepartment } from './customerVoiceTypes';

const DEPARTMENT_LABELS: Record<CustomerVoiceDepartment, string> = {
  operations: 'Operations',
  data_entry: 'Data Entry',
  warehouse: 'Warehouse',
  finance: 'Finance',
  pickup_supervisor: 'Pickup Supervisor',
};

export function customerVoiceDepartmentLabel(department: CustomerVoiceDepartment | null | undefined): string {
  if (!department) return 'Unassigned';
  return DEPARTMENT_LABELS[department] ?? department;
}

export function customerVoiceDepartmentIcon(department: CustomerVoiceDepartment | null | undefined): string {
  switch (department) {
    case 'operations': return 'route';
    case 'data_entry': return 'file-pen-line';
    case 'warehouse': return 'warehouse';
    case 'finance': return 'badge-dollar-sign';
    case 'pickup_supervisor': return 'clipboard-check';
    default: return 'circle-help';
  }
}
