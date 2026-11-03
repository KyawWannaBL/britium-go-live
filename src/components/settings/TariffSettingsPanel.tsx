import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Language = "en" | "my" | "both";

type TariffDraft = {
  tier_name: string;
  free_allowance_kg: string;
  base_fee_mmk: string;
  extra_per_kg_mmk: string;
  highway_fee_mmk: string;
  is_active: boolean;
  updated_at: string | null;
};

function text(language: Language, english: string, myanmar: string) {
  if (language === "en") return english;
  if (language === "my") return myanmar;
  return `${english} / ${myanmar}`;
}

function numericString(value: unknown) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return "0";
  }

  return String(Math.trunc(number));
}

function normalizeRows(value: unknown): TariffDraft[] {
  let source = value;

  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = [];
    }
  }

  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object",
    )
    .map((row) => ({
      tier_name: String(row.tier_name || ""),
      free_allowance_kg: numericString(row.free_allowance_kg),
      base_fee_mmk: numericString(row.base_fee_mmk),
      extra_per_kg_mmk: numericString(row.extra_per_kg_mmk),
      highway_fee_mmk: numericString(row.highway_fee_mmk),
      is_active: row.is_active !== false,
      updated_at:
        typeof row.updated_at === "string"
          ? row.updated_at
          : null,
    }))
    .filter((row) => row.tier_name);
}

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function errorText(language: Language, error: unknown) {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  const normalized = raw.toUpperCase();

  if (normalized.includes("AUTHENTICATION_REQUIRED")) {
    return text(
      language,
      "Sign in before opening tariff settings.",
      "ကုန်ကျစရိတ်နှုန်းထားများကို ကြည့်ရှုရန် အကောင့်ဝင်ပါ။",
    );
  }

  if (
    normalized.includes("TARIFF_READ_NOT_AUTHORIZED") ||
    normalized.includes("ACCESS DENIED")
  ) {
    return text(
      language,
      "Your role cannot view tariff settings.",
      "သင့်တာဝန်အဆင့်ဖြင့် ကုန်ကျစရိတ်နှုန်းထားများကို ကြည့်ရှုခွင့်မရှိပါ။",
    );
  }

  if (
    normalized.includes("TARIFF_WRITE_NOT_AUTHORIZED") ||
    normalized.includes("ADMIN ONLY")
  ) {
    return text(
      language,
      "Only an administrator can change tariffs.",
      "စီမံခန့်ခွဲသူသာ ကုန်ကျစရိတ်နှုန်းထားများကို ပြင်ဆင်နိုင်ပါသည်။",
    );
  }

  if (
    normalized.includes(
      "TARIFF_VALUES_MUST_BE_NON_NEGATIVE_INTEGERS",
    )
  ) {
    return text(
      language,
      "All tariff values must be whole numbers of zero or greater.",
      "နှုန်းထားတန်ဖိုးအားလုံးသည် သုည သို့မဟုတ် သုညထက်ကြီးသော ကိန်းပြည့် ဖြစ်ရပါမည်။",
    );
  }

  if (normalized.includes("TARIFF_NOT_FOUND")) {
    return text(
      language,
      "The selected tariff tier no longer exists.",
      "ရွေးထားသော နှုန်းထားအဆင့် မရှိတော့ပါ။",
    );
  }

  if (
    normalized.includes("COULD NOT FIND THE FUNCTION") ||
    normalized.includes("PGRST202")
  ) {
    return text(
      language,
      "The secured tariff migration has not been applied.",
      "လုံခြုံသော နှုန်းထား migration ကို database တွင် မတင်ရသေးပါ။",
    );
  }

  return text(
    language,
    raw || "The tariff request could not be completed.",
    "ကုန်ကျစရိတ်နှုန်းထား လုပ်ဆောင်ချက်ကို မပြီးမြောက်နိုင်ပါ။",
  );
}

export function TariffSettingsPanel({
  language,
}: {
  language: Language;
}) {
  const [newTier,setNewTier]=useState("");
  const [canManage,setCanManage]=useState(false);
  const [activeTab,setActiveTab]=useState<"BRITIUM"|"ROYAL EXPRESS">("BRITIUM");
  const [rows, setRows] = useState<TariffDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingTier, setSavingTier] = useState<string | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadTariffs = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "be_tariff_list",
      );

      if (error) throw error;

      setRows(normalizeRows(data));
      const rights=await supabase.rpc("be_tariff_rights_list_v1");
      if (rights.error) throw rights.error;
      setCanManage(Boolean((rights.data as any)?.can_manage));
    } catch (error) {
      setRows([]);
      setErrorMessage(errorText(language, error));
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    void loadTariffs();
  }, [loadTariffs]);

  function updateField(
    tierName: string,
    field:
      | "free_allowance_kg"
      | "base_fee_mmk"
      | "extra_per_kg_mmk"
      | "highway_fee_mmk",
    value: string,
  ) {
    setRows((current) =>
      current.map((row) =>
        row.tier_name === tierName
          ? { ...row, [field]: value }
          : row,
      ),
    );
  }

  async function saveTariff(row: TariffDraft) {
    setNotice("");
    setErrorMessage("");

    const values = [
      row.free_allowance_kg,
      row.base_fee_mmk,
      row.extra_per_kg_mmk,
      row.highway_fee_mmk,
    ];

    if (
      values.some(
        (value) => !/^\d+$/.test(value.trim()),
      )
    ) {
      setErrorMessage(
        text(
          language,
          "All tariff values must be whole numbers of zero or greater.",
          "နှုန်းထားတန်ဖိုးအားလုံးသည် သုည သို့မဟုတ် သုညထက်ကြီးသော ကိန်းပြည့် ဖြစ်ရပါမည်။",
        ),
      );
      return;
    }

    setSavingTier(row.tier_name);

    try {
      if (!canManage) throw new Error("TARIFF_WRITE_NOT_AUTHORIZED");
      const { data, error } = await supabase.rpc(
        "be_tariff_update",
        {
          p_tier: row.tier_name,
          p_base_fee: Number(row.base_fee_mmk),
          p_extra_per_kg: Number(
            row.extra_per_kg_mmk,
          ),
          p_free_kg: Number(row.free_allowance_kg),
          p_highway_fee: Number(
            row.highway_fee_mmk,
          ),
        },
      );

      if (error) throw error;
      if ((data as any)?.ok !== true) throw new Error("Tariff save was not accepted.");

      await loadTariffs();

      setNotice(
        text(
          language,
          `Tariff tier ${row.tier_name} was updated successfully.`,
          `${row.tier_name} နှုန်းထားအဆင့်ကို အောင်မြင်စွာ ပြင်ဆင်ပြီးပါပြီ။`,
        ),
      );
    } catch (error) {
      setErrorMessage(errorText(language, error));
    } finally {
      setSavingTier(null);
    }
  }

  return (
    <div className="mt-6">
      <div className="mb-4 flex gap-2 rounded-2xl border bg-white p-2">{(["BRITIUM","ROYAL EXPRESS"] as const).map(provider=><button key={provider} type="button" onClick={()=>setActiveTab(provider)} className={`rounded-xl px-5 py-3 font-bold ${activeTab===provider?"bg-blue-900 text-white":"bg-slate-100 text-slate-700"}`}>{provider==="BRITIUM"?"Britium Tariff":"Royal Express Tariff"}</button>)}</div>
      {activeTab==="ROYAL EXPRESS" ? <ProviderTariffManager provider="ROYAL EXPRESS" language={language}/> : <>
      {canManage&&<div className="flex gap-2 p-3"><input aria-label="New tier" value={newTier} onChange={e=>setNewTier(e.target.value)} placeholder="New Britium tier" className="rounded-lg border p-2"/><button type="button" onClick={async()=>{const {data,error}=await supabase.rpc("be_tariff_tier_manage_v1",{p_action:"ADD",p_tier:newTier.trim(),p_base_fee:4000,p_extra_per_kg:500,p_free_kg:3,p_highway_fee:0});if(error||((data as any)?.ok!==true))setErrorMessage(error?.message||"Unable to add tariff tier.");else{setNewTier("");await loadTariffs();}}}>Add tier</button></div>}
      <div className="rounded-[32px] border border-black/10 bg-white/55 p-6 shadow-sm backdrop-blur-md">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950">
              {text(
                language,
                "Live Tariff Matrix",
                "လက်ရှိ ကုန်ကျစရိတ်နှုန်းထားဇယား",
              )}
            </h2>

            <p className="mt-1 text-sm text-slate-700">
              {text(
                language,
                "Edit the canonical tier, weight, base-fee, extra-weight, and highway values.",
                "အဓိက အဆင့်၊ အလေးချိန်၊ အခြေခံကြေး၊ အပိုအလေးချိန်ကြေးနှင့် အဝေးပြေးကြေးတို့ကို ပြင်ဆင်နိုင်သည်။",
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadTariffs()}
            disabled={loading || savingTier !== null}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                loading ? "animate-spin" : ""
              }`}
            />
            {text(
              language,
              "Refresh",
              "ပြန်လည်ရယူမည်",
            )}
          </button>
        </div>

        {notice && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            {notice}
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {errorMessage}
          </div>
        )}

        <div className="mt-5 overflow-x-auto rounded-2xl border border-black/10">
          <table className="min-w-[1080px] text-sm">
            <thead className="bg-white/80 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-black">
                  {text(language, "Tier", "နှုန်းထားအဆင့်")}
                </th>
                <th className="px-4 py-3 font-black">
                  {text(
                    language,
                    "Free KG",
                    "အခမဲ့ အလေးချိန် KG",
                  )}
                </th>
                <th className="px-4 py-3 font-black">
                  {text(
                    language,
                    "Base Fee",
                    "အခြေခံကြေး",
                  )}
                </th>
                <th className="px-4 py-3 font-black">
                  {text(
                    language,
                    "Extra / KG",
                    "အပိုတစ်ကီလိုကြေး",
                  )}
                </th>
                <th className="px-4 py-3 font-black">
                  {text(
                    language,
                    "Highway Fee",
                    "အဝေးပြေးကြေး",
                  )}
                </th>
                <th className="px-4 py-3 font-black">
                  {text(language, "Updated", "ပြင်ဆင်ချိန်")}
                </th>
                <th className="px-4 py-3 font-black">
                  {text(language, "Status", "အခြေအနေ")}
                </th>
                <th className="px-4 py-3 font-black">
                  {text(language, "Action", "လုပ်ဆောင်ချက်")}
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => {
                const saving =
                  savingTier === row.tier_name;

                return (
                  <tr
                    key={row.tier_name}
                    className="border-t border-black/5 bg-white/50"
                  >
                    <td className="px-4 py-3 font-bold text-slate-950">
                      {row.tier_name}
                    </td>

                    {(
                      [
                        "free_allowance_kg",
                        "base_fee_mmk",
                        "extra_per_kg_mmk",
                        "highway_fee_mmk",
                      ] as const
                    ).map((field) => (
                      <td key={field} className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          value={row[field]}
                          disabled={saving}
                          onChange={(event) =>
                            updateField(
                              row.tier_name,
                              field,
                              event.target.value,
                            )
                          }
                          className="h-10 w-32 rounded-xl border border-black/10 bg-white px-3 text-right font-semibold text-slate-900 outline-none disabled:opacity-60"
                        />
                      </td>
                    ))}

                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(row.updated_at)}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={
                          row.is_active
                            ? "inline-flex rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase text-emerald-700"
                            : "inline-flex rounded-full bg-slate-200 px-3 py-1 text-[10px] font-black uppercase text-slate-700"
                        }
                      >
                        {row.is_active
                          ? text(
                              language,
                              "Active",
                              "အသုံးပြုနေ",
                            )
                          : text(
                              language,
                              "Inactive",
                              "အသုံးမပြု",
                            )}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void saveTariff(row)}
                        disabled={
                          !canManage || savingTier !== null || loading
                        }
                        className="inline-flex items-center gap-2 rounded-xl bg-[#0d2c54] px-4 py-2 text-xs font-black text-white disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                        {saving
                          ? text(
                              language,
                              "Saving…",
                              "သိမ်းဆည်းနေသည်…",
                            )
                          : text(
                              language,
                              "Save",
                              "သိမ်းမည်",
                            )}
                      </button>
                      {canManage && <button type="button" className="ml-2 rounded-lg bg-red-100 px-3 py-2 text-red-900" onClick={async()=>{if(!window.confirm(`Deactivate ${row.tier_name}?`))return;const {error}=await supabase.rpc("be_tariff_tier_manage_v1",{p_action:"REMOVE",p_tier:row.tier_name});if(error)setErrorMessage(error.message);else await loadTariffs();}}>Remove</button>}
                    </td>
                  </tr>
                );
              })}

              {!loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-12 text-center text-sm text-slate-500"
                  >
                    {text(
                      language,
                      "No tariff tiers are available.",
                      "ကုန်ကျစရိတ်နှုန်းထားအဆင့် မရှိပါ။",
                    )}
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-12 text-center text-sm text-slate-500"
                  >
                    {text(
                      language,
                      "Loading tariff tiers…",
                      "ကုန်ကျစရိတ်နှုန်းထားများ ရယူနေသည်…",
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>}
    </div>
  );
}


type CatalogTariff = {destination_key:string;destination_name:string;standard_rate_mmk:number;is_active:boolean;provider_code:string};
function ProviderTariffManager({provider,language}:{provider:"ROYAL EXPRESS";language:Language}){
 const [items,setItems]=useState<CatalogTariff[]>([]);
 const [rights,setRights]=useState<{can_manage:boolean;is_superadmin:boolean;rights:{role_code:string;can_manage:boolean}[]}|null>(null);
 const [name,setName]=useState(""); const [price,setPrice]=useState("5000");
 const [editing,setEditing]=useState<Record<string,{name:string;price:string}>>({});
 const [working,setWorking]=useState(false); const [message,setMessage]=useState("");
 const refresh=useCallback(async()=>{
   const [catalog,access]=await Promise.all([supabase.from("be_data_entry_tariff_catalog").select("destination_key,destination_name,standard_rate_mmk,is_active,provider_code").eq("provider_code",provider).order("destination_name"),supabase.rpc("be_tariff_rights_list_v1")]);
   if(catalog.error) throw catalog.error; if(access.error) throw access.error;
   setItems((catalog.data||[]) as CatalogTariff[]);setRights(access.data as any);
 },[provider]);
 useEffect(()=>{void refresh().catch(e=>setMessage(e.message));},[refresh]);
 async function mutate(action:"ADD"|"EDIT"|"REMOVE"|"SAVE",key:string,displayName:string,amount:string){
   if(!rights?.can_manage){setMessage("Tariff edit permission required.");return;}
   if(action!=="REMOVE"&&(!/^\d+$/.test(amount.trim())||!displayName.trim())){setMessage("Enter a valid destination and whole-number price.");return;}
   if(action==="REMOVE"&&!window.confirm("Deactivate this tariff? Existing historical records will be preserved."))return;
   setWorking(true);setMessage("");try{
     const {data,error}=await supabase.rpc("be_tariff_catalog_manage_v1",{p_provider:provider,p_action:action,p_key:key,p_name:displayName,p_rate:action==="REMOVE"?null:Number(amount)});
     if(error)throw error;if((data as any)?.ok!==true)throw Error("Tariff update rejected");
     await refresh();setMessage("Saved successfully.");if(action==="ADD")setName("");
   }catch(e:any){setMessage(e?.message||"Unable to save tariff.");}finally{setWorking(false);}
 }
 async function toggle(role:string,allowed:boolean){setWorking(true);try{const {error}=await supabase.rpc("be_tariff_rights_manage_v1",{p_role:role,p_allowed:allowed});if(error)throw error;await refresh();setMessage("Permission updated.");}catch(e:any){setMessage(e.message);}finally{setWorking(false);}}
 return <div className="rounded-3xl border bg-white p-5 space-y-4">
   <h3 className="text-xl font-black">Royal Express — Destination Tariffs</h3>
   <p className="text-sm text-slate-600">Provider-specific rates; does not change Britium tariffs. Removing a tariff deactivates it and preserves its audit history.</p>
   {message&&<div role="status" className="rounded-xl bg-blue-50 p-3 text-sm">{message}</div>}
   {rights?.can_manage&&<div className="grid gap-2 md:grid-cols-[1fr_160px_auto]"><input aria-label="Destination name" value={name} onChange={e=>setName(e.target.value)} placeholder="New destination (e.g. ထောက်ကြံ့)" className="rounded-xl border p-3"/><input type="number" min="0" aria-label="Standard tariff MMK" value={price} onChange={e=>setPrice(e.target.value)} className="rounded-xl border p-3"/><button disabled={working||!name.trim()} className="rounded-xl bg-blue-900 p-3 font-bold text-white disabled:opacity-50" onClick={()=>void mutate("ADD",name.trim().toLowerCase()+" (royal)",name.trim()+" (Royal)",price)}>Add</button></div>}
   <div className="max-h-[520px] overflow-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="text-left"><th className="p-2">Destination</th><th className="p-2">Standard MMK</th><th className="p-2">Status</th><th className="p-2">Actions</th></tr></thead><tbody>{items.map(t=>{const edit=editing[t.destination_key]||{name:t.destination_name,price:String(t.standard_rate_mmk)};return <tr key={t.destination_key} className="border-t"><td className="p-2"><input className="w-full rounded-lg border p-2" disabled={!rights?.can_manage||working} value={edit.name} onChange={e=>setEditing(v=>({...v,[t.destination_key]:{...edit,name:e.target.value}}))}/></td><td className="p-2"><input className="w-28 rounded-lg border p-2" type="number" disabled={!rights?.can_manage||working} value={edit.price} onChange={e=>setEditing(v=>({...v,[t.destination_key]:{...edit,price:e.target.value}}))}/></td><td className="p-2">{t.is_active?"Active":"Inactive"}</td><td className="p-2 whitespace-nowrap">{rights?.can_manage&&<><button disabled={working} className="mr-2 rounded-lg bg-blue-900 px-3 py-2 text-white" onClick={()=>void mutate("SAVE",t.destination_key,edit.name,edit.price)}>Save / Edit</button><button disabled={working||!t.is_active} className="rounded-lg bg-rose-100 px-3 py-2 text-rose-900" onClick={()=>void mutate("REMOVE",t.destination_key,edit.name,edit.price)}>Remove</button></>}</td></tr>})}</tbody></table></div>
   {rights?.is_superadmin&&<section className="space-y-2 rounded-xl border p-3"><h4 className="font-black">Super Admin — Revoke / Grant Tariff Editing Rights</h4>{(rights.rights||[]).map(role=><label key={role.role_code} className="flex items-center gap-2"><input type="checkbox" checked={role.can_manage} disabled={working} onChange={e=>void toggle(role.role_code,e.target.checked)}/>{role.role_code}</label>)}</section>}
 </div>;
}
