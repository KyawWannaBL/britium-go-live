import { useEffect, useMemo, useState } from 'react';
import {
  findTownship,
  loadTownshipMaster,
  townshipSuggestions,
  townshipToFormPatch,
  type TownshipMaster,
} from '@/lib/locationMerchantSync';

type Props = {
  township: string;
  city?: string;
  regionState?: string;
  zone?: string;
  onPatch: (patch: {
    township: string;
    city: string;
    region_state?: string;
    zone?: string;
    branch_code?: string;
  }) => void;
  townshipLabel?: string;
  cityLabel?: string;
  required?: boolean;
  showCity?: boolean;
  inputClassName?: string;
  labelClassName?: string;
  wrapperClassName?: string;
};

/**
 * Shared township/city field for all Enterprise Portal + Rider App forms.
 * - Reads township master data from backend.
 * - Suggests township names as user types.
 * - Forces canonical spelling when a match is chosen.
 * - Auto-fills city, region_state, zone, and branch_code from township master.
 */
export default function SmartTownshipCityField({
  township,
  city = '',
  onPatch,
  townshipLabel = 'Township',
  cityLabel = 'City',
  required = false,
  showCity = true,
  inputClassName = "w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]",
  labelClassName = "block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2",
  wrapperClassName = '',
}: Props) {
  const [master, setMaster] = useState<TownshipMaster[]>([]);
  const [typedTownship, setTypedTownship] = useState(township || '');
  const [warning, setWarning] = useState('');

  useEffect(() => {
    loadTownshipMaster().then(setMaster);
  }, []);

  useEffect(() => {
    setTypedTownship(township || '');
  }, [township]);

  const listId = useMemo(() => `township-master-${Math.random().toString(36).slice(2)}`, []);
  const cityListId = useMemo(() => `city-master-${Math.random().toString(36).slice(2)}`, []);

  const suggestions = townshipSuggestions(master, typedTownship);
  const cities = Array.from(new Set(master.map((row) => row.city).filter(Boolean))).sort();

  const commitTownship = (value: string) => {
    const selected = findTownship(master, value);

    if (selected) {
      setWarning('');
      onPatch(townshipToFormPatch(selected));
      return;
    }

    setWarning(value ? 'Select township from master list to avoid spelling mistakes.' : '');
    onPatch({
      township: value,
      city,
    });
  };

  const commitCity = (value: string) => {
    const firstTownshipInCity = master.find((row) => row.city === value && row.township_name === township);
    const fallback = master.find((row) => row.city === value);

    onPatch({
      township,
      city: value,
      region_state: firstTownshipInCity?.region_state || fallback?.region_state,
      zone: firstTownshipInCity?.zone || fallback?.zone,
      branch_code: firstTownshipInCity?.branch_code || fallback?.branch_code,
    });
  };

  return (
    <>
      <div className={wrapperClassName}>
        <label className={labelClassName}>
          {townshipLabel} {required ? <span className="text-[#f6b84b]">*</span> : null}
        </label>
        <input
          list={listId}
          value={typedTownship}
          required={required}
          onChange={(e) => {
            setTypedTownship(e.target.value);
            setWarning('');
          }}
          onBlur={(e) => commitTownship(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitTownship((e.target as HTMLInputElement).value);
            }
          }}
          placeholder="Type township..."
          className={inputClassName}
        />
        <datalist id={listId}>
          {suggestions.map((row) => (
            <option key={`${row.city}-${row.township_name}`} value={row.township_name}>
              {row.city} / {row.zone || row.region_state || ''}
            </option>
          ))}
        </datalist>
        {warning ? <div className="text-[#f43f7d] text-[11px] mt-1 font-bold">{warning}</div> : null}
      </div>

      {showCity ? (
        <div className={wrapperClassName}>
          <label className={labelClassName}>
            {cityLabel} {required ? <span className="text-[#f6b84b]">*</span> : null}
          </label>
          <input
            list={cityListId}
            value={city}
            required={required}
            onChange={(e) => commitCity(e.target.value)}
            placeholder="City"
            className={inputClassName}
          />
          <datalist id={cityListId}>
            {cities.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </div>
      ) : null}
    </>
  );
}
