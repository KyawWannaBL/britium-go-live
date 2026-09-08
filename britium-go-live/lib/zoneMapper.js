// Maps physical townships to your operational routing zones
const townshipToZoneMap = {
  // Central Hub
  "bahan": "ZONE-CENTRAL",
  "dagon": "ZONE-CENTRAL",
  "sanchaung": "ZONE-CENTRAL",
  "kamayut": "ZONE-CENTRAL",
  "hlaing": "ZONE-CENTRAL",
  
  // East Hub
  "south okkalapa": "ZONE-EAST",
  "north okkalapa": "ZONE-EAST",
  "thingangyun": "ZONE-EAST",
  "tamwe": "ZONE-EAST",
  "yankin": "ZONE-EAST",
  
  // North Hub
  "insein": "ZONE-NORTH",
  "mayangone": "ZONE-NORTH",
  "mingaladon": "ZONE-NORTH",
  
  // Downtown Hub
  "kyauktada": "ZONE-DOWNTOWN",
  "pabedan": "ZONE-DOWNTOWN",
  "latha": "ZONE-DOWNTOWN",
  "lanmadaw": "ZONE-DOWNTOWN",
  "pazundaung": "ZONE-DOWNTOWN",
  "botahtaung": "ZONE-DOWNTOWN"
};

export function autoAssignWayplan(townshipName) {
  if (!townshipName) return "ZONE-UNASSIGNED";
  
  // Normalize the string to lowercase to prevent case-sensitive mismatches
  const normalizedTownship = townshipName.toString().toLowerCase().trim();
  
  // Return the mapped zone, or a fallback if the township is unrecognized
  return townshipToZoneMap[normalizedTownship] || "ZONE-UNASSIGNED";
}
