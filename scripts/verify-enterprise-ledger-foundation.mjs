import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const contracts = [
  "tests/sql/enterprise_financial_ledger_foundation_v1.sql",
  "tests/sql/enterprise_finance_source_documents_v1.sql",
  "tests/sql/enterprise_journal_posting_v1.sql",
  "tests/sql/enterprise_accounting_rls_v1.sql",
  "tests/sql/enterprise_accounting_controls_v1.sql",
];

for (const file of contracts) {
  if (!existsSync(file)) {
    console.error(`Missing accounting contract: ${file}`);
    process.exit(1);
  }
}

const databaseUrl =
  process.env.ACCOUNTING_TEST_DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  "";

if (!databaseUrl) {
  console.error(
    "ACCOUNTING_TEST_DATABASE_URL (or SUPABASE_DB_URL) is required. " +
    "Point it at an isolated Supabase development/staging database."
  );
  process.exit(2);
}

if (
  databaseUrl.includes("dltavabvjwocknkyvwgz") &&
  process.env.ALLOW_PRODUCTION_ACCOUNTING_TESTS !== "1"
) {
  console.error(
    "Refusing to run accounting mutation contracts against the production Supabase project."
  );
  process.exit(3);
}

for (const file of contracts) {
  console.log(`[accounting-foundation] running ${file}`);
  const result = spawnSync(
    "psql",
    ["-v", "ON_ERROR_STOP=1", "-f", file],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PGDATABASE: databaseUrl,
      },
    }
  );

  if (result.error) {
    console.error(
      `Unable to execute psql for ${file}: ${result.error.message}`
    );
    process.exit(4);
  }

  if (result.status !== 0) {
    console.error(
      `Accounting contract failed: ${file} (exit ${result.status})`
    );
    process.exit(result.status ?? 5);
  }
}

console.log(
  `[accounting-foundation] PASS: ${contracts.length}/${contracts.length} contracts`
);
