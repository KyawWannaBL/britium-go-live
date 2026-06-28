# UAT / Go-Live Checklist

1. Apply the Supabase migration.
2. Open `/go-live-readiness` and run Readiness Check.
3. Run Clear Mock Runtime from the Go-Live Command Center.
4. Verify templates download:
   - Data Entry CSV/XLSX
   - Merchant/Customer CSV/XLSX
   - Warehouse CSV/XLSX
5. Upload a real Data Entry UAT CSV at `/data-entry/upload`.
6. Upload a real Merchant/Customer UAT CSV at `/merchant/upload` or `/customer/upload`.
7. Lookup and submit one warehouse scan at `/warehouse/scan`.
8. Confirm Dispatch counters stay zero until a real route is generated.
9. Confirm Branch Office safely loads MDY/NPT.
10. Confirm Finance/COD settlement records are separated from rider earnings.
11. Complete one full pickup lifecycle dry run end-to-end.
