# Britium Express — Royal Express Inventory Reconciliation SOP
**အသုံးပြုသူ:** ကေဇင် (Customer Service / Third-Party Reconciliation)
**Version:** 2026-11-15 · **System:** Britium Express Enterprise Portal
**Page:** `https://www.britiumexpress.com/cs-third-party`

## အလုပ်မစမီ
- ကုမ္ပဏီကခွင့်ပြုထားသော CS login ကိုသာ အသုံးပြုပါ။ Finance/Operations အကောင့်များသည် View ခွင့်ရှိနိုင်သော်လည်း Confirmation ကို CS အခွင့်အာဏာဖြင့်သာ Save လုပ်နိုင်သည်။
- နေ့စွဲအလိုက် Inventory Excel နှင့် Royal Express ၏ Delivery Report/POD, Way ID/Tracking Reference ကို အသင့်ထားပါ။
- Excel စာရင်း၏ မူရင်းမိတ္တူကို သိမ်းဆည်းပါ။ ဖိုင်ကို Browser အတွင်းသာ နှိုင်းယှဉ်ပြီး Database ထဲအလိုအလျောက်မတင်ပါ။

## အဆင့် (၁) — Portal ဝင်ရန်
1. `www.britiumexpress.com` ကိုဖွင့်ပြီး Login ဝင်ပါ။
2. Third-party Delivery Confirmation စာမျက်နှာကိုဖွင့်ပါ (တိုက်ရိုက် URL: `/cs-third-party`)။
3. Search / Refresh နှိပ်၍ လက်ရှိ Ways စာရင်းကိုကြည့်ပါ။ ရှာဖွေရေးတွင် Way ID သို့မဟုတ် Merchant ကို အသုံးပြုနိုင်သည်။
4. Outcome filter မှ `ALL`, `UNCONFIRMED`, `DELIVERED`, `RTO` စသည်ကို ရွေးပါ။

## အဆင့် (၂) — Excel Inventory တင်ပြီး နှိုင်းယှဉ်ရန်
1. **Compare Excel** ကိုနှိပ်၍ `.xlsx`, `.xls` သို့မဟုတ် `.csv` ဖိုင်ကိုရွေးပါ (အများဆုံး 15 MB)။
2. ဖိုင်တွင် `Way ID` သို့မဟုတ် `Delivery Way ID` ခေါင်းစီးပါရမည်။ `Final COD`, `COD Amount`, `COD`, `Amount` ခေါင်းစီးများမှ ငွေပမာဏကို ဖတ်နိုင်သည်။ `Township`, `Destination` စသည်ကိုလည်း ထည့်ထားနိုင်သည်။
3. Import notice ထဲတွင် **Unique Way IDs / Total rows** ကိုစစ်ပါ။ ရက်စွဲအလိုက် sheet များအားလုံးကို ဖတ်နိုင်သော်လည်း Screen သည် Excel ၏ရက်စွဲကို System တိုက်ရိုက် Filter မလုပ်ပေးပါ။
4. **System COD**, **Inventory COD (reference)**, **Variance / flags** ကိုနှိုင်းယှဉ်ပါ။ ငွေကွာဟမှုရှိရင် အလိုအလျောက်မပြင်ပါ။
5. **Needs review only** ကိုရွေးပြီး ပြဿနာရှိသော Ways များကိုစုကြည့်ပါ။
6. **Export review CSV** ကိုနှိပ်၍ စစ်ဆေးရန်စာရင်း ထုတ်ပါ။ Export သည် လက်ရှိ Screen Filter/Loaded Ways အတွက်သာ ဖြစ်ပြီး မတင်ရသေးသော Inventory Rows အားလုံးကို မပါဝင်နိုင်ပါ။

## အဆင့် (၃) — Warning များကို ကိုင်တွယ်ရန်
| Warning/အခြေအနေ | လုပ်ဆောင်ရမည့်အချက် |
|---|---|
| **COD mismatch** | Inventory, System, Royal POD/ငွေလက်ခံစာကို တိုက်စစ်ပါ။ Finance သို့ evidence ဖြင့်တင်ပြပါ။ ခွင့်ပြုချက်မရှိဘဲ amount မပြင်၊ Delivered မနှိပ်ပါ။ |
| **Inventory duplicates** | Way ID ထပ်နေသော row များကို ပစ္စည်းအမှန်တကယ်အရေအတွက်နှင့်စစ်ပါ။ Recipient Name တူရုံဖြင့် Duplicate မဟုတ်နိုင်။ Original record ကို မဖျက်ပါ။ |
| **Not matched / Pending** | Source Excel sheet, Way ID format, System Data Entry စာရင်းကိုစစ်ပါ။ Inventory database reference မရှိခြင်းက ပစ္စည်းပျောက်ခြင်းကို မဆိုလိုပါ။ |
| **Wrong branch/provider?** | ရန်ကုန် → Britium Yangon, မန္တလေး → Mandalay Branch, နေပြည်တော်/လယ်ဝေး/တပ်ကုန်း → NPT Branch စည်းမျဉ်းနှင့် စစ်ပါ။ Outsourced DK ခွင့်ပြုထားမှုကိုသာ သီးခြားစစ်ပါ။ |
| **Royal parcel not in system** | Data Entry/Operations ကို Way ID၊ Merchant၊ Date၊ Recipient၊ Township၊ ငွေစာရင်း၊ POD ဖြင့် တင်ပြ၍ သက်ဆိုင်ရာ Registration ကို စစ်ခိုင်းပါ။ |
| **Gate drop-off** | ဂိတ်အမည်၊ Handover date၊ လက်ခံသူ၊ Gate receipt ကို မှတ်တမ်းထားပြီး Customer Received ဖြစ်ကြောင်း အထောက်အထားမရှိလျှင် `DELIVERED` မရွေးပါနှင့်။ ဒီ Screen တွင် သီးသန့် `AT_GATE` Workflow မရှိသေးပါ။ |

## အဆင့် (၄) — အမှန်တကယ် Delivered ဖြစ်သော Way ကို အတည်ပြုရန်
1. Way ID, Recipient, Township, COD, Provider, Invoice နှင့် Royal POD ကို တစ်ခုချင်းစစ်ပါ။
2. `Confirm / RTO` ကိုနှိပ်ပါ။
3. **Delivered** ကိုရွေးပြီး Provider ကို စစ်ပါ။
4. Evidence reference ရရှိလျှင် ထည့်ပါ။ **Verification notes** ထဲတွင် ဘယ်သူ၊ ဘယ်နေ့၊ ဘယ်အထောက်အထားဖြင့် Confirm ဖြစ်ကြောင်း အနည်းဆုံး 8 characters ရေးပါ။
5. COD/duplicate/routing warning ရှိလျှင် ပြန်လည်စစ်ပြီးမှ ဆက်လုပ်ပါ။ `Save confirmation & send to Finance` ကိုနှိပ်ပါ။
6. Save အောင်မြင်လျှင် CS confirmation history နှင့် Merchant-specific Finance Review တို့တွင် မှတ်တမ်းတင်ပေးမည်။ **ဤအဆင့်သည် COD ငွေလက်ခံပြီးကြောင်း၊ Settlement ပြီးကြောင်း၊ Parcel Master status ပြောင်းပြီးကြောင်း မဆိုလိုပါ။**

## အဆင့် (၅) — Delivery မပြီးသေးသော Way
- `RTO`, `FAILED`, `POSTPONED`, `REFUSED`, `HANDED_TO_PARTNER` စသည့် outcome ကို စာရွက်စာတမ်းနှင့် ကိုက်ညီမှ ရွေးပါ။
- Delivered မဟုတ်သော outcome အတွက် **Failure / RTO / postponement reason** ကို ရွေးရမည်။ Verification notes အနည်းဆုံး 8 characters ဖြည့်ပါ။
- နေ့ရက်ချိန်းပြန်ပေးသည့် Way အတွက် `POSTPONED` + reason `CUSTOMER_REQUESTED_POSTPONEMENT` ကို အတည်ပြုရက်သတ်မှတ်ချက်ဖြင့် မှတ်တမ်းတင်ပါ။ ယင်းသည် Wayplan မတင်မီ Date Guard အပြည့်အဝအလုပ်လုပ်ကြောင်း အာမခံခြင်းမဟုတ်ပါ။
- ဂိတ်ချအတွက် Final Customer POD မရှိလျှင် `DELIVERED` ကို မရွေးပါနှင့်။

## နေ့စဉ် Reporting
- Excel Date/Sheet name, Import count, Matched count, COD mismatches, Duplicate candidates, Routing review, Missing Ways, Confirmed Delivered, Pending Finance ကို သီးခြားရေးထားပါ။
- Review CSV, Royal supporting documents, source Inventory file ကို သက်ဆိုင်ရာ Finance/Operations နှင့် လုံခြုံစွာမျှဝေပါ။
- မတူညီသော Amount ကိုတိတ်တဆိတ် ပြင်ခြင်း၊ Duplicate hard-delete လုပ်ခြင်း၊ Royal schedule ရှိရုံဖြင့် Delivered Confirm လုပ်ခြင်း **မပြုလုပ်ရ**။

## သိထားရန်
- Screen က အများဆုံး **300 Ways** ကို တစ်ကြိမ်တွင် Load လုပ်သည်။ ရှာဖွေမှု/Filter ကို သီးသန့်အသုံးပြုပြီး batch ခွဲစစ်ပါ။
- `Not matched` ဆိုတာ Warehouse reference table ထဲမတွေ့ခြင်းလည်းဖြစ်နိုင်သည်။ Source Excel ကိုပဲ မူရင်းအထောက်အထားအဖြစ် ထိန်းသိမ်းပါ။
- Changes များကို Database ထဲ Auto COD correction / Auto settlement မလုပ်ပါ။
- System Error ဖြစ်လျှင် Screen, Way ID, Date, warning, uploaded Excel sheet name ကို မှတ်တမ်းတင်ပြီး Operations/IT သို့တင်ပြပါ။
