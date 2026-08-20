// Live wrapper for Wayplan Command Center.
// Backend source is loaded inside WayplanCommandCenterPage through:
// supabase.rpc("be_dispatch_ready_queue")
// supabase.rpc("be_wayplan_command_center")
// supabase.rpc("be_generate_wayplan")
// supabase.rpc("be_dispatch_start_wayplan")

export { default } from "./WayplanCommandCenterPage";
