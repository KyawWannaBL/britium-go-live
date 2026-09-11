import { useEffect, useRef, useState } from "react";
import { MapPin, RefreshCw, Route, AlertTriangle } from "lucide-react";

declare global {
  interface Window {
    mapboxgl?: any;
  }
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) return resolve();
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function loadCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

export default function WayplanMapboxPanel() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const [status, setStatus] = useState("Initializing Mapbox...");
  const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || import.meta.env.VITE_MAPBOX_TOKEN || "";

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!mapRef.current) return;
      if (!token) {
        setStatus("Mapbox token missing. Add VITE_MAPBOX_ACCESS_TOKEN in Vercel/local env.");
        return;
      }

      try {
        loadCss("https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css");
        await loadScript("https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js");
        if (cancelled || !window.mapboxgl || !mapRef.current) return;

        window.mapboxgl.accessToken = token;
        const map = new window.mapboxgl.Map({
          container: mapRef.current,
          style: "mapbox://styles/mapbox/dark-v11",
          center: [96.1735, 16.8409],
          zoom: 10,
        });

        map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
        map.addControl(new window.mapboxgl.FullscreenControl(), "top-right");

        const branches = [
          { code: "YGN", name: "Yangon HQ", lng: 96.1735, lat: 16.8409 },
          { code: "MDY", name: "Mandalay Branch", lng: 96.07492645095482, lat: 21.956116019017543 },
          { code: "NPT", name: "Naypyitaw Branch", lng: 96.1527056747248, lat: 19.73537445987814 },
        ];

        map.on("load", () => {
          branches.forEach((branch) => {
            const popup = new window.mapboxgl.Popup({ offset: 18 }).setHTML(`<strong>${branch.code}</strong><br/>${branch.name}`);
            new window.mapboxgl.Marker({ color: "#f6b84b" })
              .setLngLat([branch.lng, branch.lat])
              .setPopup(popup)
              .addTo(map);
          });

          map.addSource("britium-branch-line", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: branches.map((b) => [b.lng, b.lat]),
              },
            },
          });

          map.addLayer({
            id: "britium-branch-line",
            type: "line",
            source: "britium-branch-line",
            paint: {
              "line-color": "#4ea8de",
              "line-width": 3,
              "line-dasharray": [2, 2],
            },
          });
        });

        mapInstanceRef.current = map;
        setStatus("Mapbox branch network loaded. Wire live wayplan stops from backend in the next SQL/API phase.");
      } catch (error: any) {
        setStatus(error?.message || "Mapbox failed to load.");
      }
    }

    init();

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [token]);

  return (
    <section className="mb-4 rounded-2xl border border-[#1a3a5c] bg-[#071a2b] p-4 shadow-xl">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-3">
        <div>
          <div className="text-[#f6b84b] text-[12px] font-black uppercase tracking-[0.18em] flex items-center gap-2">
            <Route size={16} /> Wayplan Mapbox Command Layer
          </div>
          <p className="text-[#4d7a9b] text-[12px] mt-1">YGN / MDY / NPT branch network, ready for live pickup and route stop overlays.</p>
        </div>
        <button
          type="button"
          onClick={() => mapInstanceRef.current?.resize?.()}
          className="inline-flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#0b2236] px-3 py-2 text-[11px] font-black uppercase tracking-widest text-[#eef8ff] hover:border-[#f6b84b] hover:text-[#f6b84b]"
        >
          <RefreshCw size={14} /> Resize Map
        </button>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-3">
        <div ref={mapRef} className="h-[420px] overflow-hidden rounded-2xl border border-[#1a3a5c] bg-[#061524]" />
        <div className="rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4 text-[12px] text-[#c8dff0] space-y-3">
          <div className="flex items-start gap-2 text-[#4ea8de]"><MapPin size={15} /> Yangon HQ / Mandalay / Naypyitaw branches</div>
          <div className="flex items-start gap-2 text-[#f6b84b]"><AlertTriangle size={15} /> {status}</div>
          <div className="text-[#4d7a9b]">Next: connect pickup waypoints from be_portal_pickup_requests and wayplan stops.</div>
        </div>
      </div>
    </section>
  );
}
