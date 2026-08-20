// Additive Rider App route/menu snippet.
// Do NOT replace the whole rider App.tsx with an enterprise portal App.tsx.
// Keep existing rider pages and ensure these routes point to the grouped pickup page.

import AssignedDeliveryRoutePage from "@/pages/AssignedDeliveryRoutePage";

// React Router example:
<Route path="/rider/pickups" element={<AssignedDeliveryRoutePage />} />
<Route path="/rider/assigned-pickups" element={<AssignedDeliveryRoutePage />} />

// Existing navigation should keep this item:
// Pickups -> /rider/pickups
