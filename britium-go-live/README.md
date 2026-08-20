# Britium Workflow Fix Pack

Generated from the uploaded current source files.

## Included fixes

- Supervisor Rider / Driver / Helper acceptance badges and live status display.
- Parcel photo review states: pending, approved, rejected, re-upload required.
- Data Entry rejection reasons and Rider/Warehouse re-upload loop.
- Partial Data Entry registration: approved parcel lines proceed while rejected/pending lines remain open.
- Full-photo validation frames use `object-fit: contain` so the image is never cropped.
- Warehouse replacement-photo upload after physical receiving.

## Apply

From Git Bash in the extracted pack directory:

```bash
bash apply_britium_workflow_fix.sh /d/britium-go-live/britium-go-live
```

The script backs up existing files, copies all fixed files, copies the SQL migration, and runs `npm run build`.

Run `supabase/migrations/20260720_team_photo_partial_workflow.sql` in Supabase SQL Editor before testing the new review/re-upload workflow.
