// Britium master dispatch allocation helper.
// This mirrors the Wayplan Command Center screen logic and can be moved to a Node/Edge backend later.

export type DispatchOrder = {
  id: string;
  type: "DELIVERY" | "PICKUP";
  township: string;
  coords?: [number, number];
};

export const HUB_COORDINATES: [number, number] = [96.199675, 16.889554];

export const EXCLUDED_TOWNSHIPS = new Set([
  "seikgyi kanaungto", "thanlyin", "kyauktan", "thongwa", "kayan",
  "khayan", "twante", "kungyangon", "kawhmu", "hmawbi", "hlegu",
  "taikkyi", "htantabin", "dala",
]);

export const bikeLoadBalancer = {
  teamA: { idx: 0, fleet: ["Bike Rider 1", "Bike Rider 2", "Bike Rider 3"] },
  teamB: { idx: 0, fleet: ["Bike Rider 4", "Bike Rider 5", "Bike Rider 6"] },
  teamC: { idx: 0, fleet: ["Bike Rider 7", "Bike Rider 8", "Bike Rider 9"] },
};

export function getNextRider(teamKey: keyof typeof bikeLoadBalancer) {
  const team = bikeLoadBalancer[teamKey];
  const rider = team.fleet[team.idx];
  team.idx = (team.idx + 1) % team.fleet.length;
  return rider;
}

export function routeOrder(order: DispatchOrder) {
  const ts = order.township.toLowerCase();

  if (EXCLUDED_TOWNSHIPS.has(ts)) {
    return { ...order, rejected: true, reason: "Excluded outer/rural township" };
  }

  if (ts.includes("east dagon") || ts.includes("south dagon")) {
    return { ...order, zone: "GROUP_1_BIKES", assignedVehicle: getNextRider("teamA") };
  }
  if (ts.includes("north dagon") || ts.includes("okkalapa")) {
    return { ...order, zone: "GROUP_1_BIKES", assignedVehicle: getNextRider("teamB") };
  }
  if (ts.includes("thingangyun") || ts.includes("yankin")) {
    return { ...order, zone: "GROUP_1_BIKES", assignedVehicle: getNextRider("teamC") };
  }

  if (order.type === "PICKUP") {
    if (["kamayut","hlaing","mayangone","ahlone","sanchaung","kyeemyindaing","lanmadaw","latha","pabedan","kyauktada","botahtaung","pazundaung"].some((x) => ts.includes(x))) {
      return { ...order, zone: "PICKUP_VAN_1_G2_G4", assignedVehicle: "Pickup Van 1", firstStop: "Dagon Ayar Highway Bus Station" };
    }
    return { ...order, zone: "PICKUP_VAN_2_G3_G5", assignedVehicle: "Pickup Van 2", firstStop: "Aung Mingalar Highway Bus Station" };
  }

  if (["ahlone","sanchaung","kyeemyindaing","lanmadaw","latha","pabedan","kyauktada","botahtaung","pazundaung"].some((x) => ts.includes(x))) {
    return { ...order, zone: "GROUP_2_DOWNTOWN", assignedVehicle: "Van A (Group 2 Delivery)" };
  }
  if (["kamayut","hlaing","mayangone"].some((x) => ts.includes(x))) {
    return { ...order, zone: "GROUP_4_WEST", assignedVehicle: "Van B (Group 4 Delivery)" };
  }
  if (["bahan","tamwe","mingala taungnyunt","dawbon","thaketa"].some((x) => ts.includes(x))) {
    return { ...order, zone: "GROUP_3_EAST_CENTRAL", assignedVehicle: "Van C (Group 3 Delivery)" };
  }
  if (["mingaladon","shwepyitha","insein","hlaingtharya"].some((x) => ts.includes(x))) {
    return { ...order, zone: "GROUP_5_NORTH", assignedVehicle: "Van D (Group 5 Delivery)" };
  }

  return { ...order, rejected: true, reason: "No matching active wayplan zone" };
}

export function buildGoogleRouteLink(jobs: Array<DispatchOrder & { coords?: [number, number] }>) {
  const points = jobs.filter((j) => j.coords).map((j) => `${j.coords![1]},${j.coords![0]}`);
  if (!points.length) return "";
  const origin = `${HUB_COORDINATES[1]},${HUB_COORDINATES[0]}`;
  const destination = points[points.length - 1];
  const waypoints = points.slice(0, -1).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&waypoints=${encodeURIComponent(waypoints)}&travelmode=driving`;
}
