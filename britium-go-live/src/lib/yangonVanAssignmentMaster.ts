export type YangonPlanCode = "LOW_3" | "STANDARD_5" | "HIGH_9";

export type YangonVanZone = {
  routeCode: string;
  name: string;
  townships: string[];
  vehicleType: string;
  dispatchWindow: string;
  routingStrategy: string;
};

export const YANGON_VAN_PLAN_SCOPE = {
  hubName: "East Dagon Logistics Center",
  excludedTownships: ["Dala", "Seikkyi Kanaungto", "Thanlyin"],
  lowMax: 44,
  standardMin: 45,
  standardMax: 95,
  highMin: 96,
} as const;

export const YANGON_VAN_MASTER: Record<YangonPlanCode, YangonVanZone[]> = {
  LOW_3: [
    {
      routeCode: "A",
      name: "East & North-East",
      townships: ["East Dagon", "North Dagon", "South Dagon", "Dagon Seikkan", "Thingangyun", "South Okkalapa", "North Okkalapa", "Yankin"],
      vehicleType: "1.5-Ton Box Van",
      dispatchWindow: "08:30",
      routingStrategy: "Clear the Dagon home zone first, then continue into the Okkalapa / Thingangyun residential arc using road-time optimization.",
    },
    {
      routeCode: "B",
      name: "Urban Core & Inner West",
      townships: ["Thaketa", "Dawbon", "Tamwe", "Bahan", "Kyauktada", "Pabedan", "Latha", "Lanmadaw", "Botahtaung", "Pazundaung", "Dagon", "Sanchaung", "Ahlone", "Kyimyindaing"],
      vehicleType: "1-Ton High-Roof Van",
      dispatchWindow: "08:00",
      routingStrategy: "Transit to Thaketa / Dawbon, cross the central-east corridor into Downtown, then finish through Ahlone and Kyimyindaing.",
    },
    {
      routeCode: "C",
      name: "Outer West & North",
      townships: ["Hlaing", "Kamayut", "Mayangone", "Insein", "Mingaladon", "Shwepyitha", "Hlaingthaya"],
      vehicleType: "1.5-Ton Cargo Van",
      dispatchWindow: "08:30",
      routingStrategy: "Keep the long outer arc isolated; road optimizer may choose northern-first or bridge-first order according to the day's live road matrix.",
    },
  ],
  STANDARD_5: [
    {
      routeCode: "1",
      name: "East Core",
      townships: ["East Dagon", "North Dagon", "South Dagon", "Dagon Seikkan"],
      vehicleType: "1.5-Ton Box Van",
      dispatchWindow: "08:30",
      routingStrategy: "Micro-route wards around the East Dagon hub; prioritize dense and bulky B2B/residential drops and preserve re-load capability.",
    },
    {
      routeCode: "2",
      name: "North-East Corridor",
      townships: ["Thingangyun", "South Okkalapa", "North Okkalapa", "Yankin"],
      vehicleType: "1-Ton Delivery Van",
      dispatchWindow: "09:00",
      routingStrategy: "Use No. 2 Highway / Thanthumar / Waizayantar corridor logic and optimize the actual stop sequence by road time.",
    },
    {
      routeCode: "3",
      name: "Central-East Corridor",
      townships: ["Tamwe", "Bahan", "Thaketa", "Dawbon"],
      vehicleType: "1-Ton Light Van",
      dispatchWindow: "09:00",
      routingStrategy: "Prefer Thaketa / Dawbon before the inner-city congestion where road-time evidence supports it, then sweep Tamwe and Bahan.",
    },
    {
      routeCode: "4",
      name: "Downtown, CBD & Inner West",
      townships: ["Kyauktada", "Pabedan", "Latha", "Lanmadaw", "Botahtaung", "Pazundaung", "Dagon", "Sanchaung", "Ahlone", "Kyimyindaing"],
      vehicleType: "High-Roof Compact Van / LWB Walk-In",
      dispatchWindow: "08:00",
      routingStrategy: "Use Lower Pazundaung / Strand Road as the principal corridor where practical, then continue into Ahlone and Kyimyindaing; avoid unnecessary peak-hour Pyay Road crossings.",
    },
    {
      routeCode: "5",
      name: "West & North Gateway",
      townships: ["Hlaing", "Kamayut", "Mayangone", "Insein", "Mingaladon", "Shwepyitha", "Hlaingthaya"],
      vehicleType: "1.5-Ton High-Capacity Cargo Van",
      dispatchWindow: "08:30",
      routingStrategy: "Use outer-ring / No. 3 Highway / Khayay Pin / Bayintnaung access according to road time; keep western and northern drops on one continuous gateway route.",
    },
  ],
  HIGH_9: [
    { routeCode: "1", name: "East Dagon & Dagon Seikkan", townships: ["East Dagon", "Dagon Seikkan"], vehicleType: "Van", dispatchWindow: "08:30", routingStrategy: "Industrial and hub-adjacent micro-route; prioritize large cargo and dense local drops." },
    { routeCode: "2", name: "North Dagon & South Dagon", townships: ["North Dagon", "South Dagon"], vehicleType: "Van", dispatchWindow: "08:30", routingStrategy: "Residential Dagon micro-route optimized by ward and actual road time." },
    { routeCode: "3", name: "South Okkalapa & Thingangyun", townships: ["South Okkalapa", "Thingangyun"], vehicleType: "Delivery Van", dispatchWindow: "09:00", routingStrategy: "Mid-city residential route optimized around Thanthumar / Waizayantar access." },
    { routeCode: "4", name: "North Okkalapa & Yankin", townships: ["North Okkalapa", "Yankin"], vehicleType: "Delivery Van", dispatchWindow: "09:00", routingStrategy: "North-east residential route; road optimizer determines the practical direction from the hub." },
    { routeCode: "5", name: "Central-East Peninsula", townships: ["Thaketa", "Dawbon", "Tamwe", "Bahan"], vehicleType: "Light Van", dispatchWindow: "09:00", routingStrategy: "Dedicated central-east loop using actual bridge/junction road-time costs." },
    { routeCode: "6", name: "Downtown Core", townships: ["Kyauktada", "Pabedan", "Latha", "Lanmadaw", "Botahtaung", "Pazundaung", "Dagon"], vehicleType: "Bulk Cargo / Mobile Hub Van", dispatchWindow: "08:00", routingStrategy: "Downtown core via Strand Road spine; suitable for mobile-hub handoff when enabled by operations." },
    { routeCode: "7", name: "Inner West", townships: ["Sanchaung", "Ahlone", "Kyimyindaing"], vehicleType: "Compact Van / Motorcycle / Three-Wheeler", dispatchWindow: "08:00", routingStrategy: "Gridlock-resistant inner-west route; operations may substitute smaller units for narrow streets." },
    { routeCode: "8", name: "Outer Residential & North-West", townships: ["Hlaing", "Kamayut", "Mayangone", "Insein", "Mingaladon"], vehicleType: "Delivery Van", dispatchWindow: "08:30", routingStrategy: "Absorbs Hlaing/Kamayut/Mayangone plus Insein/Mingaladon so no township is orphaned in the 9-route plan." },
    { routeCode: "9", name: "Industrial Gateway", townships: ["Hlaingthaya", "Shwepyitha"], vehicleType: "Heavy Cargo Van", dispatchWindow: "08:30", routingStrategy: "Dedicated industrial/western route using Aung Zeya / Bayintnaung bridge access according to actual road conditions." },
  ],
};

export function yangonPlanForVolume(parcelCount: number): YangonPlanCode {
  if (parcelCount < 45) return "LOW_3";
  if (parcelCount <= 95) return "STANDARD_5";
  return "HIGH_9";
}
