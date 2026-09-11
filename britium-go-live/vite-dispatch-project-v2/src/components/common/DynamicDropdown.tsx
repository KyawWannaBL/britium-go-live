import React from 'react';
import { useMasterData } from '@/contexts/MasterDataContext';

interface DynamicDropdownProps {
  entityType: 'merchants' | 'riders' | 'drivers' | 'helpers' | 'fleets' | 'townships';
  value: string;
  onChange: (value: string, meta: any) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function DynamicDropdown({ 
  entityType, value, onChange, placeholder, disabled, className = "" 
}: DynamicDropdownProps) {
  
  const masterData = useMasterData();
  const options = masterData[entityType] || [];
  const loading = masterData.loading;

  const handleSelection = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = e.target.value;
    const selectedOption = options.find(o => o.value === selectedValue);
    // Pass both the value AND the embedded autofill metadata back up
    onChange(selectedValue, selectedOption?.meta || {});
  };

  return (
    <select
      value={value}
      onChange={handleSelection}
      disabled={disabled || loading}
      className={`
        w-full px-4 py-3 rounded-xl appearance-none cursor-pointer outline-none transition-all duration-200
        bg-white text-[#061524] border-2 border-[#1a3a5c] font-black text-[14px]
        placeholder:text-gray-400 placeholder:font-medium
        hover:border-[#4ea8de] focus:border-[#f6b84b] focus:ring-4 focus:ring-[#f6b84b]/20
        disabled:opacity-80 disabled:bg-gray-100 disabled:cursor-not-allowed
        ${className}
      `}
    >
      <option value="" className="text-gray-400 font-medium">
        {loading ? "LOADING SYSTEM DATA..." : (placeholder || `-- SELECT --`)}
      </option>
      
      {options.map((opt) => (
        <option 
          key={opt.value} 
          value={opt.value} 
          className="text-[#061524] font-black py-2"
        >
          {opt.value} - {opt.label}
        </option>
      ))}
    </select>
  );
}
