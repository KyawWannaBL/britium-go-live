import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Navigation, Warehouse, Truck, Package, AlertCircle } from 'lucide-react';
import { Delivery, Employee, Warehouse as WarehouseType } from '@/lib/index';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { springPresets } from '@/lib/motion';

interface MapViewProps {
  deliveries?: Delivery[];
  drivers?: Employee[];
  warehouses?: WarehouseType[];
}

interface Coordinates {
  lat: number;
  lng: number;
}

interface MapMarker {
  id: string;
  type: 'delivery' | 'driver' | 'warehouse';
  lat: number;
  lng: number;
  label: string;
  status?: string;
  data?: any;
}

function isValidCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== 'object') return false;
  const coords = value as Record<string, unknown>;
  return typeof coords.lat === 'number' && typeof coords.lng === 'number';
}

function getDeliveryCoordinates(delivery: Delivery): Coordinates | null {
  const d = delivery as any;

  if (isValidCoordinates(d?.location)) return d.location;
  if (isValidCoordinates(d?.coordinates)) return d.coordinates;
  if (isValidCoordinates(d?.recipient?.address?.coordinates)) {
    return d.recipient.address.coordinates;
  }

  return null;
}

function getDriverCoordinates(driver: Employee): Coordinates | null {
  const d = driver as any;

  if (isValidCoordinates(d?.currentLocation)) return d.currentLocation;
  if (isValidCoordinates(d?.location)) return d.location;
  if (isValidCoordinates(d?.coordinates)) return d.coordinates;

  return null;
}

function getWarehouseCoordinates(warehouse: WarehouseType): Coordinates | null {
  const w = warehouse as any;

  if (isValidCoordinates(w?.address?.coordinates)) return w.address.coordinates;
  if (isValidCoordinates(w?.location?.coordinates)) return w.location.coordinates;
  if (isValidCoordinates(w?.coordinates)) return w.coordinates;

  return null;
}

function getDeliveryLabel(delivery: Delivery): string {
  const d = delivery as any;
  return d?.wayNumber || d?.awb || d?.id || 'Delivery';
}

function getWarehouseLabel(warehouse: WarehouseType): string {
  const w = warehouse as any;
  return w?.name || w?.warehouseName || w?.id || 'Warehouse';
}

function getDriverLabel(driver: Employee): string {
  const d = driver as any;
  return d?.name || d?.fullName || d?.id || 'Driver';
}

export function MapView({
  deliveries = [],
  drivers = [],
  warehouses = [],
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);
  const [mapCenter, setMapCenter] = useState({ lat: 16.8661, lng: 96.1951 });
  const [zoom, setZoom] = useState(12);

  const markers: MapMarker[] = useMemo(() => {
    const deliveryMarkers = deliveries
      .map((delivery) => {
        const coords = getDeliveryCoordinates(delivery);
        if (!coords) return null;

        return {
          id: delivery.id,
          type: 'delivery' as const,
          lat: coords.lat,
          lng: coords.lng,
          label: getDeliveryLabel(delivery),
          status: (delivery as any).status,
          data: { delivery },
        };
      })
      .filter(Boolean) as MapMarker[];

    const driverMarkers = drivers
      .map((driver) => {
        const coords = getDriverCoordinates(driver);
        if (!coords) return null;

        return {
          id: (driver as any).id,
          type: 'driver' as const,
          lat: coords.lat,
          lng: coords.lng,
          label: getDriverLabel(driver),
          status: (driver as any).status,
          data: driver,
        };
      })
      .filter(Boolean) as MapMarker[];

    const warehouseMarkers = warehouses
      .map((warehouse) => {
        const coords = getWarehouseCoordinates(warehouse);
        if (!coords) return null;

        return {
          id: (warehouse as any).id,
          type: 'warehouse' as const,
          lat: coords.lat,
          lng: coords.lng,
          label: getWarehouseLabel(warehouse),
          status: (warehouse as any).status,
          data: warehouse,
        };
      })
      .filter(Boolean) as MapMarker[];

    return [...deliveryMarkers, ...driverMarkers, ...warehouseMarkers];
  }, [deliveries, drivers, warehouses]);

  const getMarkerColor = (marker: MapMarker): string => {
    if (marker.type === 'warehouse') return 'bg-accent';
    if (marker.type === 'driver') return 'bg-primary';

    switch (marker.status) {
      case 'delivered':
        return 'bg-chart-3';
      case 'in-transit':
      case 'out-for-delivery':
      case 'out_for_delivery':
      case 'in_transit':
        return 'bg-primary';
      case 'failed':
        return 'bg-destructive';
      default:
        return 'bg-muted';
    }
  };

  const getMarkerIcon = (marker: MapMarker) => {
    switch (marker.type) {
      case 'warehouse':
        return <Warehouse className="w-4 h-4" />;
      case 'driver':
        return <Truck className="w-4 h-4" />;
      case 'delivery':
        return <Package className="w-4 h-4" />;
    }
  };

  const calculateMapPosition = (lat: number, lng: number) => {
    const latOffset = (lat - mapCenter.lat) * 100 * zoom;
    const lngOffset = (lng - mapCenter.lng) * 100 * zoom;

    return {
      top: `${50 - latOffset}%`,
      left: `${50 + lngOffset}%`,
    };
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 2, 20));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 2, 8));

  const handleRecenter = () => {
    if (markers.length === 0) return;

    const avgLat = markers.reduce((sum, marker) => sum + marker.lat, 0) / markers.length;
    const avgLng = markers.reduce((sum, marker) => sum + marker.lng, 0) / markers.length;

    setMapCenter({ lat: avgLat, lng: avgLng });
  };

  useEffect(() => {
    if (markers.length > 0 && mapCenter.lat === 16.8661 && mapCenter.lng === 96.1951) {
      handleRecenter();
    }
  }, [markers.length]);

  return (
    <div className="relative w-full h-full min-h-[600px] bg-muted/30 rounded-xl overflow-hidden">
      <div
        ref={mapRef}
        className="absolute inset-0 bg-gradient-to-br from-muted/50 via-background to-muted/50"
        style={{
          backgroundImage: `
            linear-gradient(to right, var(--border) 1px, transparent 1px),
            linear-gradient(to bottom, var(--border) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      >
        {markers.map((marker) => {
          const position = calculateMapPosition(marker.lat, marker.lng);

          return (
            <motion.div
              key={marker.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
              style={position}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={springPresets.gentle}
              whileHover={{ scale: 1.2 }}
              onClick={() => setSelectedMarker(marker)}
            >
              <div
                className={`
                  ${getMarkerColor(marker)}
                  text-white rounded-full p-2 shadow-lg
                  border-2 border-background
                  transition-all duration-200
                  ${selectedMarker?.id === marker.id ? 'ring-4 ring-ring' : ''}
                `}
              >
                {getMarkerIcon(marker)}
              </div>

              {marker.type === 'driver' && (
                <motion.div
                  className="absolute -top-1 -right-1 w-3 h-3 bg-chart-3 rounded-full border-2 border-background"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
        <Button size="icon" variant="secondary" onClick={handleZoomIn} className="shadow-lg">
          +
        </Button>
        <Button size="icon" variant="secondary" onClick={handleZoomOut} className="shadow-lg">
          -
        </Button>
        <Button size="icon" variant="secondary" onClick={handleRecenter} className="shadow-lg">
          <Navigation className="w-4 h-4" />
        </Button>
      </div>

      <div className="absolute top-4 left-4 flex gap-4 z-10">
        <Card className="p-3 shadow-lg">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-muted-foreground">
              Active Drivers ({drivers.filter((d: any) => d?.status === 'active').length})
            </span>
          </div>
        </Card>

        <Card className="p-3 shadow-lg">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full bg-chart-3" />
            <span className="text-muted-foreground">
              Delivered ({deliveries.filter((d: any) => d?.status === 'delivered').length})
            </span>
          </div>
        </Card>

        <Card className="p-3 shadow-lg">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full bg-accent" />
            <span className="text-muted-foreground">Warehouses ({warehouses.length})</span>
          </div>
        </Card>
      </div>

      {selectedMarker && (
        <motion.div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-md z-20"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={springPresets.gentle}
        >
          <Card className="p-4 shadow-2xl">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`${getMarkerColor(selectedMarker)} text-white rounded-full p-2`}>
                  {getMarkerIcon(selectedMarker)}
                </div>
                <div>
                  <h3 className="font-semibold">{selectedMarker.label}</h3>
                  <p className="text-sm text-muted-foreground capitalize">{selectedMarker.type}</p>
                </div>
              </div>

              <Button size="icon" variant="ghost" onClick={() => setSelectedMarker(null)}>
                ×
              </Button>
            </div>

            {selectedMarker.type === 'delivery' && selectedMarker.data?.delivery && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant="secondary" className="capitalize">
                    {String(selectedMarker.data.delivery.status || 'unknown').replace(/[_-]/g, ' ')}
                  </Badge>
                </div>

                {'recipientName' in selectedMarker.data.delivery && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Recipient</span>
                    <span className="text-sm font-medium">
                      {selectedMarker.data.delivery.recipientName}
                    </span>
                  </div>
                )}

                {'recipientAddress' in selectedMarker.data.delivery && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Address</span>
                    <span className="text-sm font-medium text-right max-w-[200px] truncate">
                      {selectedMarker.data.delivery.recipientAddress}
                    </span>
                  </div>
                )}

                {'codAmount' in selectedMarker.data.delivery &&
                  selectedMarker.data.delivery.codAmount != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">COD Amount</span>
                      <span className="text-sm font-medium">
                        MMK {Number(selectedMarker.data.delivery.codAmount).toLocaleString()}
                      </span>
                    </div>
                  )}
              </div>
            )}

            {selectedMarker.type === 'driver' && selectedMarker.data && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant="secondary" className="capitalize">
                    {String(selectedMarker.data.status || 'unknown')}
                  </Badge>
                </div>

                {'vehicleAssignment' in selectedMarker.data && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Vehicle</span>
                    <span className="text-sm font-medium">
                      {selectedMarker.data.vehicleAssignment?.licensePlate || 'N/A'}
                    </span>
                  </div>
                )}

                {'performance' in selectedMarker.data && selectedMarker.data.performance && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Success Rate</span>
                      <span className="text-sm font-medium">
                        {selectedMarker.data.performance.successRate}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total Deliveries</span>
                      <span className="text-sm font-medium">
                        {selectedMarker.data.performance.totalDeliveries}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {selectedMarker.type === 'warehouse' && selectedMarker.data && (
              <div className="space-y-2">
                {'type' in selectedMarker.data && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Type</span>
                    <Badge variant="secondary" className="capitalize">
                      {String(selectedMarker.data.type).replace(/[_-]/g, ' ')}
                    </Badge>
                  </div>
                )}

                {'capacity' in selectedMarker.data && selectedMarker.data.capacity && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Capacity</span>
                    <span className="text-sm font-medium">
                      {selectedMarker.data.capacity.current} / {selectedMarker.data.capacity.total}{' '}
                      {selectedMarker.data.capacity.unit}
                    </span>
                  </div>
                )}

                {'status' in selectedMarker.data && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge
                      variant={
                        selectedMarker.data.status === 'operational' ? 'default' : 'secondary'
                      }
                      className="capitalize"
                    >
                      {selectedMarker.data.status}
                    </Badge>
                  </div>
                )}

                {'contactPerson' in selectedMarker.data && selectedMarker.data.contactPerson && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Contact</span>
                    <span className="text-sm font-medium">
                      {selectedMarker.data.contactPerson.phone}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 pt-3 border-t flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />
              <span>
                {selectedMarker.lat.toFixed(4)}, {selectedMarker.lng.toFixed(4)}
              </span>
            </div>
          </Card>
        </motion.div>
      )}

      {markers.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Card className="p-6 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            <h3 className="font-semibold mb-1">No Data Available</h3>
            <p className="text-sm text-muted-foreground">
              No deliveries, drivers, or warehouses to display on the map
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}