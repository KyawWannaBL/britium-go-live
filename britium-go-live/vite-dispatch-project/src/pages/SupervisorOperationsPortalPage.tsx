// Live wrapper for Supervisor Pickup.
// Backend source is loaded inside SupervisorPickupAssignmentGoLivePage through:
// supabase.from("be_portal_pickup_requests")
// supabase.rpc("be_supervisor_assign_job")

export { default } from "./SupervisorPickupAssignmentGoLivePage";
