import React from "react";

type Props = {
  label: string;
  allLabel: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
  filterKey: string;
};

const control: React.CSSProperties = {
  width: "100%",
  minHeight: 42,
  background: "#061524",
  color: "#eef8ff",
  border: "1px solid #1a3a5c",
  borderRadius: 12,
  padding: "10px 12px",
  cursor: "pointer",
  listStyle: "none",
  fontSize: 12,
  fontWeight: 700,
};

export default function MultiSelectQueueFilter({ label, allLabel, options, values, onChange, filterKey }: Props) {
  const selected = new Set(values);
  const summary = values.length === 0 ? allLabel : values.length === 1 ? values[0] : `${values.length} selected`;

  function toggle(value: string) {
    if (selected.has(value)) onChange(values.filter((item) => item !== value));
    else onChange([...values, value]);
  }

  return (
    <label style={{ color: "#9cc2d9", fontSize: 11 }}>
      {label}
      <details data-wayplan-multiselect-filter={filterKey} style={{ position: "relative" }}>
        <summary style={control}>{summary}</summary>
        <div
          style={{
            position: "absolute",
            zIndex: 80,
            top: "calc(100% + 4px)",
            left: 0,
            width: "100%",
            minWidth: 220,
            maxHeight: 280,
            overflowY: "auto",
            border: "1px solid #1a3a5c",
            borderRadius: 12,
            background: "#0b2236",
            boxShadow: "0 18px 38px rgba(0,0,0,0.35)",
            padding: 8,
          }}
        >
          <button
            type="button"
            onClick={() => onChange([])}
            style={{
              width: "100%",
              border: "1px solid #1a3a5c",
              borderRadius: 8,
              background: values.length === 0 ? "rgba(246,184,75,0.14)" : "#102b45",
              color: values.length === 0 ? "#f6b84b" : "#eef8ff",
              padding: "8px 10px",
              textAlign: "left",
              cursor: "pointer",
              fontWeight: 800,
              marginBottom: 6,
            }}
          >
            {allLabel}
          </button>
          {options.map((option) => (
            <label key={option} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 6px", color: "#eef8ff", cursor: "pointer" }}>
              <input type="checkbox" checked={selected.has(option)} onChange={() => toggle(option)} />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </details>
    </label>
  );
}
