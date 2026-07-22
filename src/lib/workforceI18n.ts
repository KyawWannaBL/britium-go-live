export function bi(english: string, myanmar: string): string {
  return `${english} / ${myanmar}`;
}

const ERROR_TRANSLATIONS: Array<{
  match: string;
  message: string;
}> = [
  {
    match: "AUTHENTICATION_REQUIRED",
    message: bi(
      "Authentication is required.",
      "အကောင့်ဝင်ရောက်ထားရန် လိုအပ်ပါသည်။"
    ),
  },
  {
    match: "AUTHENTICATION IS REQUIRED",
    message: bi(
      "Authentication is required.",
      "အကောင့်ဝင်ရောက်ထားရန် လိုအပ်ပါသည်။"
    ),
  },
  {
    match: "PICKUP_ID_REQUIRED",
    message: bi(
      "Pickup ID is required.",
      "ပစ္စည်းယူမှုအမှတ် လိုအပ်ပါသည်။"
    ),
  },
  {
    match: "PICKUP_NOT_FOUND",
    message: bi(
      "Pickup task was not found.",
      "ပစ္စည်းယူရန်တာဝန်ကို မတွေ့ပါ။"
    ),
  },
  {
    match: "RIDER_NOT_AUTHORIZED_FOR_PICKUP",
    message: bi(
      "This task is not assigned to you.",
      "ဤတာဝန်ကို သင့်ထံ ခွဲဝေထားခြင်း မရှိပါ။"
    ),
  },
  {
    match: "ARRIVAL_REQUIRED_BEFORE_VERIFICATION",
    message: bi(
      "Mark arrival before submitting verification.",
      "အတည်ပြုချက်မပို့မီ ရောက်ရှိကြောင်း အရင်မှတ်သားပါ။"
    ),
  },
  {
    match: "PARCELS_REQUIRED",
    message: bi(
      "Parcel information is required.",
      "ပါဆယ်အချက်အလက် လိုအပ်ပါသည်။"
    ),
  },
  {
    match: "PARCELS_ARRAY_REQUIRED",
    message: bi(
      "Parcel information is invalid.",
      "ပါဆယ်အချက်အလက် ပုံစံမမှန်ပါ။"
    ),
  },
  {
    match: "UPLOADED_PARCEL_PROOF_REQUIRED",
    message: bi(
      "A parcel photo and positive weight are required.",
      "ပါဆယ်ဓာတ်ပုံနှင့် သုညထက်ကြီးသော အလေးချိန် လိုအပ်ပါသည်။"
    ),
  },
  {
    match: "REVIEWER_APPROVAL_REQUIRED",
    message: bi(
      "Data Entry review is required.",
      "စာရင်းသွင်းဌာနမှ စစ်ဆေးအတည်ပြုရန် လိုအပ်ပါသည်။"
    ),
  },
  {
    match: "PARCEL_REVIEW_PENDING",
    message: bi(
      "Parcel proofs are waiting for review.",
      "ပါဆယ်အထောက်အထားများကို စစ်ဆေးရန် စောင့်ဆိုင်းနေပါသည်။"
    ),
  },
  {
    match: "RECIPIENT_NAME_REQUIRED",
    message: bi(
      "Recipient name is required.",
      "လက်ခံသူအမည် လိုအပ်ပါသည်။"
    ),
  },
  {
    match: "PROOF_URL",
    message: bi(
      "A valid proof photo is required.",
      "မှန်ကန်သော အထောက်အထားဓာတ်ပုံ လိုအပ်ပါသည်။"
    ),
  },
  {
    match: "EXCEPTION_REMARK_REQUIRED",
    message: bi(
      "Please describe the problem.",
      "ဖြစ်ပေါ်နေသော ပြဿနာကို ရေးသားပေးပါ။"
    ),
  },
  {
    match: "FINAL_STATUS_CANNOT_BE_CHANGED",
    message: bi(
      "A completed task cannot be changed.",
      "ပြီးစီးသောတာဝန်ကို ပြန်လည်ပြင်ဆင်၍ မရပါ။"
    ),
  },
  {
    match: "ONLY IMAGE PROOF FILES",
    message: bi(
      "Only image files can be used as proof.",
      "အထောက်အထားအဖြစ် ဓာတ်ပုံဖိုင်များသာ အသုံးပြုနိုင်ပါသည်။"
    ),
  },
  {
    match: "ROW-LEVEL SECURITY",
    message: bi(
      "You do not have permission to upload this proof.",
      "ဤအထောက်အထားကို တင်ရန် သင့်တွင် ခွင့်ပြုချက်မရှိပါ။"
    ),
  },
  {
    match: "PAYLOAD TOO LARGE",
    message: bi(
      "The selected image is too large.",
      "ရွေးချယ်ထားသော ဓာတ်ပုံဖိုင် အရွယ်အစားကြီးလွန်းပါသည်။"
    ),
  },
];

export function workforceErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (!raw) {
    return bi(
      "The request could not be completed.",
      "လုပ်ဆောင်ချက်ကို မပြီးမြောက်နိုင်ပါ။"
    );
  }

  if (raw.includes(" / ")) {
    return raw;
  }

  const normalized = raw.toUpperCase();

  const translated = ERROR_TRANSLATIONS.find(({ match }) =>
    normalized.includes(match)
  );

  if (translated) {
    return translated.message;
  }

  return bi(
    raw,
    "လုပ်ဆောင်ချက် မအောင်မြင်ပါ။ ပြန်လည်ကြိုးစားပါ။"
  );
}
