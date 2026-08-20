import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

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

export default function RiderAssignmentForm({ pickupId, onSuccess }: { pickupId: string, onSuccess?: () => void }) {
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

    const rider = riders.find((item) => item.id === selectedRiderId);
    
    if (!rider) {
      setError("Select an available Rider.");
      return;
    }

    setSubmitting(true);
    
    try {
      const assignmentPayload = {
        // Authoritative identity (UUID):
        assigned_rider_id: rider.id,

        // Display/audit values:
        assigned_rider_code: rider.employee_id,
        assigned_rider_name: rider.full_name,
        assigned_rider_email: rider.email,

        // Status triggers
        status: "ASSIGNED",
        assignment_status: "ASSIGNED",
        assigned_at: new Date().toISOString()
      };

      console.log("Submitting secure assignment payload:", assignmentPayload);

      const { error: assignError } = await supabase
        .from("be_portal_pickup_requests")
        .update(assignmentPayload)
        .eq("pickup_id", pickupId);
        
      if (assignError) throw assignError;

      if (onSuccess) onSuccess();
      
    } catch (err: any) {
      setError(err.message || "Failed to assign rider.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleAssignRider} className="space-y-4">
        <label className="grid gap-2 text-sm font-bold text-[#9cc2d9]">
          ASSIGN FIELD RIDER
          <select
            value={selectedRiderId}
            onChange={(event) => setSelectedRiderId(event.target.value)}
            disabled={loading || submitting}
            className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white outline-none focus:border-[#f6b84b] disabled:opacity-50"
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
        </label>

        <button
          type="submit"
          disabled={!selectedRiderId || submitting || loading}
          className="w-full h-11 bg-[#f6b84b] hover:bg-[#ffdb99] text-[#061524] font-black uppercase tracking-wider rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Assigning Rider..." : "Confirm Rider"}
        </button>
      </form>
    </div>
  );
}