# Data Entry V20 — Clean user interface

This release removes the user-facing technical diagnostics highlighted below the pickup selector:

- Build identifier
- RPC function name
- Supabase project hostname
- Authentication state
- Pickup source and row count

The values remain available to developers through the component's `data-data-entry-build` attribute and browser console logs. V19 bulk-upload safety, photo review, full register form, pickup RPC V16, and the 15-column parcel sheet are retained.

## Installation

Extract every file from this ZIP directly beside `package.json` and `src/`, then run:

```bash
node install_data_entry_v20.mjs
rm -rf dist node_modules/.vite
npm run build
node verify_data_entry_v20.mjs
```

Deploy only after the final line says:

```text
SAFE TO DEPLOY V20
```

No SQL change is required.
