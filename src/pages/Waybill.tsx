import { useState, useMemo } from 'react';
import { Search, Download, Send, CheckCircle, Filter, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import { DataTable } from '@/components/DataTable';
import { mockReceipts } from '@/data/index';
import {
  Receipt,
  PaymentStatus,
  formatCurrency,
  formatDate,
  getStatusColor,
  getStatusLabel,
} from '@/lib/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { springPresets } from '@/lib/motion';

export default function Receipts() {
  const [receipts] = useState<Receipt[]>(mockReceipts);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedReceipts, setSelectedReceipts] = useState<Set<string>>(new Set());
  const [viewReceiptDialog, setViewReceiptDialog] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [markPaidDialog, setMarkPaidDialog] = useState(false);
  const [sendReminderDialog, setSendReminderDialog] = useState(false);

  const filteredReceipts = useMemo(() => {
    return receipts.filter((receipt) => {
      const matchesSearch =
        receipt.merchantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        receipt.receiptNumber.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || receipt.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [receipts, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const total = receipts.length;
    const pending = receipts.filter((r) => r.status === PaymentStatus.PENDING).length;
    const overdue = receipts.filter((r) => r.status === PaymentStatus.OVERDUE).length;
    const paid = receipts.filter((r) => r.status === PaymentStatus.PAID).length;
    const totalAmount = receipts.reduce((sum, r) => sum + r.amount, 0);
    const pendingAmount = receipts
      .filter((r) => r.status === PaymentStatus.PENDING || r.status === PaymentStatus.OVERDUE)
      .reduce((sum, r) => sum + r.amount, 0);

    return { total, pending, overdue, paid, totalAmount, pendingAmount };
  }, [receipts]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedReceipts(new Set(filteredReceipts.map((r) => r.id)));
    } else {
      setSelectedReceipts(new Set());
    }
  };

  const handleSelectReceipt = (receiptId: string, checked: boolean) => {
    const newSelected = new Set(selectedReceipts);
    if (checked) {
      newSelected.add(receiptId);
    } else {
      newSelected.delete(receiptId);
    }
    setSelectedReceipts(newSelected);
  };

  const handleViewReceipt = (receipt: Receipt) => {
    setSelectedReceipt(receipt);
    setViewReceiptDialog(true);
  };

  const handleMarkAsPaid = (receipt: Receipt) => {
    setSelectedReceipt(receipt);
    setMarkPaidDialog(true);
  };

  const handleBulkMarkPaid = () => {
    if (selectedReceipts.size > 0) {
      setMarkPaidDialog(true);
    }
  };

  const handleBulkSendReminder = () => {
    if (selectedReceipts.size > 0) {
      setSendReminderDialog(true);
    }
  };

  const confirmMarkPaid = () => {
    setMarkPaidDialog(false);
    setSelectedReceipt(null);
    setSelectedReceipts(new Set());
  };

  const confirmSendReminder = () => {
    setSendReminderDialog(false);
    setSelectedReceipts(new Set());
  };

  const baseColumns = [
    {
      id: 'select',
      header: '',
      sortable: false,
      cell: (receipt: Receipt) => (
        <Checkbox
          checked={selectedReceipts.has(receipt.id)}
          onCheckedChange={(checked) => handleSelectReceipt(receipt.id, checked as boolean)}
        />
      ),
    },
    {
      id: 'receiptNumber',
      header: 'Receipt Number',
      sortable: true,
      cell: (receipt: Receipt) => (
        <div className="font-mono text-sm font-medium">{receipt.receiptNumber}</div>
      ),
    },
    {
      id: 'merchantName',
      header: 'Merchant',
      sortable: true,
      cell: (receipt: Receipt) => (
        <div>
          <div className="font-medium">{receipt.merchantName}</div>
          <div className="text-sm text-muted-foreground">{receipt.deliveryCount} deliveries</div>
        </div>
      ),
    },
    {
      id: 'amount',
      header: 'Amount',
      sortable: true,
      cell: (receipt: Receipt) => (
        <div className="font-mono font-semibold">{formatCurrency(receipt.amount)}</div>
      ),
    },
    {
      id: 'period',
      header: 'Period',
      sortable: false,
      cell: (receipt: Receipt) => (
        <div className="text-sm">
          <div>{formatDate(receipt.periodStart)}</div>
          <div className="text-muted-foreground">to {formatDate(receipt.periodEnd)}</div>
        </div>
      ),
    },
    {
      id: 'issuedDate',
      header: 'Issued Date',
      sortable: true,
      cell: (receipt: Receipt) => <div className="text-sm">{formatDate(receipt.issuedDate)}</div>,
    },
    {
      id: 'dueDate',
      header: 'Due Date',
      sortable: true,
      cell: (receipt: Receipt) => (
        <div className="text-sm">
          <div>{formatDate(receipt.dueDate)}</div>
          {receipt.status === PaymentStatus.OVERDUE && (
            <div className="text-destructive text-xs font-medium mt-1">Overdue</div>
          )}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      cell: (receipt: Receipt) => (
        <Badge className={getStatusColor(receipt.status)}>{getStatusLabel(receipt.status)}</Badge>
      ),
    },
  ];

  const actions = [
    {
      label: 'View',
      onClick: handleViewReceipt,
    },
    {
      label: 'Download PDF',
      onClick: (receipt: Receipt) => {
        console.log('Download PDF:', receipt.receiptNumber);
      },
    },
    {
      label: 'Mark as Paid',
      onClick: handleMarkAsPaid,
    },
  ];

  const columns = [
    ...baseColumns,
    {
      id: "actions",
      header: "Actions",
      sortable: false,
      cell: (receipt: Receipt) => (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => action.onClick(receipt)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springPresets.gentle}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Receipts</h1>
        <p className="text-muted-foreground mt-2">Manage merchant receipts and payment tracking</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Receipts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total amount: {formatCurrency(stats.totalAmount)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.pending}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Amount: {formatCurrency(stats.pendingAmount)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.overdue}</div>
            <p className="text-xs text-muted-foreground mt-1">Requires immediate attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.paid}</div>
            <p className="text-xs text-muted-foreground mt-1">Successfully processed</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Receipt List</CardTitle>
              <CardDescription>View and manage all merchant receipts</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedReceipts.size > 0 && (
                <>
                  <Button onClick={handleBulkMarkPaid} size="sm" variant="outline">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark as Paid ({selectedReceipts.size})
                  </Button>
                  <Button onClick={handleBulkSendReminder} size="sm" variant="outline">
                    <Send className="h-4 w-4 mr-2" />
                    Send Reminder ({selectedReceipts.size})
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 mb-6 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by merchant or receipt number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value={PaymentStatus.PENDING}>Pending</SelectItem>
                <SelectItem value={PaymentStatus.PAID}>Paid</SelectItem>
                <SelectItem value={PaymentStatus.OVERDUE}>Overdue</SelectItem>
                <SelectItem value={PaymentStatus.REFUNDED}>Refunded</SelectItem>
                <SelectItem value={PaymentStatus.DISPUTED}>Disputed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DataTable columns={columns} data={filteredReceipts} />
        </CardContent>
      </Card>

      <Dialog open={viewReceiptDialog} onOpenChange={setViewReceiptDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Receipt Details</DialogTitle>
            <DialogDescription>View complete receipt information</DialogDescription>
          </DialogHeader>
          {selectedReceipt && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Receipt Number</div>
                  <div className="font-mono font-semibold">{selectedReceipt.receiptNumber}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Status</div>
                  <Badge className={getStatusColor(selectedReceipt.status)}>
                    {getStatusLabel(selectedReceipt.status)}
                  </Badge>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Merchant</div>
                  <div className="font-medium">{selectedReceipt.merchantName}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Amount</div>
                  <div className="font-mono text-lg font-bold">
                    {formatCurrency(selectedReceipt.amount)}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Delivery Count</div>
                  <div>{selectedReceipt.deliveryCount} deliveries</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Period</div>
                  <div className="text-sm">
                    {formatDate(selectedReceipt.periodStart)} - {formatDate(selectedReceipt.periodEnd)}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Issued Date</div>
                  <div>{formatDate(selectedReceipt.issuedDate)}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Due Date</div>
                  <div>{formatDate(selectedReceipt.dueDate)}</div>
                </div>
                {selectedReceipt.paidDate && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Paid Date</div>
                    <div>{formatDate(selectedReceipt.paidDate)}</div>
                  </div>
                )}
              </div>
              {selectedReceipt.notes && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Notes</div>
                  <div className="text-sm bg-muted p-3 rounded-md">{selectedReceipt.notes}</div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewReceiptDialog(false)}>
              Close
            </Button>
            <Button onClick={() => console.log('Download PDF')}>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={markPaidDialog} onOpenChange={setMarkPaidDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Paid</DialogTitle>
            <DialogDescription>
              {selectedReceipt
                ? `Mark receipt ${selectedReceipt.receiptNumber} as paid?`
                : `Mark ${selectedReceipts.size} selected receipt(s) as paid?`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This action will update the payment status to "Paid" and record the payment date as today.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkPaidDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmMarkPaid}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sendReminderDialog} onOpenChange={setSendReminderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Payment Reminder</DialogTitle>
            <DialogDescription>
              Send payment reminder to {selectedReceipts.size} merchant(s)?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              A payment reminder email will be sent to the selected merchants with their outstanding
              receipt details.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendReminderDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmSendReminder}>
              <Send className="h-4 w-4 mr-2" />
              Send Reminder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
