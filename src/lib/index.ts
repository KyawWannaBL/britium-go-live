export const ROUTE_PATHS = {
  DASHBOARD: '/',
  CREATE_DELIVERY: '/create-delivery',
  WAY_MANAGEMENT: '/way-management',
  MERCHANTS: '/merchants',
  RECEIPTS: '/receipts',
  FINANCIAL_CENTER: '/financial-center',
  DELIVERYMEN: '/deliverymen',
  REPORTING: '/reporting',
  SETTINGS: '/settings',
} as const;

export enum DeliveryStatus {
  PENDING = 'pending',
  PICKED_UP = 'picked_up',
  IN_TRANSIT = 'in_transit',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  RETURNED = 'returned',
  CANCELLED = 'cancelled',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  OVERDUE = 'overdue',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed',
}

export interface Delivery {
  id: string;
  wayNumber: string;
  merchantId: string;
  merchantName: string;
  deliverymanId?: string;
  deliverymanName?: string;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  recipientTown: string;
  packageDescription: string;
  packageWeight: number;
  packageValue: number;
  deliveryFee: number;
  codAmount?: number;
  status: DeliveryStatus;
  createdAt: string;
  updatedAt: string;
  pickupDate?: string;
  deliveryDate?: string;
  notes?: string;
}

export interface Merchant {
  id: string;
  businessName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  town: string;
  pricingTier: 'standard' | 'premium' | 'enterprise';
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  outstandingBalance: number;
  status: 'active' | 'suspended' | 'inactive';
  createdAt: string;
  lastOrderDate?: string;
}

export interface Deliveryman {
  id: string;
  name: string;
  phone: string;
  email: string;
  vehicleType: 'motorcycle' | 'van' | 'truck';
  vehicleNumber: string;
  assignedZone: string;
  activeDeliveries: number;
  completedDeliveries: number;
  completionRate: number;
  averageRating: number;
  status: 'active' | 'offline' | 'suspended';
  cashAdvance: number;
  createdAt: string;
  lastActiveDate?: string;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  merchantId: string;
  merchantName: string;
  amount: number;
  deliveryCount: number;
  periodStart: string;
  periodEnd: string;
  status: PaymentStatus;
  issuedDate: string;
  dueDate: string;
  paidDate?: string;
  notes?: string;
}

export interface Transaction {
  id: string;
  type: 'payment' | 'refund' | 'advance' | 'adjustment';
  amount: number;
  description: string;
  relatedEntity: string;
  relatedEntityType: 'merchant' | 'deliveryman' | 'delivery';
  status: PaymentStatus;
  createdAt: string;
  processedAt?: string;
  notes?: string;
}

export interface Account {
  id: string;
  name: string;
  type: 'merchant' | 'deliveryman' | 'system';
  balance: number;
  pendingAmount: number;
  totalReceived: number;
  totalPaid: number;
  lastTransactionDate?: string;
}

export interface Report {
  id: string;
  type:
    | 'ways_count'
    | 'active_ways'
    | 'overdue_ways'
    | 'ways_by_town'
    | 'ways_by_deliveryman'
    | 'ways_by_merchant'
    | 'merchant_compare';
  title: string;
  periodStart: string;
  periodEnd: string;
  data: Record<string, any>;
  generatedAt: string;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(
  date: string | Date,
  format: 'short' | 'long' | 'datetime' = 'short'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (format === 'short') {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(dateObj);
  }

  if (format === 'long') {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(dateObj);
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dateObj);
}

export function getStatusColor(status: DeliveryStatus | PaymentStatus): string {
  const statusColorMap: Record<string, string> = {
    [DeliveryStatus.PENDING]: 'bg-muted text-muted-foreground',
    [DeliveryStatus.PICKED_UP]: 'bg-accent text-accent-foreground',
    [DeliveryStatus.IN_TRANSIT]: 'bg-primary/10 text-primary',
    [DeliveryStatus.OUT_FOR_DELIVERY]: 'bg-primary/20 text-primary',
    [DeliveryStatus.DELIVERED]:
      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    [DeliveryStatus.FAILED]: 'bg-destructive/10 text-destructive',
    [DeliveryStatus.RETURNED]:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    [DeliveryStatus.CANCELLED]: 'bg-muted text-muted-foreground',
    [`payment_${PaymentStatus.PENDING}`]:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    [`payment_${PaymentStatus.PAID}`]:
      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    [`payment_${PaymentStatus.OVERDUE}`]: 'bg-destructive/10 text-destructive',
    [`payment_${PaymentStatus.REFUNDED}`]: 'bg-muted text-muted-foreground',
    [`payment_${PaymentStatus.DISPUTED}`]: 'bg-destructive/20 text-destructive',
  };

  return statusColorMap[status] || statusColorMap[`payment_${status}`] || 'bg-muted text-muted-foreground';
}

export function getStatusLabel(status: DeliveryStatus | PaymentStatus): string {
  const statusLabelMap: Record<string, string> = {
    [DeliveryStatus.PENDING]: 'Pending',
    [DeliveryStatus.PICKED_UP]: 'Picked Up',
    [DeliveryStatus.IN_TRANSIT]: 'In Transit',
    [DeliveryStatus.OUT_FOR_DELIVERY]: 'Out for Delivery',
    [DeliveryStatus.DELIVERED]: 'Delivered',
    [DeliveryStatus.FAILED]: 'Failed',
    [DeliveryStatus.RETURNED]: 'Returned',
    [DeliveryStatus.CANCELLED]: 'Cancelled',
    [`payment_${PaymentStatus.PENDING}`]: 'Pending',
    [`payment_${PaymentStatus.PAID}`]: 'Paid',
    [`payment_${PaymentStatus.OVERDUE}`]: 'Overdue',
    [`payment_${PaymentStatus.REFUNDED}`]: 'Refunded',
    [`payment_${PaymentStatus.DISPUTED}`]: 'Disputed',
  };

  return statusLabelMap[status] || statusLabelMap[`payment_${status}`] || status;
}