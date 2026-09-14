import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeRole } from '@/lib/portalRegistry';

function roleLabel(role?: string) {
  const normalized = normalizeRole(role);
  if (normalized === 'superadmin' || normalized === 'super-admin') return 'SUPER ADMIN';
  return normalized.replace(/-/g, ' ').toUpperCase();
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

export default function ProfilePage() {
  const { t } = useLanguage();
  const { user, profile } = useAuth();

  const email = profile?.email || user?.email || '-';
  const fallbackName = email.includes('@') ? email.split('@')[0] : email;
  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || fallbackName || '-';
  const role = roleLabel(profile?.role);
  const status = (profile?.status || (profile?.authorized ? 'active' : 'unknown')).toUpperCase();
  const branch = profile?.branch_code || '-';
  const territories = profile?.territories ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between border-b border-[#1a3a5c] pb-4">
        <div>
          <h1 className="mb-1 text-[16px] uppercase text-[#f6b84b]">{t('PROFILE', 'ကိုယ်ရေးအချက်အလက်')}</h1>
          <p className="text-[13px] text-[#4d7a9b]">{t('Current login identity and authorized operating scope.', 'လက်ရှိဝင်ရောက်ထားသည့် အကောင့်နှင့် ခွင့်ပြုထားသော လုပ်ငန်းနယ်ပယ်။')}</p>
        </div>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-emerald-400">
          {status}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-8 text-center">
          <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full border-2 border-[#f6b84b] bg-[#1a3a5c] text-3xl text-[#f6b84b]">
            {initials(displayName)}
          </div>
          <h2 className="mb-1 text-[18px] text-[#eef8ff]">{displayName}</h2>
          <p className="mb-4 break-all text-[13px] text-[#4d7a9b]">{email}</p>
          <span className="rounded-full bg-[#1a3a5c] px-4 py-1.5 text-[11px] uppercase tracking-widest text-[#4ea8de]">
            {role}
          </span>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-6">
            <h3 className="mb-6 border-b border-[#1a3a5c] pb-4 text-[14px] uppercase tracking-widest text-[#eef8ff]">{t('Login Information', 'ဝင်ရောက်အသုံးပြုသူ အချက်အလက်')}</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Info label={t('DISPLAY NAME', 'အမည်')} value={displayName} />
              <Info label={t('EMAIL ADDRESS', 'အီးမေးလ်')} value={email} />
              <Info label={t('ROLE', 'တာဝန်/အခန်းကဏ္ဍ')} value={role} />
              <Info label={t('ACCOUNT STATUS', 'အကောင့်အခြေအနေ')} value={status} />
              <Info label={t('BRANCH', 'ရုံးခွဲ')} value={branch} />
              <Info label={t('USER ID', 'အသုံးပြုသူ ID')} value={profile?.auth_user_id || user?.id || '-'} />
            </div>
          </div>

          <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-6">
            <h3 className="mb-4 border-b border-[#1a3a5c] pb-4 text-[14px] uppercase tracking-widest text-[#eef8ff]">{t('Authorized Territory', 'ခွင့်ပြုထားသော လုပ်ငန်းနယ်ပယ်')}</h3>
            {territories.length ? (
              <div className="space-y-3">
                {territories.map((territory, index) => (
                  <div key={`${territory.scope_type}-${territory.branch_code ?? ''}-${territory.township_key ?? ''}-${index}`} className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-4">
                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#eef8ff]">
                      <strong>{territory.scope_type}</strong>
                      {territory.branch_code ? <span>• {territory.branch_code}</span> : null}
                      {territory.township_key ? <span>• {territory.township_key}</span> : null}
                    </div>
                    <div className="mt-2 text-[11px] uppercase tracking-wide text-[#4d7a9b]">
                      {territory.can_read ? 'READ ' : ''}{territory.can_create ? 'CREATE ' : ''}{territory.can_update ? 'UPDATE ' : ''}{territory.can_delete ? 'DELETE' : ''}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-[#4d7a9b]">{t('No territory restriction is assigned to this role.', 'ဤအခန်းကဏ္ဍအတွက် သီးခြားနယ်ပယ်ကန့်သတ်ချက် မသတ်မှတ်ထားပါ။')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-2 text-[11px] uppercase tracking-widest text-[#4d7a9b]">{label}</div>
      <div className="min-h-12 break-all rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-[13px] text-[#eef8ff]">{value}</div>
    </div>
  );
}
