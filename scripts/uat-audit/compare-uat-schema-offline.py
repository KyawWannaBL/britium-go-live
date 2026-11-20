#!/usr/bin/env python3
"""Offline, read-only Supabase schema comparison. Never prints function bodies."""
import argparse
import csv
import hashlib
import json
import re
from pathlib import Path

IDENT = r'"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*'
PATTERNS = {
    'table': re.compile(r'^CREATE\s+(?:UNLOGGED\s+|FOREIGN\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?('+IDENT+r')\.('+IDENT+r')(?=\s|\(|$)', re.I | re.M),
    'view': re.compile(r'^CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+('+IDENT+r')\.('+IDENT+r')(?=\s|\(|$)', re.I | re.M),
    'sequence': re.compile(r'^CREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?('+IDENT+r')\.('+IDENT+r')(?=\s|\(|$)', re.I | re.M),
    'function': re.compile(r'^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+('+IDENT+r')\.('+IDENT+r')\s*\(', re.I | re.M),
    'type': re.compile(r'^CREATE\s+TYPE\s+('+IDENT+r')\.('+IDENT+r')(?=\s|\(|$)', re.I | re.M),
}

def normalize(name):
    return name[1:-1].replace('""', '"') if name.startswith('"') else name.lower()

def objects(path):
    data = path.read_text(encoding='utf-8', errors='replace')
    result = set()
    for kind, regex in PATTERNS.items():
        for match in regex.finditer(data):
            schema, name = map(normalize, match.groups())
            if schema in ('public', 'private'):
                result.add((kind, schema, name))
    return result

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--production-public', type=Path, required=True)
    p.add_argument('--production-private', type=Path, required=True)
    p.add_argument('--uat-schema', type=Path, required=True)
    p.add_argument('--output-dir', type=Path, required=True)
    a = p.parse_args()
    for path in (a.production_public, a.production_private, a.uat_schema):
        if not path.is_file() or path.stat().st_size == 0:
            p.error('Missing or empty input: ' + str(path))
    a.output_dir.mkdir(parents=True, exist_ok=True)
    source = objects(a.production_public) | objects(a.production_private)
    target = objects(a.uat_schema)
    missing = sorted(source - target)
    only = sorted(target - source)
    for filename, entries in (('objects_missing_in_uat.csv', missing), ('objects_only_in_uat.csv', only)):
        with (a.output_dir / filename).open('w', encoding='utf-8', newline='') as handle:
            writer = csv.writer(handle)
            writer.writerow(['object_kind', 'schema', 'object_name'])
            writer.writerows(entries)
    sums = {kind: {'production': sum(x[0] == kind for x in source), 'uat': sum(x[0] == kind for x in target), 'missing_in_uat': sum(x[0] == kind for x in missing), 'uat_only': sum(x[0] == kind for x in only)} for kind in PATTERNS}
    report = {
        'source': 'local schema exports (regex inventory; not a verified dependency or signature diff)',
        'counts': sums,
        'production_count': len(source),
        'uat_count': len(target),
        'missing_count': len(missing),
        'uat_only_count': len(only),
        'input_checksums_sha256': {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in (a.production_public, a.production_private, a.uat_schema)},
        'safe_to_apply_sql': False,
        'notes': [
            'Names and coarse kinds only: does not verify function signatures, schema equivalence, extensions, grants, policies, triggers, dependencies or source provenance.',
            'Never automatically apply these objects or original pg_dump files to hosted UAT.',
            'This utility does not connect to or modify a database.'
        ]
    }
    (a.output_dir / 'summary.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'production': len(source), 'uat': len(target), 'missing_in_uat': len(missing), 'uat_only': len(only), 'output': str(a.output_dir)}, indent=2))

if __name__ == '__main__':
    main()
