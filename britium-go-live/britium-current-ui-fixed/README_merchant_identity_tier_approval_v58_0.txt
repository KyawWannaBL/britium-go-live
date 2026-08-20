BRITIUM DATA ENTRY FINANCIAL V2
MERCHANT IDENTITY + TIER APPROVAL V58.0
Date: 2026-07-31

STATUS
- Read-only approval preparation package.
- Does not create or update merchant financial profiles.
- Does not activate the six Financial V2 RPCs.
- Does not infer STANDARD from standard_allowance_kg.

WHY THIS IS REQUIRED
The merchant master contains no authoritative STANDARD / ROYAL / COMMITMENT field.
The current merchant financial profile table is empty.
Live parcel merchant_id values are not consistently the same identifier as merchant-master codes.
Both canonical profile identity and customer tier therefore require business approval.

RUN
1. Run 20260731_merchant_identity_tier_approval_export_v58_0.sql in Supabase SQL Editor.
2. Export the first result set as CSV.
3. Paste/import it into the Approval Register sheet of merchant_identity_tier_approval_template_v58_0.xlsx.
4. Complete only the blue input columns:
   - Canonical Profile Merchant ID
   - Approved Customer Tier
   - Effective From / Effective To
   - Counterparty Type
   - Approval Reference
   - Approved By
   - Review Notes
5. Every row intended for activation must show READY in the workbook Row Status column.
6. Return the approved workbook or approved CSV. A deterministic, idempotent seed migration will then be generated.

APPROVAL RULES
- Approved Customer Tier must be exactly STANDARD, ROYAL, or COMMITMENT.
- Canonical Profile Merchant ID must be the exact identifier used by Financial V2 lookups.
- Do not guess identity mappings from similar names.
- Do not classify all merchants as STANDARD.
- Test/demo merchants must be explicitly excluded or identified as non-production.
- Approval Reference and Approved By are mandatory.

NEXT PRODUCTION STEP
After the approved register is supplied:
- create deterministic merchant profile seed migration;
- verify no duplicate canonical merchant IDs;
- verify every approved profile resolves exactly one active tariff per township/tier;
- keep save/import disabled until the profile seed passes verification.
