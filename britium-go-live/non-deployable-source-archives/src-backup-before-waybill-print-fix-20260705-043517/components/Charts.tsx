import { LineChart, Line, BarChart, Bar, PieChart, Pie, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Package, Truck, DollarSign, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/index';

interface ChartProps {
  data: any[];
  height?: number;
}

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export function DeliveryTrendChart({ data, height = 300 }: ChartProps) {
  const chartData = data.map(item => ({
    date: formatDate(item.date, 'short'),
    deliveries: item.deliveries || 0,
    completed: item.completed || 0,
    failed: item.failed || 0,
  }));

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Delivery Trends</h3>
          <p className="text-sm text-muted-foreground">Daily delivery performance over time</p>
        </div>
        <Package className="h-5 w-5 text-muted-foreground" />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis 
            dataKey="date" 
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
          />
          <YAxis 
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="deliveries" 
            stroke={CHART_COLORS[0]} 
            strokeWidth={2}
            dot={{ fill: CHART_COLORS[0], r: 4 }}
            activeDot={{ r: 6 }}
            name="Total Deliveries"
          />
          <Line 
            type="monotone" 
            dataKey="completed" 
            stroke={CHART_COLORS[2]} 
            strokeWidth={2}
            dot={{ fill: CHART_COLORS[2], r: 4 }}
            name="Completed"
          />
          <Line 
            type="monotone" 
            dataKey="failed" 
            stroke={CHART_COLORS[4]} 
            strokeWidth={2}
            dot={{ fill: CHART_COLORS[4], r: 4 }}
            name="Failed"
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function RevenueChart({ data, height = 300 }: ChartProps) {
  const chartData = data.map(item => ({
    serviceType: item.serviceType || 'Unknown',
    revenue: item.revenue || 0,
    count: item.count || 0,
  }));

  const serviceTypeLabels: Record<string, string> = {
    'standard': 'Standard',
    'express': 'Express',
    'same-day': 'Same Day',
    'next-day': 'Next Day',
    'economy': 'Economy',
  };

  const formattedData = chartData.map(item => ({
    ...item,
    serviceType: serviceTypeLabels[item.serviceType] || item.serviceType,
  }));

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Revenue by Service Type</h3>
          <p className="text-sm text-muted-foreground">Revenue breakdown across service categories</p>
        </div>
        <DollarSign className="h-5 w-5 text-muted-foreground" />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={formattedData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis 
            dataKey="serviceType" 
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
          />
          <YAxis 
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickFormatter={(value) => formatCurrency(value)}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
            formatter={(value: number) => [formatCurrency(value), 'Revenue']}
          />
          <Legend />
          <Bar 
            dataKey="revenue" 
            fill={CHART_COLORS[0]} 
            radius={[8, 8, 0, 0]}
            name="Revenue"
          />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function StatusDistributionChart({ data, height = 300 }: ChartProps) {
  const chartData = data.map((item, index) => ({
    name: item.status || 'Unknown',
    value: item.count || 0,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));

  const statusLabels: Record<string, string> = {
    'pending': 'Pending',
    'assigned': 'Assigned',
    'picked-up': 'Picked Up',
    'in-transit': 'In Transit',
    'out-for-delivery': 'Out for Delivery',
    'delivered': 'Delivered',
    'failed': 'Failed',
    'cancelled': 'Cancelled',
    'returned': 'Returned',
  };

  const formattedData = chartData.map(item => ({
    ...item,
    name: statusLabels[item.name] || item.name,
  }));

  const total = formattedData.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Delivery Status Distribution</h3>
          <p className="text-sm text-muted-foreground">Current status breakdown of all deliveries</p>
        </div>
        <Clock className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex flex-col lg:flex-row items-center gap-8">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={formattedData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={100}
              fill="#8884d8"
              dataKey="value"
            >
              {formattedData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-2 min-w-[200px]">
          {formattedData.map((item, index) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-muted-foreground">{item.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{item.value}</span>
                <span className="text-xs text-muted-foreground">
                  ({((item.value / total) * 100).toFixed(1)}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function FleetActivityChart({ data, height = 300 }: ChartProps) {
  const chartData = data.map(item => ({
    time: item.time || '',
    active: item.active || 0,
    idle: item.idle || 0,
    maintenance: item.maintenance || 0,
  }));

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Fleet Activity</h3>
          <p className="text-sm text-muted-foreground">Real-time vehicle utilization and status</p>
        </div>
        <Truck className="h-5 w-5 text-muted-foreground" />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.8}/>
              <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0.1}/>
            </linearGradient>
            <linearGradient id="colorIdle" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS[3]} stopOpacity={0.8}/>
              <stop offset="95%" stopColor={CHART_COLORS[3]} stopOpacity={0.1}/>
            </linearGradient>
            <linearGradient id="colorMaintenance" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS[4]} stopOpacity={0.8}/>
              <stop offset="95%" stopColor={CHART_COLORS[4]} stopOpacity={0.1}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis 
            dataKey="time" 
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
          />
          <YAxis 
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
          />
          <Legend />
          <Area 
            type="monotone" 
            dataKey="active" 
            stroke={CHART_COLORS[0]} 
            fillOpacity={1} 
            fill="url(#colorActive)"
            name="Active"
          />
          <Area 
            type="monotone" 
            dataKey="idle" 
            stroke={CHART_COLORS[3]} 
            fillOpacity={1} 
            fill="url(#colorIdle)"
            name="Idle"
          />
          <Area 
            type="monotone" 
            dataKey="maintenance" 
            stroke={CHART_COLORS[4]} 
            fillOpacity={1} 
            fill="url(#colorMaintenance)"
            name="Maintenance"
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}