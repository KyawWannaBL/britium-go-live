# Reporting V52.1 — Enterprise Portal Only

V52 belongs in the Enterprise Portal repository that owns `/reporting`. Do not run it in `Rider-App-main`.

The V52 backend is already installed when `be_reporting_certified_snapshot_v52(...)` returns the V52 build marker. An empty preview is normal until V50 has certified rows.

## Install in the Enterprise Portal repository

```bash
node install_reporting_v52_1.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_reporting_v52_1.mjs
```

Deploy only after:

```text
SAFE TO DEPLOY CERTIFIED OPERATIONAL REPORTING V52.1
```

The installer performs its repository check before copying files, so it will not modify a Rider App repository.
