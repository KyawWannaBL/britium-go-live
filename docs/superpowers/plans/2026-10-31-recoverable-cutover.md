# Recoverable November cutover

The owner authorizes isolation of all current operational and financial transactions, including genuine records, for 1 November 2026 00:00 Myanmar time. This is not a claim that those records are test-owned or that liabilities are settled.

Use an explicit reviewed transaction table list, preserve all other tables and auth users, snapshot transactions and wallet projections in a revoked private schema, and atomically clear only archived transaction tables without resetting sequences. Record row hashes, counts, schema, triggers, constraints and prior epoch. Reject schema drift and historical references outside the selected closure. Provide an administrator-only exact restore that refuses to overwrite new activity. Rehearse archive plus restore in a rolled-back transaction before activation.

Reuse retired-key guards, bind new transaction tables, update clients' data epoch and isolate transactional browser draft namespaces. Keep protected master and configuration fingerprints and sequence values identical. Do not claim phone/tablet or Finance acceptance without evidence. The UI must distinguish archived isolation from production readiness and show remaining acceptance gates.

Tasks: inspect live metadata and consumers; implement and test engine, restore and UI; review live rehearsal; activate only after verified recovery; publish source/client releases; report factual acceptance limitations.
