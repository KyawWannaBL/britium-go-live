// @ts-nocheck
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Calendar,
  Download,
  TrendingUp,
  TrendingDown,
  Package,
  DollarSign,
  Users,
  MapPin,
  Star,
  Clock,
  BarChart3,
  PieChart,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MetricCard, StatsGrid, CompactMetric, ProgressMetric } from '@/components/Stats';
import {
  DeliveryTrendChart,
  RevenueChart,
  StatusDistributionChart,
  FleetActivityChart,
} from '@/components/Charts';
import { DataTable, Column } from '@/components/DataTable';
import { IMAGES } from '@/assets/images';
import { mockDeliveries, mockShipments, mockEmployees, mockKPIs } from '@/data/index';
import {
  calculateDeliveryMetrics,
  calculateRevenue,
  formatCurrency,
  formatDate,
  DeliveryStatus,
  ServiceType,
} from '@/lib/index';
import { springPresets, fadeInUp, staggerContainer, staggerItem } from '@/lib/motion';

interface PerformanceData {
  date: string;
  deliveries: number;
  revenue: number;
  onTimeRate: number;
}

interface ServiceTypeRevenue {
  serviceType: ServiceType;
  revenue: number;
  count: number;
}

interface RegionData {
  region: string;
  deliveries: number;
  revenue: number;
}

interface DriverPerformance {
  id: string;
  name: string;
  totalDeliveries: number;
  successRate: number;
  onTimeRate: number;
  rating: number;
}

interface WarehouseEfficiency {
  id: string;
  name: string;
  throughput: number;
  accuracy: number;
  utilization: number;
}

export default function Analytics() {
  const location = useLocation();
  const getInitialAnalyticsTab = () => {
    if (location.pathname.includes('/overview')) return 'overview';
    if (location.pathname.includes('/revenue')) return 'revenue';
    if (location.pathname.includes('/drivers')) return 'drivers';
    return 'overview';
  };
  const [dateRange, setDateRange] = useState('7d');
  const [selectedTab, setSelectedTab] = useState(getInitialAnalyticsTab());

  const metrics = calculateDeliveryMetrics(mockDeliveries);
  const revenue = calculateRevenue(mockDeliveries, mockShipments);

  const performanceData: PerformanceData[] = [
    { date: '2026-04-03', deliveries: 145, revenue: 1250000, onTimeRate: 92.5 },
    { date: '2026-04-04', deliveries: 168, revenue: 1420000, onTimeRate: 94.2 },
    { date: '2026-04-05', deliveries: 152, revenue: 1380000, onTimeRate: 93.8 },
    { date: '2026-04-06', deliveries: 189, revenue: 1650000, onTimeRate: 95.1 },
    { date: '2026-04-07', deliveries: 176, revenue: 1520000, onTimeRate: 94.7 },
    { date: '2026-04-08', deliveries: 198, revenue: 1780000, onTimeRate: 96.2 },
    { date: '2026-04-09', deliveries: 219, revenue: 1950000, onTimeRate: 95.8 },
  ];

  const serviceTypeRevenue: ServiceTypeRevenue[] = [
    { serviceType: 'express', revenue: 3200000, count: 342 },
    { serviceType: 'same-day', revenue: 2800000, count: 198 },
    { serviceType: 'standard', revenue: 1950000, count: 456 },
    { serviceType: 'next-day', revenue: 1650000, count: 187 },
    { serviceType: 'economy', revenue: 850000, count: 312 },
  ];

  const regionData: RegionData[] = [
    { region: 'Yangon Central', deliveries: 542, revenue: 4850000 },
    { region: 'Yangon North', deliveries: 387, revenue: 3420000 },
    { region: 'Yangon South', deliveries: 298, revenue: 2650000 },
    { region: 'Mandalay', deliveries: 215, revenue: 1920000 },
    { region: 'Other Regions', deliveries: 105, revenue: 950000 },
  ];

  const driverPerformance: DriverPerformance[] = mockEmployees
    .filter(emp => emp.role === 'driver' && emp.performance)
    .map(emp => ({
      id: emp.id,
      name: emp.name,
      totalDeliveries: emp.performance!.totalDeliveries,
      successRate: emp.performance!.successRate,
      onTimeRate: emp.performance!.onTimeRate,
      rating: emp.performance!.averageRating,
    }));

  const warehouseEfficiency: WarehouseEfficiency[] = [
    { id: 'wh-001', name: 'Yangon Central Hub', throughput: 1250, accuracy: 98.5, utilization: 64 },
    { id: 'wh-002', name: 'Mandalay Branch', throughput: 680, accuracy: 97.2, utilization: 55 },
    { id: 'wh-003', name: 'Yangon Sorting Center', throughput: 2100, accuracy: 99.1, utilization: 60 },
  ];

  const statusDistribution = [
    { status: 'Delivered', value: metrics.delivered, color: 'hsl(var(--chart-3))' },
    { status: 'In Transit', value: Math.floor(metrics.pending * 0.6), color: 'hsl(var(--chart-1))' },
    { status: 'Pending', value: Math.floor(metrics.pending * 0.4), color: 'hsl(var(--chart-2))' },
    { status: 'Failed', value: metrics.failed, color: 'hsl(var(--destructive))' },
  ];

  const driverColumns: Column<DriverPerformance>[] = [
    {
      id: 'name',
      header: 'Driver Name',
      sortable: true,
    },
    {
      id: 'totalDeliveries',
      header: 'Total Deliveries',
      sortable: true,
      cell: (row) => value.toLocaleString(),
    },
    {
      id: 'successRate',
      header: 'Success Rate',
      sortable: true,
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.onTimeRate.toFixed(1)}%</span>
          {row.onTimeRate >= 95 ? (
            <TrendingUp className="h-4 w-4 text-chart-3" />
          ) : (
            <TrendingDown className="h-4 w-4 text-destructive" />
          )}
        </div>
      ),
    },
    {
      id: 'onTimeRate',
      header: 'On-Time Rate',
      sortable: true,
      cell: (row) => `${row.onTimeRate.toFixed(1)}%`,
    },
    {
      id: 'rating',
      header: 'Rating',
      sortable: true,
      cell: (row) => (
        <div className="flex items-center gap-1">
          <Star className="h-4 w-4 fill-chart-4 text-chart-4" />
          <span className="font-medium">{row.onTimeRate.toFixed(1)}</span>
        </div>
      ),
    },
  ];

  const warehouseColumns: Column<WarehouseEfficiency>[] = [
    {
      id: 'name',
      header: 'Warehouse',
      sortable: true,
    },
    {
      id: 'throughput',
      header: 'Daily Throughput',
      sortable: true,
      cell: (row) => `${value.toLocaleString()} packages`,
    },
    {
      id: 'accuracy',
      header: 'Accuracy',
      sortable: true,
      cell: (row) => (
        <ProgressMetric
          label=""
          value={value}
          max={100}
          unit="%"
          color={value >= 98 ? 'hsl(var(--chart-3))' : 'hsl(var(--chart-4))'}
        />
      ),
    },
    {
      id: 'utilization',
      header: 'Utilization',
      sortable: true,
      cell: (row) => (
        <ProgressMetric
          label=""
          value={value}
          max={100}
          unit="%"
          color="hsl(var(--chart-1))"
        />
      ),
    },
  ];

  const handleExport = () => {
    const data = {
      dateRange,
      metrics,
      revenue,
      performanceData,
      serviceTypeRevenue,
      regionData,
      driverPerformance,
      warehouseEfficiency,
      generatedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-report-${formatDate(new Date(), 'short')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background relative">
      <div
        className="absolute inset-0 z-0 opacity-30"
        style={{
          backgroundImage: `url(${IMAGES.SCREENSHOT_8648})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-transparent to-background/70" />
      
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="relative z-10 container mx-auto px-4 py-8 space-y-8"
      >
        <motion.div variants={staggerItem} className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Analytics Dashboard</h1>
            <p className="text-muted-foreground mt-2">
              Comprehensive insights into delivery performance and operations
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[180px]">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 Hours</SelectItem>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="90d">Last 90 Days</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleExport} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </motion.div>

        <motion.div variants={staggerItem}>
          <StatsGrid
            metrics={[
              {
                title: 'Total Deliveries',
                value: metrics.total,
                trend: 12.5,
                icon: <Package className="h-5 w-5" />,
                unit: 'deliveries',
              },
              {
                title: 'Success Rate',
                value: `${metrics.successRate}%`,
                trend: 2.3,
                icon: <TrendingUp className="h-5 w-5" />,
              },
              {
                title: 'Total Revenue',
                value: formatCurrency(revenue.totalRevenue),
                trend: 18.7,
                icon: <DollarSign className="h-5 w-5" />,
              },
              {
                title: 'On-Time Rate',
                value: `${metrics.onTimeRate}%`,
                trend: 3.1,
                icon: <Clock className="h-5 w-5" />,
              },
            ]}
          />
        </motion.div>

        <motion.div variants={staggerItem}>
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">
                <BarChart3 className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="revenue">
                <DollarSign className="h-4 w-4 mr-2" />
                Revenue
              </TabsTrigger>
              <TabsTrigger value="drivers">
                <Users className="h-4 w-4 mr-2" />
                Drivers
              </TabsTrigger>
              <TabsTrigger value="warehouses">
                <MapPin className="h-4 w-4 mr-2" />
                Warehouses
              </TabsTrigger>
              <TabsTrigger value="satisfaction">
                <Star className="h-4 w-4 mr-2" />
                Satisfaction
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Delivery Performance Trend</CardTitle>
                    <CardDescription>Daily delivery volume over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DeliveryTrendChart
                      data={performanceData.map(d => ({
                        date: formatDate(d.date, 'short'),
                        deliveries: d.deliveries,
                      }))}
                      height={300}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Status Distribution</CardTitle>
                    <CardDescription>Current delivery status breakdown</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <StatusDistributionChart data={statusDistribution} height={300} />
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Fleet Activity</CardTitle>
                  <CardDescription>Real-time fleet utilization and activity</CardDescription>
                </CardHeader>
                <CardContent>
                  <FleetActivityChart
                    data={performanceData.map(d => ({
                      date: formatDate(d.date, 'short'),
                      active: Math.floor(d.deliveries * 0.15),
                      idle: Math.floor(d.deliveries * 0.05),
                    }))}
                    height={300}
                  />
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Average Delivery Time</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-3xl font-bold">{metrics.averageDeliveryTime.toFixed(1)}h</div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Activity className="h-4 w-4" />
                        <span>Within SLA targets</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">COD Collection</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-3xl font-bold">{formatCurrency(revenue.codCollected)}</div>
                      <div className="flex items-center gap-2 text-sm text-chart-3">
                        <TrendingUp className="h-4 w-4" />
                        <span>+15.2% from last period</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Failed Deliveries</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-3xl font-bold">{metrics.failed}</div>
                      <div className="flex items-center gap-2 text-sm text-chart-3">
                        <TrendingDown className="h-4 w-4" />
                        <span>-12.1% from last period</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="revenue" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Revenue by Service Type</CardTitle>
                    <CardDescription>Revenue breakdown across service categories</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <RevenueChart
                      data={serviceTypeRevenue.map(s => ({
                        name: s.serviceType.charAt(0).toUpperCase() + s.serviceType.slice(1),
                        revenue: s.revenue,
                      }))}
                      height={300}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Revenue by Region</CardTitle>
                    <CardDescription>Geographic revenue distribution</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {regionData.map((region, index) => (
                        <div key={index} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{region.region}</span>
                            <span className="text-muted-foreground">{formatCurrency(region.revenue)}</span>
                          </div>
                          <ProgressMetric
                            label=""
                            value={region.revenue}
                            max={Math.max(...regionData.map(r => r.revenue))}
                            color="hsl(var(--chart-1))"
                          />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Total Revenue</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CompactMetric
                      label=""
                      value={formatCurrency(revenue.totalRevenue)}
                      icon={<DollarSign className="h-5 w-5" />}
                      color="hsl(var(--chart-1))"
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">COD Collected</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CompactMetric
                      label=""
                      value={formatCurrency(revenue.codCollected)}
                      icon={<DollarSign className="h-5 w-5" />}
                      color="hsl(var(--chart-3))"
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Prepaid Revenue</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CompactMetric
                      label=""
                      value={formatCurrency(revenue.prepaidRevenue)}
                      icon={<DollarSign className="h-5 w-5" />}
                      color="hsl(var(--chart-2))"
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Pending COD</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CompactMetric
                      label=""
                      value={formatCurrency(revenue.pendingCod)}
                      icon={<DollarSign className="h-5 w-5" />}
                      color="hsl(var(--chart-4))"
                    />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="drivers" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Driver Performance Metrics</CardTitle>
                  <CardDescription>
                    Individual driver statistics and performance indicators
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={driverColumns}
                    data={driverPerformance}
                    searchable
                    filterable
                    exportable
                  />
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Top Performer</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-2xl font-bold">{driverPerformance[0]?.name}</div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Star className="h-4 w-4 fill-chart-4 text-chart-4" />
                        <span>{driverPerformance[0]?.rating.toFixed(1)} rating</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Average Success Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-2xl font-bold">
                        {(
                          driverPerformance.reduce((sum, d) => sum + d.successRate, 0) /
                          driverPerformance.length
                        ).toFixed(1)}
                        %
                      </div>
                      <div className="flex items-center gap-2 text-sm text-chart-3">
                        <TrendingUp className="h-4 w-4" />
                        <span>Above target</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Total Deliveries</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-2xl font-bold">
                        {driverPerformance
                          .reduce((sum, d) => sum + d.totalDeliveries, 0)
                          .toLocaleString()}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Package className="h-4 w-4" />
                        <span>All drivers combined</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="warehouses" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Warehouse Efficiency Metrics</CardTitle>
                  <CardDescription>
                    Operational efficiency and utilization across facilities
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={warehouseColumns}
                    data={warehouseEfficiency}
                    searchable
                    exportable
                  />
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Total Throughput</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-2xl font-bold">
                        {warehouseEfficiency
                          .reduce((sum, w) => sum + w.throughput, 0)
                          .toLocaleString()}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Package className="h-4 w-4" />
                        <span>Packages per day</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Average Accuracy</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-2xl font-bold">
                        {(
                          warehouseEfficiency.reduce((sum, w) => sum + w.accuracy, 0) /
                          warehouseEfficiency.length
                        ).toFixed(1)}
                        %
                      </div>
                      <div className="flex items-center gap-2 text-sm text-chart-3">
                        <TrendingUp className="h-4 w-4" />
                        <span>Excellent performance</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Average Utilization</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-2xl font-bold">
                        {(
                          warehouseEfficiency.reduce((sum, w) => sum + w.utilization, 0) /
                          warehouseEfficiency.length
                        ).toFixed(0)}
                        %
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Activity className="h-4 w-4" />
                        <span>Capacity usage</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="satisfaction" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Customer Satisfaction Score</CardTitle>
                    <CardDescription>Overall customer feedback and ratings</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      <div className="text-center">
                        <div className="text-6xl font-bold">4.7</div>
                        <div className="flex items-center justify-center gap-1 mt-2">
                          {[1, 2, 3, 4, 5].map(i => (
                            <Star
                              key={i}
                              className={`h-6 w-6 ${
                                i <= 4 ? 'fill-chart-4 text-chart-4' : 'text-muted'
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-muted-foreground mt-2">Based on 1,247 reviews</p>
                      </div>

                      <div className="space-y-3">
                        {[
                          { stars: 5, count: 892, percentage: 71.5 },
                          { stars: 4, count: 245, percentage: 19.6 },
                          { stars: 3, count: 78, percentage: 6.3 },
                          { stars: 2, count: 22, percentage: 1.8 },
                          { stars: 1, count: 10, percentage: 0.8 },
                        ].map(rating => (
                          <div key={rating.stars} className="flex items-center gap-3">
                            <div className="flex items-center gap-1 w-20">
                              <span className="text-sm font-medium">{rating.stars}</span>
                              <Star className="h-3 w-3 fill-chart-4 text-chart-4" />
                            </div>
                            <ProgressMetric
                              label=""
                              value={rating.percentage}
                              max={100}
                              color="hsl(var(--chart-4))"
                            />
                            <span className="text-sm text-muted-foreground w-16 text-right">
                              {rating.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Satisfaction Trends</CardTitle>
                    <CardDescription>Customer satisfaction over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DeliveryTrendChart
                      data={performanceData.map(d => ({
                        date: formatDate(d.date, 'short'),
                        deliveries: 4.5 + Math.random() * 0.5,
                      }))}
                      height={300}
                    />
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Delivery Experience</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-2xl font-bold">4.8/5.0</div>
                      <div className="flex items-center gap-2 text-sm text-chart-3">
                        <TrendingUp className="h-4 w-4" />
                        <span>+0.2 from last month</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Driver Courtesy</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-2xl font-bold">4.9/5.0</div>
                      <div className="flex items-center gap-2 text-sm text-chart-3">
                        <TrendingUp className="h-4 w-4" />
                        <span>Excellent feedback</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Package Condition</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-2xl font-bold">4.6/5.0</div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Activity className="h-4 w-4" />
                        <span>Good performance</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Communication</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-2xl font-bold">4.7/5.0</div>
                      <div className="flex items-center gap-2 text-sm text-chart-3">
                        <TrendingUp className="h-4 w-4" />
                        <span>Above average</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>
      </motion.div>
    </div>
  );
}