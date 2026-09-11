// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

function text(value: any, fallback = "") {
  const v = String(value ?? "").trim();
  return v || fallback;
}

function personCode(row: any) {
  return text(row.workforce_code || row.rider_code || row.driver_code || row.helper_code || row.employee_code || row.code || row.id);
}

function personName(row: any) {
  return text(row.display_name || row.full_name || row.name || row.rider_name || row.driver_name || row.helper_name || row.employee_name || row.username);
}

function personType(row: any) {
  return text(row.workforce_type || row.role || row.account_type || row.type).toLowerCase();
}

function vehicleCode(row: any) {
  return text(row.vehicle_no || row.fleet_id || row.vehicle_id || row.plate_no || row.id);
}

function vehicleLabel(row: any) {
  return `${vehicleCode(row)} — ${text(row.vehicle_type || row.type || "vehicle")}`;
}

export default function WayplanStudioPage() {
  const [snapshot, setSnapshot] = useState<any>({ pickups: [], routes: [], workforce: [], vehicles: [] });
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("Loading Wayplan Studio...");
  const [dispatch, setDispatch] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);

  const pickups = Array.isArray(snapshot.pickups) ? snapshot.pickups : [];
  const routes = Array.isArray(snapshot.routes) ? snapshot.routes : [];
  const workforce = Array.isArray(snapshot.workforce) ? snapshot.workforce : [];
  const vehicles = Array.isArray(snapshot.vehicles) ? snapshot.vehicles : [];

  const riders = workforce.filter((w: any) => personType(w).includes("rider") || personCode(w).toLowerCase().includes("rider"));
  const drivers = workforce.filter((w: any) => personType(w).includes("driver") || personCode(w).toLowerCase().includes("driver"));
  const helpers = workforce.filter((w: any) => personType(w).includes("helper") || personCode(w).toLowerCase().includes("helper"));

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, value]) => value).map(([key]) => key),
    [selected]
  );

  const stats = useMemo(() => {
    const pending = pickups.filter((p: any) => !p.wayplan_route_code).length;
    const generated = pickups.filter((p: any) => p.wayplan_route_code).length;
    const dispatched = routes.filter((r: any) => r.status === "dispatched").length;
    return { pending, generated, dispatched };
  }, [pickups, routes]);

  async function load() {
    setLoading(true);
    setMessage("Loading live pickups, routes, workforce, and vehicle master...");

    const { data, error } = await (supabase as any).rpc("be_wayplan_studio_snapshot", {
      p_payload: { limit: 300 },
    });

    if (error) {
      setMessage(`Wayplan Studio load failed: ${error.message}`);
      setLoading(false);
      return;
    }

    setSnapshot(data || { pickups: [], routes: [], workforce: [], vehicles: [] });
    setMessage("Wayplan Studio loaded.");
    setLoading(false);
  }

  async function generate() {
    setMessage("Generating wayplans by route zone...");

    const { data, error } = await (supabase as any).rpc("be_wayplan_studio_generate", {
      p_payload: {
        pickup_ids: selectedIds,
      },
    });

    if (error) {
      setMessage(`Generate failed: ${error.message}`);
      return;
    }

    setSelected({});
    setMessage(data?.message || "Wayplans generated.");
    await load();
  }

  async function dispatchRoute(route: any) {
    const form = dispatch[route.id] || {};
    setMessage(`Dispatching ${route.route_code}...`);

    const rider = riders.find((r: any) => personCode(r) === form.rider_code);
    const driver = drivers.find((r: any) => personCode(r) === form.driver_code);
    const helper = helpers.find((r: any) => personCode(r) === form.helper_code);
    const vehicle = vehicles.find((v: any) => vehicleCode(v) === form.vehicle_no || text(v.fleet_id) === form.vehicle_id);

    const { error } = await (supabase as any).rpc("be_wayplan_studio_dispatch", {
      p_payload: {
        route_id: route.id,
        vehicle_id: text(vehicle?.fleet_id || vehicle?.vehicle_id || vehicle?.id),
        vehicle_no: text(vehicle?.vehicle_no || vehicle?.plate_no || form.vehicle_no),
        driver_code: form.driver_code || "",
        driver_name: personName(driver),
        helper_code: form.helper_code || "",
        helper_name: personName(helper),
        rider_code: form.rider_code || "",
        rider_name: personName(rider),
        special_instructions: form.special_instructions || "",
      },
    });

    if (error) {
      setMessage(`Dispatch failed: ${error.message}`);
      return;
    }

    setMessage(`${route.route_code} dispatched and synchronized.`);
    await load();
  }

  function updateDispatch(routeId: string, patch: any) {
    setDispatch((current) => ({
      ...current,
      [routeId]: {
        ...(current[routeId] || {}),
        ...patch,
      },
    }));
  }

  function printManifest(route: any) {
    const stops = Array.isArray(route.stops) ? route.stops : [];
    const html = `
      <html>
      <head>
        <title>${route.route_code}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; }
          h1 { margin: 0 0 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #ccc; padding: 8px; font-size: 12px; text-align: left; }
          th { background: #0f172a; color: white; }
        </style>
      </head>
      <body>
        <h1>BRITIUM EXPRESS — Wayplan Manifest</h1>
        <p><b>Route:</b> ${route.route_code} | <b>Type:</b> ${route.route_type} | <b>Zone:</b> ${route.route_zone}</p>
        <p><b>Vehicle:</b> ${route.vehicle_no || "-"} | <b>Driver:</b> ${route.driver_name || "-"} | <b>Helper:</b> ${route.helper_name || "-"} | <b>Rider:</b> ${route.rider_name || "-"}</p>
        <table>
          <thead>
            <tr>
              <th>Seq</th><th>Pickup ID</th><th>Merchant</th><th>Township</th><th>Address</th><th>Parcels</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${stops.map((s: any) => `
              <tr>
                <td>${s.stop_sequence || ""}</td>
                <td>${s.pickup_id || ""}</td>
                <td>${s.merchant_name || ""}</td>
                <td>${s.pickup_township || ""}</td>
                <td>${s.pickup_address || ""}</td>
                <td>${s.parcel_count || 0}</td>
                <td>${s.status || ""}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <script>window.print()</script>
      </body>
      </html>
    `;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-[98vw] space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black tracking-[0.35em] text-blue-600">
                BRITIUM EXPRESS
              </p>
              <h1 className="mt-2 text-4xl font-black text-slate-950">
                Wayplan Studio
              </h1>
              <p className="mt-2 max-w-5xl font-semibold text-slate-600">
                Generate route groups from live pickup requests, assign vehicle/driver/helper/rider teams,
                print manifests, and dispatch synchronized wayplans to Rider/Driver/Helper workflow.
              </p>
            </div>

            <button
              onClick={load}
              disabled={loading}
              className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-60"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          <div className="mt-4 rounded-2xl bg-blue-50 p-4 font-bold text-blue-900">
            {message}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-5">
            <div className="rounded-2xl border p-4">
              <p className="text-sm font-black uppercase text-slate-500">Live Pickups</p>
              <p className="text-3xl font-black">{pickups.length}</p>
            </div>
            <div className="rounded-2xl border p-4">
              <p className="text-sm font-black uppercase text-slate-500">Pending Wayplan</p>
              <p className="text-3xl font-black">{stats.pending}</p>
            </div>
            <div className="rounded-2xl border p-4">
              <p className="text-sm font-black uppercase text-slate-500">Generated</p>
              <p className="text-3xl font-black">{stats.generated}</p>
            </div>
            <div className="rounded-2xl border p-4">
              <p className="text-sm font-black uppercase text-slate-500">Routes</p>
              <p className="text-3xl font-black">{routes.length}</p>
            </div>
            <div className="rounded-2xl border p-4">
              <p className="text-sm font-black uppercase text-slate-500">Dispatched</p>
              <p className="text-3xl font-black">{stats.dispatched}</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[520px_1fr]">
          <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-black">Pickup Queue</h2>
              <button
                onClick={generate}
                className="rounded-2xl bg-blue-700 px-4 py-3 text-sm font-black text-white"
              >
                Generate Wayplan
              </button>
            </div>

            <p className="mt-2 text-sm font-bold text-slate-500">
              Select pickups, or generate with no selection to route all pending pickups.
            </p>

            <div className="mt-4 max-h-[72vh] space-y-3 overflow-y-auto pr-2">
              {pickups.map((pickup: any) => (
                <label
                  key={pickup.pickup_id}
                  className="block rounded-2xl border border-slate-200 p-4 hover:bg-slate-50"
                >
                  <div className="flex gap-3">
                    <input
                      type="checkbox"
                      checked={!!selected[pickup.pickup_id]}
                      onChange={(event) =>
                        setSelected((current) => ({
                          ...current,
                          [pickup.pickup_id]: event.target.checked,
                        }))
                      }
                    />

                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-base font-black text-blue-700">
                        {pickup.pickup_id}
                      </p>
                      <p className="font-black">{pickup.merchant_name || "-"}</p>
                      <p className="text-sm font-semibold text-slate-500">
                        {pickup.pickup_township || "-"} · {pickup.route_zone || "-"} · {pickup.route_type || "-"}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                        {pickup.pickup_address || "-"}
                      </p>
                      <p className="mt-2 text-xs font-black uppercase text-slate-500">
                        Parcels: {pickup.parcel_count || 0} · Status: {pickup.status || "-"}
                      </p>
                    </div>
                  </div>
                </label>
              ))}

              {pickups.length === 0 && (
                <div className="rounded-2xl bg-slate-50 p-8 text-center font-black text-slate-500">
                  No live pickups found.
                </div>
              )}
            </div>
          </aside>

          <main className="space-y-5">
            {routes.map((route: any) => {
              const stops = Array.isArray(route.stops) ? route.stops : [];
              const form = dispatch[route.id] || {};

              return (
                <section key={route.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="font-mono text-xl font-black text-blue-700">
                        {route.route_code}
                      </p>
                      <h3 className="text-2xl font-black text-slate-950">
                        {route.route_zone} · {route.route_type}
                      </h3>
                      <p className="font-bold text-slate-500">
                        {stops.length} stop(s) · Status: {route.status}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => printManifest(route)}
                        className="rounded-2xl border border-slate-300 px-4 py-3 font-black"
                      >
                        Print Manifest
                      </button>
                      <button
                        onClick={() => dispatchRoute(route)}
                        className="rounded-2xl bg-blue-700 px-4 py-3 font-black text-white"
                      >
                        Dispatch Route
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
                    <select
                      value={form.vehicle_no || route.vehicle_no || ""}
                      onChange={(event) => updateDispatch(route.id, { vehicle_no: event.target.value })}
                      className="rounded-2xl border px-4 py-3 font-bold"
                    >
                      <option value="">Select vehicle...</option>
                      {vehicles.map((vehicle: any) => (
                        <option key={vehicleCode(vehicle)} value={vehicleCode(vehicle)}>
                          {vehicleLabel(vehicle)}
                        </option>
                      ))}
                    </select>

                    <select
                      value={form.driver_code || route.driver_code || ""}
                      onChange={(event) => updateDispatch(route.id, { driver_code: event.target.value })}
                      className="rounded-2xl border px-4 py-3 font-bold"
                    >
                      <option value="">Select driver...</option>
                      {drivers.map((driver: any) => (
                        <option key={personCode(driver)} value={personCode(driver)}>
                          {personCode(driver)} — {personName(driver)}
                        </option>
                      ))}
                    </select>

                    <select
                      value={form.helper_code || route.helper_code || ""}
                      onChange={(event) => updateDispatch(route.id, { helper_code: event.target.value })}
                      className="rounded-2xl border px-4 py-3 font-bold"
                    >
                      <option value="">Select helper...</option>
                      {helpers.map((helper: any) => (
                        <option key={personCode(helper)} value={personCode(helper)}>
                          {personCode(helper)} — {personName(helper)}
                        </option>
                      ))}
                    </select>

                    <select
                      value={form.rider_code || route.rider_code || ""}
                      onChange={(event) => updateDispatch(route.id, { rider_code: event.target.value })}
                      className="rounded-2xl border px-4 py-3 font-bold"
                    >
                      <option value="">Select rider...</option>
                      {riders.map((rider: any) => (
                        <option key={personCode(rider)} value={personCode(rider)}>
                          {personCode(rider)} — {personName(rider)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <textarea
                    value={form.special_instructions || route.special_instructions || ""}
                    onChange={(event) => updateDispatch(route.id, { special_instructions: event.target.value })}
                    placeholder="Special instructions for route, vehicle, helper, rider, or delivery constraints..."
                    className="mt-3 min-h-24 w-full rounded-2xl border px-4 py-3 font-bold outline-none focus:border-blue-600"
                  />

                  <div className="mt-5 max-w-full overflow-x-auto overflow-y-hidden pb-4 [scrollbar-gutter:stable]">
                    <table className="w-full min-w-[1200px] text-left">
                      <thead>
                        <tr className="border-b text-sm uppercase text-slate-500">
                          <th className="p-3">Seq</th>
                          <th className="p-3">Pickup</th>
                          <th className="p-3">Merchant</th>
                          <th className="p-3">Township</th>
                          <th className="p-3">Address</th>
                          <th className="p-3">Parcels</th>
                          <th className="p-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stops.map((stop: any) => (
                          <tr key={stop.id} className="border-b align-top">
                            <td className="p-3 font-black">{stop.stop_sequence}</td>
                            <td className="p-3 font-mono font-black text-blue-700">{stop.pickup_id}</td>
                            <td className="p-3 font-black">{stop.merchant_name || "-"}</td>
                            <td className="p-3 font-bold">{stop.pickup_township || "-"}</td>
                            <td className="p-3 max-w-md font-semibold text-slate-600">{stop.pickup_address || "-"}</td>
                            <td className="p-3 font-black">{stop.parcel_count || 0}</td>
                            <td className="p-3">
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-black">
                                {stop.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}

            {routes.length === 0 && (
              <section className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                <p className="text-2xl font-black text-slate-700">No wayplan routes yet.</p>
                <p className="mt-2 font-semibold text-slate-500">
                  Select pickups and click Generate Wayplan.
                </p>
              </section>
            )}
          </main>
        </section>
      </div>
    </div>
  );
}
