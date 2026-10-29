# Mandalay branch readiness

User authorization: proceed finishing Mandalay, retaining Superadmin intervention equal to Yangon. Existing Britium portal/Supabase is the selected architecture; no parallel operational database. Branch manager Aye Pwint Phyu, MDY-BM-001, branch_mgr_mdy@britiumventures.com. Early November 2026 joint DK operation; later takeover date remains unset.

Implement branch-scoped wayplan creation/review/dispatch with existing eligibility, crew, proof, scan and financial gates. MDY manager must not read or mutate YGN wayplans. Superadmin can intervene in either branch with existing audits. Fix branch dashboard default and server scope. Do not broaden finance approval or user administration permissions.

Add shared parcel transfer manifests MDY↔YGN with source dispatch, destination acknowledgement, immutable original Way IDs, partial receipt and exception recording. Do not treat transfer as delivery or create duplicate merchant liabilities. Transfer tracking must disclose whether destination warehouse readiness is still required.

Add branch administrative/financial submissions (setup, expense, asset, contract, daily cash close) with references, evidence and HQ review; approval is document review, not payment, verified COD, GL posting or automatic settlement. Keep COD/merchant accounting in existing Finance. No invented budgets, opening cash, bank details, exact opening date, takeover date or franchise terms.

Approaches: reuse existing portal and authoritative tables (chosen); separate tracker rejected because custody and reconciliation would diverge. New transfer items use canonical Way IDs because legacy transfer items are pickup-level. Preserve legacy records.

Verification: database tests for anonymous denial, inactive accounts, MDY/YGN boundaries, Superadmin access, concurrent duplicate transfer prevention, destination-only receipt, no self finance approval and immutable records. UI tests for role reachability and branch selection. Existing regression suite and production build. Production readiness is not claimed without deployment and authenticated end-to-end evidence.
