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
      const { error } = await supabase.rpc(
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
                          savingTier !== null || loading
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
    </div>
  );
}
