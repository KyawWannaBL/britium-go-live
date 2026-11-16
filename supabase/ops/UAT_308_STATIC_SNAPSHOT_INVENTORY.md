# Static snapshot inventory — Issue #308 (2026-11-16)

Input: user-supplied 3,884,715-byte historical SQL export, 106,405 physical lines.
Counting uses approximate case-insensitive lexical patterns, not a PostgreSQL parser;
counts are **not** proof of a valid replay or authoritative production parity.

| SQL pattern | Occurrences |
| --- | ---: |
| CREATE TABLE (regex matched) | 866 |
| CREATE TYPE (enum) | 21 |
| CREATE SEQUENCE | 38 |
| CREATE POLICY | 635 |
| CREATE VIEW | 84 |
| CREATE FUNCTION | 694 |
| SECURITY DEFINER | 485 |
| DROP EXTENSION | 1 |
| DROP TABLE / DROP TYPE | 0 |

The earlier catalog-based count was 868 CREATE TABLE statements, 867 parseable unique table names; lexical parsing of the uploaded export counted 866 due to formatting variation. Do not use regex counts to generate schema changes.

**Fail-closed requirements** before replay:
- Do not run the full export against existing UAT.
- Do not auto-grant PUBLIC or recreate SECURITY DEFINER functions without a manual privilege audit.
- Do not assume an empty historical migration is an acceptable placeholder.
- Do not create user Auth rows with direct SQL.
- Use disposable Postgres with Supabase extensions/Auth schemas, then validate dependencies, RLS and negative cross-branch tests.

The isolated UAT already received additive enum parity fixes on 2026-11-16. Its snapshot migration remains unrecorded and 632 of the 867 catalogue-defined snapshot table names were still absent as of the preceding verification.
