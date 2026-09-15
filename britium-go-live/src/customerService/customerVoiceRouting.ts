import type { CustomerVoiceDepartment } from './customerVoiceTypes';

export const CUSTOMER_VOICE_DEPARTMENT_LABELS: Record<CustomerVoiceDepartment, string> = {
  operations: 'Operations / Dispatch',
  data_entry: 'Data Entry / Operations',
  warehouse: 'Warehouse',
  finance: 'Finance',
  pickup_supervisor: 'Pickup / Supervisor',
};

export function customerVoiceDepartmentLabel(department?: string | null): string {
  if (!department) return 'Unassigned';
  return CUSTOMER_VOICE_DEPARTMENT_LABELS[department as CustomerVoiceDepartment] || department;
}

export function customerVoicePriorityLabel(priority?: string | null): string {
  if (!priority) return '-';
  return priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase();
}

export function customerVoiceStatusLabel(status?: string | null): string {
  if (!status) return '-';
  return status.toLowerCase().split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}
