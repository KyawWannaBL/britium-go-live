BRITIUM DATA ENTRY BILINGUAL + TOWNSHIP TARIFF REFERENCE V61.1
Production frontend patch - 2026-08-02

SCOPE
- Retains the user-reviewed Myanmar translations for the Financial V2 Data Entry page.
- Myanmar-first interface with English/Myanmar language toggle.
- Searchable English/Myanmar township list containing 356 attached-data records.
- Immediate attached-data fee/provider/status reference after a valid township selection.
- Automatic backend calculation request after township selection.
- Backend remains the final tariff, COD, validation, and settlement authority.
- No production financial write activation.

V61.1 CORRECTIONS
- Disambiguates duplicated Htantabin and Minhla names by township code and region.
- Requires selecting a township record from the dropdown; free text is not silently saved.
- Clears stale calculated tariff/settlement output when editable input changes.
- Ignores stale out-of-order calculation/save responses.
- Shows inactive Cocokyun but blocks it from active selection.
- Corrects the zero-fee warning: 0 never authorizes free delivery and must be interpreted with provider/status.
- Adds keyboard navigation and ARIA combobox/listbox attributes.
- Installer accepts reviewed LF or CRLF source revisions.

IMPORTANT DATA BEHAVIOUR
- Blank source delivery fee: displayed as not stated; no fee is invented.
- Source fee 0: displayed as a reference warning, not as free delivery.
- Inactive source location: visible for transparency but cannot be selected as active service.
- Attached fee is never written into base_tariff, net_system_delivery_charge, COD, or settlement fields.
- Final values continue to come from be_data_entry_financial_v2_calculate.

APPLY
  node ./data_entry_bilingual_township_v61_1_patch/apply_data_entry_bilingual_township_v61_1.mjs .

VERIFY SOURCE
  node ./data_entry_bilingual_township_v61_1_patch/verify_data_entry_bilingual_township_v61_1.mjs .

BUILD
  rm -rf dist node_modules/.vite
  npm run build

VERIFY DIST
  node ./data_entry_bilingual_township_v61_1_patch/verify_dist_data_entry_bilingual_township_v61_1.mjs .

BROWSER ACCEPTANCE
- Sign out and sign in again.
- Open https://www.britiumexpress.com/#/data-entry
- Myanmar is the default language.
- Search North Dagon or မြောက်ပိုင်း and select Dagon Myothit (North).
- Reference displays 4,000 MMK, Britium Express, active status, code MMR013019, and Yangon region.
- Search Htantabin or ထန်းတပင်; both Bago and Yangon options are separately identifiable.
- Search Minhla or မင်းလှ; both Bago and Magway options are separately identifiable.
- Search Cocokyun; it is marked inactive and cannot be selected.
- Editing a selected township clears the previous backend tariff/settlement output until a new option is selected and recalculated.
- Mutation gate remains Shadow / dry-run only.

ROLLBACK
Restore both installed files from:
  production_backups/data_entry_bilingual_township_v61_1_<timestamp>/
