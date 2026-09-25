import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const contracts = [
  "tests/sql/enterprise_accounting_sync_infrastructure_v1.sql",
  "tests/sql/enterprise_delivery_accounting_adapter_v1.sql",
  "tests/sql/enterprise_cod_accounting_adapter_v1.sql",
  "tests/sql/enterprise_merchant_settlement_adapter_v1.sql",
  "tests/sql/enterprise_internal_accounting_adapters_v1.sql",
  "tests/sql/enterprise_accounting_sync_orchestration_v1.sql",
];

for (const file of contracts) {
  if (!existsSync(file)) {
    console.error(`Missing accounting sync contract: ${file}`);
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
    "Refusing to run accounting mutation contracts against production."
  );
  process.exit(3);
}

for (const file of contracts) {
  console.log(`[accounting-sync] running ${file}`);
  const result = spawnSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", file],
    { stdio: "inherit" }
  );

  if (result.error) {
    console.error(`Unable to execute psql for ${file}: ${result.error.message}`);
    process.exit(4);
  }
  if (result.status !== 0) {
    console.error(`Accounting sync contract failed: ${file}`);
    process.exit(result.status ?? 5);
  }
}

const invariantSql = `
do $$
declare
  v_duplicates integer;
  v_unbalanced integer;
  v_held_postable integer;
  v_cod_remit_revenue integer;
begin
  select count(*) into v_duplicates
  from (
    select source_system,source_table,source_record_id,event_type,accounting_version
    from public.be_accounting_source_links
    group by 1,2,3,4,5
    having count(*)>1
  ) d;

  select count(*) into v_unbalanced
  from (
    select event_id,
      coalesce(sum(debit_amount),0) debit_total,
      coalesce(sum(credit_amount),0) credit_total
    from public.be_accounting_event_lines
    group by event_id
  ) x
  where debit_total<>credit_total;

  select count(*) into v_held_postable
  from public.be_accounting_events
  where review_status='HELD' and posted_journal_id is not null;

  select count(*) into v_cod_remit_revenue
  from public.be_accounting_events e
  join public.be_accounting_event_lines l on l.event_id=e.id
  join public.be_chart_of_accounts a on a.id=l.account_id
  where e.event_type='RIDER_COD_REMITTED'
    and a.account_type='REVENUE';

  if v_duplicates<>0 then raise exception 'duplicate accounting sources: %',v_duplicates; end if;
  if v_unbalanced<>0 then raise exception 'unbalanced accounting event proposals: %',v_unbalanced; end if;
  if v_held_postable<>0 then raise exception 'held events posted: %',v_held_postable; end if;
  if v_cod_remit_revenue<>0 then raise exception 'COD remittance revenue lines: %',v_cod_remit_revenue; end if;
end $$;
`;

const invariant = spawnSync(
  "psql",
  [databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", invariantSql],
  { stdio: "inherit" }
);

if (invariant.error || invariant.status !== 0) {
  console.error("[accounting-sync] invariant verification failed");
  process.exit(invariant.status ?? 6);
}

console.log(
  `[accounting-sync] PASS: ${contracts.length}/${contracts.length} contracts + invariants`
);
