export interface ExceptionRule {
  exception_code: string;
  exception_name_en: string;
  exception_name_mm: string;
  process_type: 'PICKUP' | 'DELIVERY' | 'WAREHOUSE';
  mapped_status: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  require_photo: 'YES' | 'No' | 'COND';
  require_call_log: 'YES' | 'No' | 'COND';
  require_remark: 'YES' | 'No' | 'COND';
  allow_reschedule: 'YES' | 'No' | 'COND';
  next_action: string;
  customer_message_en: string;
  customer_message_mm: string;
}

export interface ExceptionFormState {
  exceptionCode: string;
  remarks: string;
  photoUrl: string;
  callAttemptCount: number;
  nextAttemptDate: string | null;
}

export function validateExceptionRule(
  rule: ExceptionRule | undefined, 
  form: ExceptionFormState,
  lang: 'en' | 'mm' = 'mm'
): string[] {
  const errors: string[] = [];

  if (!rule) {
    errors.push(lang === 'mm' ? "အကြောင်းပြချက် ရွေးချယ်ရန် လိုအပ်ပါသည်။" : "Exception reason is required.");
    return errors;
  }

  // 1. Photo Requirement Check
  if (rule.require_photo === "YES" && !form.photoUrl?.trim()) {
    errors.push(lang === 'mm' ? "အထောက်အထား ဓာတ်ပုံ ထည့်သွင်းရန် လိုအပ်ပါသည်။" : "Photo proof is mandatory.");
  }

  // 2. Remark Requirement Check
  if (rule.require_remark === "YES" && !form.remarks?.trim()) {
    errors.push(lang === 'mm' ? "အခြေအနေအသေးစိတ်ကို မှတ်ချက် (Remark) တွင် ရေးပေးပါ။" : "Remarks are required for this exception.");
  }

  // 3. Call Log Check (For CUSTOMER_NOT_AVAILABLE, PHONE_UNREACHABLE)
  if (rule.require_call_log === "YES" && (!form.callAttemptCount || form.callAttemptCount < 1)) {
    errors.push(lang === 'mm' ? "Customer ထံ ဖုန်းခေါ်ဆိုမှု အကြိမ်ရေ ထည့်သွင်းပေးပါ။" : "Call attempt count is required.");
  }

  // 4. Reschedule Check
  if (rule.allow_reschedule === "YES" && !form.nextAttemptDate) {
    errors.push(lang === 'mm' ? "နောက်တစ်ကြိမ် ပြန်လည်ဆောင်ရွက်မည့် ရက်စွဲ ရွေးချယ်ပေးပါ။" : "Next attempt date is required.");
  }

  return errors;
}