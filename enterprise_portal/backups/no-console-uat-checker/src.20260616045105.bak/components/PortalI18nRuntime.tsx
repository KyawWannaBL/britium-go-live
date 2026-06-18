import { useEffect } from "react";

type Dict = Record<string, string>;

const mm: Dict = {
  "Britium Express": "Britium Express",
  "Enterprise Portal": "လုပ်ငန်းသုံး ပေါ်တယ်",
  "Britium Express UAT Portal": "Britium Express UAT ပေါ်တယ်",
  "Enterprise Operations": "လုပ်ငန်းလည်ပတ်မှုများ",
  "Dashboard": "ဒက်ရှ်ဘုတ်",
  "Create Delivery": "ပို့ဆောင်မှု ဖန်တီးရန်",
  "Customer Service Portal": "ဖောက်သည်ဝန်ဆောင်မှု ပေါ်တယ်",
  "Way Management": "လမ်းကြောင်း/Way စီမံခန့်ခွဲမှု",
  "Supervisor Hub": "စူပါဗိုက်ဇာ စင်တာ",
  "Pickup Assignment": "ပစ်ကပ် တာဝန်ပေးခြင်း",
  "Data Entry": "ဒေတာထည့်သွင်းခြင်း",
  "Warehouse Ops": "ဂိုဒေါင် လုပ်ငန်းများ",
  "Dispatch Center": "Dispatch စင်တာ",
  "Branch Office": "ရုံးခွဲ",
  "Finance Portal": "ဘဏ္ဍာရေး ပေါ်တယ်",
  "COD Settlement": "COD စာရင်းရှင်းခြင်း",
  "Waybill & Invoice": "Waybill နှင့် Invoice",
  "Merchant Portal": "Merchant ပေါ်တယ်",
  "Customer Portal": "Customer ပေါ်တယ်",
  "Marketing": "စျေးကွက်ရှာဖွေရေး",
  "Business Development": "လုပ်ငန်းတိုးတက်ရေး",
  "Operations Manager": "လုပ်ငန်းမန်နေဂျာ",
  "Rider / Driver / Helper Ops": "Rider / Driver / Helper လုပ်ငန်းများ",
  "Master Data": "Master Data",
  "Exceptions": "ခြွင်းချက်များ",
  "Reporting": "အစီရင်ခံစာများ",
  "Accounts / HR": "စာရင်းကိုင် / HR",
  "Tariff": "နှုန်းထား",
  "Settings": "ဆက်တင်များ",
  "Profile": "ကိုယ်ရေးအချက်အလက်",
  "Sign out": "ထွက်ရန်",
  "Report Download": "အစီရင်ခံစာ ဒေါင်းလုဒ်",
  "Submitted Data / Timeline Report": "တင်သွင်းထားသော ဒေတာ / အချိန်ကာလ အစီရင်ခံစာ",
  "Report Name": "အစီရင်ခံစာအမည်",
  "Timeline": "အချိန်ကာလ",
  "Date From": "စတင်ရက်",
  "Date To": "ပြီးဆုံးရက်",
  "Date Range": "ရက်အပိုင်းအခြား",
  "Download CSV": "CSV ဒေါင်းလုဒ်",
  "Download JSON": "JSON ဒေါင်းလုဒ်",
  "Template Bulk Load": "Template အစုလိုက်တင်ခြင်း",
  "Data Entry / Bulk Upload": "ဒေတာထည့်သွင်းခြင်း / အစုလိုက်တင်ခြင်း",
  "Pickup Order Selection Required": "ပစ်ကပ်အော်ဒါ ရွေးချယ်ရန် လိုအပ်သည်",
  "Select Picking Order Request": "ပစ်ကပ်အော်ဒါ Request ရွေးချယ်ပါ",
  "Pickup Request": "ပစ်ကပ် Request",
  "Select pickup request": "ပစ်ကပ် Request ရွေးချယ်ပါ",
  "Selected Order Context": "ရွေးထားသော အော်ဒါအချက်အလက်",
  "Refresh Pickups": "ပစ်ကပ်များ ပြန်ဖတ်ရန်",
  "Refreshing...": "ပြန်ဖတ်နေသည်...",
  "No pickup selected": "ပစ်ကပ် မရွေးရသေးပါ",
  "Inbound Data Source": "ဝင်လာသော ဒေတာရင်းမြစ်",
  "Manual Excel / CSV Upload": "Manual Excel / CSV တင်ရန်",
  "Waybill / Way ID": "Waybill / Way ID",
  "Auto or scan waybill": "Waybill ကို အလိုအလျောက် သို့မဟုတ် စကန်ဖတ်ပါ",
  "Shipment row template": "Shipment row template",
  "Warehouse Operations": "ဂိုဒေါင်လုပ်ငန်းများ",
  "Order Picking Assignment": "အော်ဒါ Pick-up တာဝန်ပေးခြင်း",
  "Pickup Notifications": "ပစ်ကပ် အသိပေးချက်များ",
  "Rider": "Rider",
  "Driver": "Driver",
  "Helper": "Helper",
  "Fleet / Vehicle Master": "Fleet / ယာဉ် Master",
  "Supervisor Note": "စူပါဗိုက်ဇာ မှတ်ချက်",
  "Assign pickup resources": "ပစ်ကပ် အရင်းအမြစ်များ တာဝန်ပေးရန်",
  "Select rider from master data": "Master Data မှ Rider ရွေးချယ်ပါ",
  "No driver / select driver": "Driver မရှိ / Driver ရွေးပါ",
  "No helper / select helper": "Helper မရှိ / Helper ရွေးပါ",
  "Select fleet / vehicle": "Fleet / ယာဉ် ရွေးပါ",
  "New pickup request": "ပစ်ကပ် Request အသစ်",
  "Pickup assigned": "ပစ်ကပ် တာဝန်ပေးပြီး",
  "Only recipient name, recipient phone, delivery address and scan/proof notes are manual. IDs, merchant, pickup, charges, status and finance fields are synchronized from backend masterdata and tariff APIs.": "လက်ခံသူအမည်၊ ဖုန်းနံပါတ်၊ ပို့ဆောင်ရန်လိပ်စာနှင့် scan/proof မှတ်ချက်များသာ ကိုယ်တိုင်ထည့်ရန်လိုသည်။ ID၊ merchant၊ pickup၊ charges၊ status နှင့် finance fields များကို backend masterdata နှင့် tariff API များမှ အလိုအလျောက် synchronize လုပ်မည်။"
};

function currentLang(): "en" | "mm" {
  const v = (localStorage.getItem("be_language") || localStorage.getItem("britium_language") || localStorage.getItem("language") || "en").toLowerCase();
  return v.includes("mm") || v.includes("my") ? "mm" : "en";
}

function setLang(lang: "en" | "mm") {
  localStorage.setItem("be_language", lang);
  localStorage.setItem("britium_language", lang);
  document.documentElement.setAttribute("data-be-language", lang);
}

function walkText(root: ParentNode, lang: "en" | "mm") {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent) continue;
    if (["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "OPTION"].includes(parent.tagName)) continue;
    const raw = node.nodeValue || "";
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!parent.dataset.beOriginalText) parent.dataset.beOriginalText = trimmed;
    const original = parent.dataset.beOriginalText || trimmed;
    if (lang === "mm" && mm[original]) {
      node.nodeValue = raw.replace(trimmed, mm[original]);
    } else if (lang === "en") {
      node.nodeValue = raw.replace(trimmed, original);
    }
  }
}

function translateAttributes(lang: "en" | "mm") {
  const els = Array.from(document.querySelectorAll("input, textarea, select, option, button")) as HTMLElement[];
  for (const el of els) {
    const input = el as HTMLInputElement;
    const text = (input.placeholder || input.getAttribute("aria-label") || "").trim();
    if (text) {
      if (!el.dataset.beOriginalPlaceholder) el.dataset.beOriginalPlaceholder = text;
      const original = el.dataset.beOriginalPlaceholder || text;
      if (lang === "mm" && mm[original]) input.placeholder = mm[original];
      if (lang === "en") input.placeholder = original;
    }
  }
}

function applyLanguage() {
  const lang = currentLang();
  document.documentElement.setAttribute("data-be-language", lang);
  walkText(document.body, lang);
  translateAttributes(lang);
}

export default function PortalI18nRuntime() {
  useEffect(() => {
    applyLanguage();
    const onClick = (event: MouseEvent) => {
      const text = ((event.target as HTMLElement | null)?.textContent || "").trim().toUpperCase();
      if (text === "MM") { setLang("mm"); setTimeout(applyLanguage, 50); }
      if (text === "EN") { setLang("en"); setTimeout(applyLanguage, 50); }
    };
    document.addEventListener("click", onClick, true);
    const observer = new MutationObserver(() => applyLanguage());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      document.removeEventListener("click", onClick, true);
      observer.disconnect();
    };
  }, []);
  return null;
}
