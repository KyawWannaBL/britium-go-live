import { useEffect, useMemo, useState } from 'react';
import { MapPin, Route } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { safeText } from '@/lib/displayValue';

type Coord = { lng: number; lat: number };

export function MapboxRoutePanel({
  title,
  destinationAddress,
  destinationCoord,
}: {
  title: string;
  destinationAddress?: unknown;
  destinationCoord?: Coord | null;
}) {
  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;
  const [origin, setOrigin] = useState<Coord | null>(null);
  const [summary, setSummary] = useState<{ distanceKm: number; durationMin: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigin({ lng: pos.coords.longitude, lat: pos.coords.latitude }),
      () => {}
    );
  }, []);

  useEffect(() => {
    async function run() {
      if (!token || !origin || !destinationCoord) return;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin.lng},${origin.lat};${destinationCoord.lng},${destinationCoord.lat}?geometries=geojson&access_token=${token}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const route = data?.routes?.[0];
      if (!route) return;
      setSummary({
        distanceKm: Math.round((Number(route.distance || 0) / 1000) * 10) / 10,
        durationMin: Math.round((Number(route.duration || 0) / 60) * 10) / 10,
      });
    }
    run();
  }, [token, origin, destinationCoord?.lat, destinationCoord?.lng]);

  const staticImage = useMemo(() => {
    if (!token || !destinationCoord) return null;
    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+1d4ed8(${destinationCoord.lng},${destinationCoord.lat})/${destinationCoord.lng},${destinationCoord.lat},12/700x260@2x?access_token=${token}`;
  }, [token, destinationCoord]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 h-4 w-4" />
          <span>{safeText(destinationAddress)}</span>
        </div>
        {summary && (
          <div className="flex items-center gap-2 text-sm">
            <Route className="h-4 w-4" />
            <span>{summary.distanceKm} km · {summary.durationMin} min</span>
          </div>
        )}
        {staticImage ? (
          <img
            src={staticImage}
            alt="Mapbox route preview"
            className="w-full rounded-xl border object-cover"
          />
        ) : (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            Map preview will appear when destination coordinates and Mapbox token are available.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
