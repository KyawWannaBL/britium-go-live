// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeRole } from "@/lib/portalRegistry";

const ALERT_ROLES = new Set([
  "warehouse","warehouse-staff","sorter","dispatch",
  "supervisor","operations","operations-admin","operation-manager"
]);

const txt=(v:any)=>String(v??"").trim();
const upper=(v:any)=>txt(v).toUpperCase();

function hasActiveWayplan(row:any){
  if(txt(row.active_wayplan_id)) return true;
  const active=new Set(["PLANNED","REVIEWED","APPROVED","READY_FOR_DISPATCH","DISPATCH_READY","DISPATCHED","OUT_FOR_DELIVERY","ACTIVE","IN_PROGRESS"]);
  return active.has(upper(row.membership_status)) || active.has(upper(row.active_wayplan_status));
}

function terminal(row:any){
  const terminalStates=new Set(["DELIVERED","RTO","CANCELLED","CANCELED","RETURN_TO_SENDER","COMPLETED"]);
  return [row.delivery_status,row.current_lifecycle_status,row.dispatch_workflow_stage,row.warehouse_scan_status]
    .some((v:any)=>terminalStates.has(upper(v)));
}

function returnedAfterDispatch(row:any){
  const returned=row.last_return_scan_at||row.return_scan_3_at||row.return_scan_2_at||row.return_scan_1_at;
  if(!returned) return false;
  const dispatched=row.last_dispatch_scan_at||row.dispatch_scan_at;
  if(!dispatched) return true;
  return new Date(returned).getTime()>=new Date(dispatched).getTime();
}

function pending(row:any){
  if(!row.inbound_scan_at || terminal(row) || hasActiveWayplan(row)) return false;
  const delivery=upper(row.delivery_status);
  if(["OUT_FOR_DELIVERY","RIDER_ACCEPTED","DELIVERY_ACCEPTED","ACCEPTED_FOR_DELIVERY","ARRIVED_AT_CUSTOMER"].includes(delivery)) return false;

  const failed=Boolean(row.next_attempt_priority)
    || Number(row.return_attempt_count||row.physical_return_scan_count||0)>0
    || returnedAfterDispatch(row);

  const fresh=!row.dispatch_scan_at && !row.last_dispatch_scan_at
    && ["RECEIVED","WAREHOUSE_RECEIVED","WAREHOUSE_READY","READY_FOR_DELIVERY","READY_FOR_WAYPLAN",""].includes(upper(row.warehouse_scan_status||row.warehouse_status));

  return failed||fresh;
}

export default function WarehousePendingGlobalAlert(){
  const { profile }=useAuth();
  const role=normalizeRole(profile?.role);
  const enabled=ALERT_ROLES.has(role);
  const [rows,setRows]=useState<any[]>([]);

  useEffect(()=>{
    if(!enabled) return;
    let alive=true;
    const load=async()=>{
      const {data,error}=await (supabase as any).rpc("be_warehouse_scan_lifecycle_snapshot_v164");
      if(!alive||error) return;
      setRows(Array.isArray(data?.rows)?data.rows:[]);
    };
    void load();
    const timer=window.setInterval(()=>void load(),60000);
    return ()=>{alive=false;window.clearInterval(timer);};
  },[enabled]);

  const overdue=useMemo(()=>rows.filter((row:any)=>{
    if(!pending(row)) return false;
    const hours=Number(row.dwell_hours);
    if(Number.isFinite(hours)) return hours>=48;
    const ms=Date.now()-new Date(row.inbound_scan_at).getTime();
    return Number.isFinite(ms)&&ms>=48*3600000;
  }),[rows]);

  if(!enabled||!overdue.length) return null;

  return <Link
    to="/warehouse-pending"
    className="flex shrink-0 items-center justify-between gap-3 border-b border-red-500 bg-red-950 px-5 py-2.5 text-red-100 shadow-lg"
    title="Open Warehouse Pending Parcels"
  >
    <span className="flex items-center gap-2 text-sm font-black">
      <AlertTriangle className="h-5 w-5 text-red-300"/>
      WAREHOUSE ALERT: {overdue.length} pending parcel{overdue.length===1?"":"s"} over 48 hours
    </span>
    <span className="text-xs font-bold underline">Open Pending Parcels</span>
  </Link>;
}
