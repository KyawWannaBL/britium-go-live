import {useState} from "react";
import BranchHQIntakeWorkbench from "@/components/BranchHQIntakeWorkbench";
import {useAuth} from "@/contexts/AuthContext";
import {normalizeRole} from "@/lib/portalRegistry";

export default function HQBranchIntakePage(){
  const {profile}=useAuth();
  const role=normalizeRole(profile?.role);
  const hq=String(profile?.branch_code||"").toUpperCase()==="YGN";
  const elevated=['superadmin','super-admin','app-owner','sys'].includes(role);
  const authorized=!!(elevated||(hq&&['warehouse','data-entry','encoder','operations','operations-admin','operation-manager','operations-manager','admin'].includes(role)));
  const [branch,setBranch]=useState("YGN-INS");
  if(!authorized)return <div className="rounded-xl border border-red-500/30 p-6 text-red-200">Only authorized Head Office staff may receive branch shuttle manifests or link permanent Way IDs.</div>;
  return <div className="space-y-5 text-[#eef8ff]">
    <div className="rounded-3xl border border-[#365674] bg-[#0b2236] p-5">
      <h1 className="text-2xl font-black">Head Office · Branch Shuttle Receiving</h1>
      <p className="mt-2 text-sm text-[#9bb7ce]">Physical receipt, discrepancy review, and temporary QR conversion after HQ Data Entry. No automatic delivery dispatch or COD settlement.</p>
      <label className="mt-3 block text-sm">Collection branch
        <select value={branch} onChange={e=>setBranch(e.target.value)} className="ml-3 rounded-lg border border-[#365674] bg-[#061524] p-2">
          <option value="YGN-INS">Insein — YGN-INS</option>
          <option value="MDY">Mandalay — MDY</option>
          <option value="NPT">Naypyitaw — NPT</option>
        </select>
      </label>
    </div>
    <BranchHQIntakeWorkbench branch={branch} isHeadOffice/>
  </div>;
}
