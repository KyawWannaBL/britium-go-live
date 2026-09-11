import { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search,
  Filter,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  Clock,
  Phone,
  Mail,
  User,
  Package,
  TrendingUp,
  TrendingDown,
  Send,
  Paperclip,
  MoreVertical,
} from 'lucide-react';
import {
  ROUTE_PATHS,
  Shipment,
  DeliveryStatus,
  formatStatus,
  formatDate,
  formatCurrency,
} from '@/lib/index';
import { mockShipments, mockDeliveries, mockEmployees } from '@/data/index';
import { IMAGES } from '@/assets/images';
import { MetricCard, StatusBadge, CompactMetric } from '@/components/Stats';
import { DataTable, Column } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface CustomerRequest {
  id: string;
  type: 'inquiry' | 'complaint' | 'tracking' | 'modification';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  customer: {
    name: string;
    phone: string;
    email?: string;
  };
  subject: string;
  description: string;
  shipmentId?: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

interface ChatMessage {
  id: string;
  sender: 'agent' | 'customer';
  message: string;
  timestamp: string;
  attachments?: string[];
}

const mockRequests: CustomerRequest[] = [
  {
    id: 'req-001',
    type: 'tracking',
    priority: 'medium',
    status: 'in-progress',
    customer: {
      name: 'Aye Aye',
      phone: '+95-9-777888999',
      email: 'aye@example.com',
    },
    subject: 'Where is my package?',
    description: 'I ordered a laptop 3 days ago and tracking shows in-transit. When will it arrive?',
    shipmentId: 'shp-001',
    assignedTo: 'emp-005',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'req-002',
    type: 'complaint',
    priority: 'urgent',
    status: 'open',
    customer: {
      name: 'Win Win',
      phone: '+95-9-111222333',
    },
    subject: 'Delivery failed without attempt',
    description: 'Driver marked delivery as failed but never came to my address. This is unacceptable!',
    shipmentId: 'shp-005',
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    id: 'req-003',
    type: 'modification',
    priority: 'high',
    status: 'in-progress',
    customer: {
      name: 'Thida Thida',
      phone: '+95-9-000111222',
      email: 'thida@example.com',
    },
    subject: 'Change delivery address',
    description: 'Need to change delivery address to my office instead of home.',
    shipmentId: 'shp-004',
    assignedTo: 'emp-005',
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'req-004',
    type: 'inquiry',
    priority: 'low',
    status: 'resolved',
    customer: {
      name: 'Zaw Zaw',
      phone: '+95-9-999000111',
    },
    subject: 'Delivery time estimate',
    description: 'What is the estimated delivery time for standard service?',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    resolvedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'req-005',
    type: 'complaint',
    priority: 'high',
    status: 'open',
    customer: {
      name: 'Mya Mya',
      phone: '+95-9-888999000',
    },
    subject: 'Package damaged on arrival',
    description: 'Received package with visible damage. Box was crushed and contents may be affected.',
    shipmentId: 'shp-002',
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
];

const mockChatMessages: ChatMessage[] = [
  {
    id: 'msg-001',
    sender: 'customer',
    message: 'Hello, I need help tracking my package',
    timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
  {
    id: 'msg-002',
    sender: 'agent',
    message: 'Hello! I\'d be happy to help you track your package. Could you please provide your tracking number or AWB?',
    timestamp: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
  },
  {
    id: 'msg-003',
    sender: 'customer',
    message: 'BRX12345001',
    timestamp: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
  },
  {
    id: 'msg-004',
    sender: 'agent',
    message: 'Thank you! Let me check that for you. Your package is currently out for delivery and should arrive within the next 2 hours. The driver will call you 15 minutes before arrival.',
    timestamp: new Date(Date.now() - 7 * 60 * 1000).toISOString(),
  },
  {
    id: 'msg-005',
    sender: 'customer',
    message: 'Great! Thank you for the quick response.',
    timestamp: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
  },
];

const agentMetrics = {
  totalRequests: 127,
  resolved: 98,
  pending: 29,
  averageResponseTime: '4.2 min',
  satisfactionRate: 4.8,
  activeChats: 3,
};

export default function CustomerService() {
  const [searchQuery, setSearchQuery] = useState('');
  const location = useLocation();
  const getInitialCSTab = () => {
    if (location.pathname.includes('/chat')) return 'chat';
    return 'requests';
  };
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [selectedRequest, setSelectedRequest] = useState<CustomerRequest | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [activeTab, setActiveTab] = useState(getInitialCSTab());

  const filteredRequests = useMemo(() => {
    return mockRequests.filter((request) => {
      const matchesSearch =
        searchQuery === '' ||
        request.customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        request.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        request.shipmentId?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' || request.status === statusFilter;
      const matchesPriority = priorityFilter === 'all' || request.priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [searchQuery, statusFilter, priorityFilter]);

  const urgentAlerts = mockRequests.filter(
    (r) => r.priority === 'urgent' && r.status === 'open'
  );

  const requestColumns: Column<CustomerRequest>[] = [
    {
      id: 'id',
      header: 'Request ID',
      cell: (request) => (
        <span className="font-mono text-sm">{request.id}</span>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      cell: (request) => (
        <div>
          <div className="font-medium">{request.customer.name}</div>
          <div className="text-sm text-muted-foreground">{request.customer.phone}</div>
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      cell: (request) => (
        <Badge variant="outline" className="capitalize">
          {request.type}
        </Badge>
      ),
    },
    {
      id: 'subject',
      header: 'Subject',
      cell: (request) => (
        <div className="max-w-xs">
          <div className="font-medium truncate">{request.subject}</div>
          <div className="text-sm text-muted-foreground truncate">
            {request.description}
          </div>
        </div>
      ),
    },
    {
      id: 'priority',
      header: 'Priority',
      cell: (request) => {
        const colors = {
          low: 'bg-muted text-muted-foreground',
          medium: 'bg-accent text-accent-foreground',
          high: 'bg-chart-4 text-white',
          urgent: 'bg-destructive text-destructive-foreground',
        };
        return (
          <Badge className={colors[request.priority]}>
            {request.priority}
          </Badge>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      cell: (request) => {
        const colors = {
          open: 'bg-chart-4 text-white',
          'in-progress': 'bg-primary text-primary-foreground',
          resolved: 'bg-chart-3 text-white',
          closed: 'bg-muted text-muted-foreground',
        };
        return (
          <Badge className={colors[request.status]}>
            {request.status}
          </Badge>
        );
      },
    },
    {
      id: 'createdAt',
      header: 'Created',
      cell: (request) => (
        <span className="text-sm">{formatDate(request.createdAt, 'datetime')}</span>
      ),
    },
  ];

  const handleSendMessage = () => {
    if (chatMessage.trim()) {
      console.log('Sending message:', chatMessage);
      setChatMessage('');
    }
  };

  return (
    <div className="min-h-screen bg-background relative">
      <div
        className="absolute inset-0 z-0 opacity-30"
        style={{
          backgroundImage: `url(${IMAGES.SCREENSHOT_1095_2})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-transparent to-background/70" />
      
      <div className="relative z-10 p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Customer Service Portal</h1>
          <p className="text-muted-foreground mt-1">
            Manage customer inquiries, complaints, and support requests
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard
            title="Total Requests"
            value={agentMetrics.totalRequests}
            icon={<MessageSquare className="h-5 w-5" />}
            trend={8.2}
          />
          <MetricCard
            title="Resolved Today"
            value={agentMetrics.resolved}
            icon={<CheckCircle className="h-5 w-5" />}
            trend={12.5}
          />
          <MetricCard
            title="Pending"
            value={agentMetrics.pending}
            icon={<Clock className="h-5 w-5" />}
            trend={-5.3}
          />
          <MetricCard
            title="Satisfaction Rate"
            value={`${agentMetrics.satisfactionRate}/5.0`}
            icon={<TrendingUp className="h-5 w-5" />}
            trend={3.1}
          />
        </div>

        {urgentAlerts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6"
          >
            <Card className="border-destructive bg-destructive/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Urgent Alerts ({urgentAlerts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {urgentAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-start justify-between p-3 bg-background rounded-lg border"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{alert.subject}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {alert.customer.name} • {formatDate(alert.createdAt, 'time')}
                        </div>
                      </div>
                      <Button size="sm" variant="destructive">
                        Handle Now
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Customer Requests</CardTitle>
                    <CardDescription>Search and manage support requests</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by customer, subject, or AWB..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Priority</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <DataTable
                    columns={requestColumns}
                    data={filteredRequests}
                    searchable={false}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Agent Performance</CardTitle>
                <CardDescription>Your performance metrics today</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <CompactMetric
                    label="Avg Response Time"
                    value={agentMetrics.averageResponseTime}
                    icon={<Clock className="h-4 w-4" />}
                  />
                  <CompactMetric
                    label="Active Chats"
                    value={agentMetrics.activeChats}
                    icon={<MessageSquare className="h-4 w-4" />}
                  />
                  <CompactMetric
                    label="Resolution Rate"
                    value={`${Math.round((agentMetrics.resolved / agentMetrics.totalRequests) * 100)}%`}
                    icon={<CheckCircle className="h-4 w-4" />}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Live Chat</CardTitle>
                <CardDescription>Active customer conversation</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="requests">Requests</TabsTrigger>
                    <TabsTrigger value="chat">Chat</TabsTrigger>
                  </TabsList>
                  <TabsContent value="requests" className="mt-4">
                    {selectedRequest ? (
                      <div className="space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold">{selectedRequest.subject}</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {selectedRequest.customer.name}
                            </p>
                          </div>
                          <Button size="sm" variant="outline">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </div>
                        <Separator />
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span>{selectedRequest.customer.phone}</span>
                          </div>
                          {selectedRequest.customer.email && (
                            <div className="flex items-center gap-2 text-sm">
                              <Mail className="h-4 w-4 text-muted-foreground" />
                              <span>{selectedRequest.customer.email}</span>
                            </div>
                          )}
                          {selectedRequest.shipmentId && (
                            <div className="flex items-center gap-2 text-sm">
                              <Package className="h-4 w-4 text-muted-foreground" />
                              <span className="font-mono">{selectedRequest.shipmentId}</span>
                            </div>
                          )}
                        </div>
                        <Separator />
                        <div>
                          <p className="text-sm">{selectedRequest.description}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1">
                            Resolve
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1">
                            Escalate
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>Select a request to view details</p>
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="chat" className="mt-4">
                    <div className="space-y-4">
                      <ScrollArea className="h-[300px] pr-4">
                        <div className="space-y-4">
                          {mockChatMessages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`flex gap-2 ${
                                msg.sender === 'agent' ? 'flex-row-reverse' : ''
                              }`}
                            >
                              <Avatar className="h-8 w-8">
                                <AvatarFallback>
                                  {msg.sender === 'agent' ? 'A' : 'C'}
                                </AvatarFallback>
                              </Avatar>
                              <div
                                className={`flex-1 max-w-[80%] ${
                                  msg.sender === 'agent' ? 'text-right' : ''
                                }`}
                              >
                                <div
                                  className={`inline-block p-3 rounded-lg ${
                                    msg.sender === 'agent'
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-muted'
                                  }`}
                                >
                                  <p className="text-sm">{msg.message}</p>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {formatDate(msg.timestamp, 'time')}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                      <div className="flex gap-2">
                        <Button size="icon" variant="outline">
                          <Paperclip className="h-4 w-4" />
                        </Button>
                        <Input
                          placeholder="Type your message..."
                          value={chatMessage}
                          onChange={(e) => setChatMessage(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        />
                        <Button size="icon" onClick={handleSendMessage}>
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </motion.div>
      </div>
    </div>
  );
}