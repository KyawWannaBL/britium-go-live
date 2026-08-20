BRITIUM DATA ENTRY FINANCIAL V2
MERCHANT FINANCIAL PROFILE CONTROLLED IMPORT V58.1
Build date: 2026-07-31

APPROVAL
- Approval reference: MANAGEMENT-APPROVAL-2026-07-31
- Approved by: Kyaw Wanna (md@britiumexpress.com)
- Effective from: 2026-07-31
- Counterparty type: MERCHANT

APPROVED PROFILES
- BBW | Baby World       | STANDARD
- LOS | Lady OS          | STANDARD
- UQD | Unique/Diva      | STANDARD
- FFU | Food For U       | STANDARD
- MEL | Mee Lay          | ROYAL
- HMS | Hla Myittar Shin | STANDARD
- HAM | HAIM             | STANDARD
- MBO | MaBel OS         | STANDARD
- PRE | PREMIER          | STANDARD

RUN ORDER
1. Run 20260731_merchant_financial_profiles_v58_1_dry_run.sql.
2. Require ready_for_import = true.
3. Run 20260731_merchant_financial_profiles_v58_1_import.sql.
4. Run verify_merchant_financial_profiles_v58_1.sql.
5. Require all_gates_pass = true, exact_profile_matches = 9,
   backup_rows = 9, audit_rows = 9, missing_profiles = 0,
   and conflicting_profiles = 0.

SAFETY
- The import aborts if a merchant is missing, inactive, or name-mismatched in merchant master.
- The import aborts if STANDARD or ROYAL lacks an active production tariff.
- The import aborts rather than overwriting a conflicting existing profile.
- Re-running with identical data is idempotent.
- A pre-import state record is stored for all nine merchants.
- Audit events include the approval reference and approver.
- This package does not activate the six Financial V2 Data Entry RPCs.
- This package does not modify parcels, pickups, Way IDs, waybills, tariffs, or settlement rows.
- Do not run the rollback unless a rollback is explicitly approved.
