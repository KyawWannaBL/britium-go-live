const fs = require("fs");
const path = require("path");

const required = [
  "supabase/sql/96-mobile-workforce-workforce-code-trigger-hardfix.sql",
];

let ok = true;
for (const rel of required) {
  const p = path.join(process.cwd(), rel);
  if (!fs.existsSync(p)) {
    console.error(`Missing ${rel}`);
    ok = false;
  }
}

const sqlPath = path.join(process.cwd(), "supabase/sql/96-mobile-workforce-workforce-code-trigger-hardfix.sql");
if (fs.existsSync(sqlPath)) {
  const sql = fs.readFileSync(sqlPath, "utf8");
  for (const token of [
    "create or replace function public.be_fill_mobile_workforce_code",
    "trg_be_fill_mobile_workforce_code",
    "alter column workforce_code set not null",
    "notify pgrst, 'reload schema'"
  ]) {
    if (!sql.includes(token)) {
      console.error(`SQL missing token: ${token}`);
      ok = false;
    }
  }
}

if (!ok) process.exit(1);
console.log("Britium workforce_code trigger hardfix verified.");
