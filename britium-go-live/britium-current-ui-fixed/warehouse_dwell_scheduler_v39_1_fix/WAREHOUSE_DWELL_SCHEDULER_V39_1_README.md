# Warehouse Dwell Scheduler V39.1

## Why this patch is needed

The active Cron job is named:

`warehouse-dwell-alert-v39-hourly`

The original V39 diagnostic searched only for:

`be-v39-warehouse-dwell-alerts`

Therefore the alert job was running, while the diagnostic incorrectly returned `scheduled: false`.

## Fix

Run `warehouse_dwell_scheduler_name_fix_v39_1.sql` once in Supabase SQL Editor.

The corrected diagnostic recognizes:

- either supported job name; or
- any Cron command invoking `be_refresh_warehouse_dwell_alerts_v39()`.

It also avoids creating a duplicate job when an equivalent job already exists.

## Expected verification

```json
{
  "scheduler_available": true,
  "scheduled": true,
  "mode": "HOURLY_DATABASE_JOB",
  "jobs": [
    {
      "jobid": 1,
      "jobname": "warehouse-dwell-alert-v39-hourly",
      "schedule": "0 * * * *",
      "command": "select public.be_refresh_warehouse_dwell_alerts_v39();",
      "active": true
    }
  ]
}
```

No frontend rebuild is required.
