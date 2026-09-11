import { useEffect, useMemo, useState } from 'react';
import {
  findMerchant,
  loadMerchantMaster,
  merchantSuggestions,
  merchantToFormPatch,
  type MerchantMaster,
} from '@/lib/locationMerchantSync';

type Props = {
  value: string;
  onSelect: (merchant: MerchantMaster, patch: ReturnType<typeof merchantToFormPatch>) => void;
  label?: string;
  required?: boolean;
  inputClassName?: string;
  labelClassName?: string;
  wrapperClassName?: string;
};

/**
 * Shared merchant selector for all pickup/order/waybill screens.
 * Selecting a merchant auto-fills code, address, phone, township, city,
 * region_state, payment_terms, business_type, branch_code, and tariff tier.
 */
export default function MerchantAutoFillField({
  value,
  onSelect,
  label = 'Merchant / Customer',
  required = false,
  inputClassName = "w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]",
  labelClassName = "block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2",
  wrapperClassName = '',
}: Props) {
  const [master, setMaster] = useState<MerchantMaster[]>([]);
  const [typedValue, setTypedValue] = useState(value || '');
  const [warning, setWarning] = useState('');

  useEffect(() => {
    loadMerchantMaster().then(setMaster);
  }, []);

  useEffect(() => {
    setTypedValue(value || '');
  }, [value]);

  const listId = useMemo(() => `merchant-master-${Math.random().toString(36).slice(2)}`, []);
  const suggestions = merchantSuggestions(master, typedValue);

  const commitMerchant = (rawValue: string) => {
    const merchant = findMerchant(master, rawValue);

    if (!merchant) {
      setWarning(rawValue ? 'Select merchant from master list to auto-fill merchant data.' : '');
      return;
    }

    setWarning('');
    setTypedValue(`${merchant.merchant_code} - ${merchant.merchant_name}`);
    onSelect(merchant, merchantToFormPatch(merchant));
  };

  return (
    <div className={wrapperClassName}>
      <label className={labelClassName}>
        {label} {required ? <span className="text-[#f6b84b]">*</span> : null}
      </label>
      <input
        list={listId}
        value={typedValue}
        required={required}
        onChange={(e) => {
          setTypedValue(e.target.value);
          setWarning('');
        }}
        onBlur={(e) => commitMerchant(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitMerchant((e.target as HTMLInputElement).value);
          }
        }}
        placeholder="Type merchant name/code/phone..."
        className={inputClassName}
      />
      <datalist id={listId}>
        {suggestions.map((merchant) => (
          <option
            key={merchant.merchant_code}
            value={`${merchant.merchant_code} - ${merchant.merchant_name}`}
          >
            {merchant.phone_primary || ''} / {merchant.township || ''} / {merchant.city || ''}
          </option>
        ))}
      </datalist>
      {warning ? <div className="text-[#f43f7d] text-[11px] mt-1 font-bold">{warning}</div> : null}
    </div>
  );
}
