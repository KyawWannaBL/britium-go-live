#!/usr/bin/env python3
"""Fail-closed offline gate for Britium UAT historical migration source coverage.

Reads only local repository files. Does not connect to any database.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

CRITICAL = (
    "20260412000000_emergency_restore.sql",
    "20260721093501_remote_schema.sql",
)
DOMAINS = {
    "data_entry": ("be_data_entry_parcel_details", "be_waybill_ledger"),
    "warehouse": ("be_dispatch_scans_v39",),
    "wayplan": ("be_wayplan_dispatches", "be_wayplan_membership_v40"),
    "finance": ("be_accounting", "be_finance"),
}

def audit(migrations: Path) -> dict:
    if not migrations.is_dir():
        raise ValueError(f"Migration directory missing: {migrations}")
    result = {"ready": False, "migration_directory": str(migrations),
              "critical_files": [], "domain_evidence": {},
              "warnings": [], "recommended_action": ""}
    for filename in CRITICAL:
        path = migrations / filename
        text = path.read_text(encoding="utf-8", errors="replace") if path.is_file() else ""
        stripped = re.sub(r"--[^\n]*|/\*[\s\S]*?\*/", "", text).strip()
        creates = len(re.findall(r"\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|FUNCTION|TYPE|VIEW|SEQUENCE)\b", stripped, re.I))
        result["critical_files"].append({"name": filename, "exists": path.is_file(),
                                         "bytes": path.stat().st_size if path.is_file() else 0,
                                         "ddl_create_statements_approx": creates})
        if not stripped:
            result["warnings"].append(f"{filename}: empty or comments only")
        elif creates < 5:
            result["warnings"].append(f"{filename}: contains only {creates} recognized CREATE statements")
    combined = "\n".join(p.read_text(encoding="utf-8", errors="replace")
                         for p in migrations.glob("*.sql") if p.is_file())
    for domain, markers in DOMAINS.items():
        result["domain_evidence"][domain] = {
            marker: bool(re.search(r"\b" + re.escape(marker) + r"\b", combined, re.I))
            for marker in markers
        }
    result["warnings"].append(
        "Domain marker presence does not prove executable dependencies, migration order, data or permissions."
    )
    result["recommended_action"] = (
        "Do not replay migrations into hosted UAT. Reconstruct a verified baseline "
        "on a disposable Supabase-compatible PostgreSQL 17 environment, test replay, "
        "and preserve UAT Auth/registry/roster before approving cutover."
    )
    return result

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--migrations", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        result = audit(args.migrations)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    output = json.dumps(result, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output + "\n", encoding="utf-8")
    print(output)
    return 2  # fail-closed until isolated replay is proven, regardless of text checks

if __name__ == "__main__":
    sys.exit(main())
