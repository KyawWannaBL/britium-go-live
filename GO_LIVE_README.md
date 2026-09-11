# Britium Express Go-Live Bundle

This bundle was validated for build readiness in the packaged environment.

## Included
- Vite React source
- Supabase client wiring
- Portal pages for Admin HR, Finance, Marketing, Merchant, Warehouse, Customer Service, Branch Office, Customer, Rider, Supervisor, and Super Admin
- Vercel configuration
- Environment example

## Build
```bash
npm install
npm run build
```

## Deploy
```bash
npx vercel --prod
```

## Notes
- Set Vercel env vars from `.env.example`.
- Review API route availability before production cutover.
- Replace placeholder credentials and verify Supabase project secrets.


## 2026-04-22 Enhancement
- Rebuilt Data Entry Portal into an enterprise Pickup + Delivery workspace.
- Added separated pickup and delivery containers.
- Added automatic Pickup ID and Delivery ID preview generation.
- Added master-data assisted merchant and customer suggestions from recent operational records.
- Added predefined city and township selectors to reduce spelling inconsistencies.
- Added backend-aware pickup and delivery save actions with charge preview.
- Added CSV template download/upload for faster batch registration.
