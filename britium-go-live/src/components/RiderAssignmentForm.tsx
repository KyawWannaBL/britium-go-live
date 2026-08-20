import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// Step 3: Configure the dropdown type
type RiderOption = {
  id: string;
  employee_id: string | null;
  full_name: string | null;
  email: string;
  role?: string | null;
  app_role?: string | null;
  user_role?: string | null;
  role_code?: string | null;
  zone?: string | null;
  branch_name?: string | null;
};

export default function RiderAssignmentForm({ pickupId }: { pickupId: string }) {
  const [riders, setRiders] = useState<RiderOption[]>([]);
  const [selectedRiderId, setSelectedRiderId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    async function loadRiders() {
      setLoading(true);
      setError("");

      try {
        // Step 2: Load the dropdown correctly with the safer temporary query
        const { data: profiles, error: fetchError } = await supabase
          .from("profiles")
          .select(`
            id,
            employee_id,
            full_name,
            email,
            role,
            app_role,
            user_role,
            role_code,
            zone,
            branch_name
          `)
          .eq("is_active", true)
          .eq("is_approved", true);

        if (fetchError) throw fetchError;

        // Filter mixed uppercase/lowercase role history
        const activeRiders = (profiles ?? []).filter((profile) =>
          [
            profile.role,
            profile.app_role,
            profile.user_role,
            profile.role_code,
          ].some((value) => String(value ?? "").toUpperCase() === "RIDER")
        );

        setRiders(activeRiders);
      } catch (err: any) {
        setError(err.message || "Failed to fetch riders.");
      } finally {
        setLoading(false);
      }
    }

    void loadRiders();
  }, []);

  const handleAssignRider = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Step 4: Submit UUID and display snapshots
    const rider = riders.find((item) => item.id === selectedRiderId);
    
    if (!rider) {
      setError("Select an available Rider.");
      return;
    }

    setSubmitting(true);
    
    try {
      const assignmentPayload = {
        pickup_id: pickupId,

        // Authoritative identity (ALWAYS UUID):
        assigned_rider_id: rider.id,

        // Display/audit values:
        assigned_rider_code: rider.employee_id,
        assigned_rider_name: rider.full_name,
        assigned_rider_email: rider.email,
      };

      console.log("Submitting secure assignment payload:", assignmentPayload);

      // Example of applying this to your actual assignment column (Step 5 context)
      /*
      const { error: assignError } = await supabase
        .from('be_portal_pickup_requests') // Replace with actual table from Step 5 query
        .update(assignmentPayload)
        .eq('pickup_id', pickupId);
        
      if (assignError) throw assignError;
      */

      alert(`Successfully assigned ${rider.full_name} (${rider.employee_id}) to pickup ${pickupId}`);
      
    } catch (err: any) {
      setError(err.message || "Failed to assign rider.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-slate-900 rounded-xl border border-slate-700 shadow-xl text-slate-100">
      <h2 className="text-xl font-bold text-amber-400 mb-4">Assign Rider</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleAssignRider} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-sky-200">
            Select Workforce Identity
          </label>
          
          {/* Step 3: Configure the dropdown */}
          <select
            value={selectedRiderId}
            onChange={(event) => setSelectedRiderId(event.target.value)}
            disabled={loading || submitting}
            className="w-full h-11 bg-slate-950 border border-sky-800 rounded-lg px-3 text-sm font-medium text-white outline-none focus:border-amber-400 disabled:opacity-50"
          >
            <option value="">
              {loading ? "Loading Riders..." : "-- Select Available Rider --"}
            </option>

            {riders.map((rider) => (
              <option key={rider.id} value={rider.id}>
                {rider.employee_id ?? "NO ID"} - {rider.full_name ?? rider.email}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={!selectedRiderId || submitting || loading}
          className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase tracking-wider rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Assigning..." : "Confirm Assignment"}
        </button>
      </form>

      {/* Step 5: Reminder block for developers */}
      <div className="mt-6 p-4 bg-slate-950 rounded-lg border border-slate-800">
        <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2">
          Step 5: Database Verification
        </h3>
        <p className="text-xs text-slate-500 font-mono whitespace-pre-wrap">
          Run SQL to confirm actual assignment columns:
          <br/><br/>
          <span className="text-sky-400">
          SELECT table_name, column_name, data_type<br/>
          FROM information_schema.columns<br/>
          WHERE table_schema = 'public'<br/>
          AND (column_name ILIKE '%rider%'<br/>
          OR column_name ILIKE '%assigned%')
          </span>
        </p>
      </div>
    </div>
  );
}