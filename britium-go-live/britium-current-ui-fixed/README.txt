Britium Portal V5.2 Source Collector

Run in Git Bash:

  cd /e/D27072026/britium-go-live/britium-go-live/britium-current-ui-fixed
  bash collect_portal_v5_2_source.sh .

Upload the generated:
  portal_v5_2_source_YYYYMMDD_HHMMSS.tgz
  portal_v5_2_source_YYYYMMDD_HHMMSS.tgz.sha256

The collector excludes .env files, node_modules, dist, .git, .vercel, backups,
and archive files. It captures current source/config/migrations plus a focused
inventory of Data Entry, Financial V2, direct-write, RPC, UAT, and environment
references.
