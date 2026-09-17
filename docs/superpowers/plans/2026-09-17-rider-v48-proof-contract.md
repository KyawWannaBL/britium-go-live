# Rider V48 Delivery Proof Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Rider App delivery confirmation satisfy the existing Production Wayplan proof contract so a completed proof can safely unlock Finish & guide next stop.

**Architecture:** Keep the existing Supabase Wayplan/RLS functions as the authority. Extend the Rider delivery modal to capture the fields already required by `be_rider_wayplan_action`: receiver identity, approved proof photo, customer electronic signature, payment method, optional electronic transaction reference, exact COD, and current GPS when available. For Wayplan delivery jobs call the Wayplan action RPC; retain the pickup-action path only for legacy/non-Wayplan jobs.

**Tech Stack:** React 18, TypeScript/TSX, Supabase RPC, react-signature-canvas, existing Rider photo compression/upload pipeline.

**Spec:** Current Production definitions of `be_rider_wayplan_action`, `be_rider_wayplan_action_primary_guard_legacy_v101`, and `be_rider_finish_current_stop_v1`.

## Global Constraints

- Do not weaken authenticated Rider/Driver/Helper role checks or Wayplan membership checks.
- Do not bypass exact COD validation.
- Do not mark a Wayplan stop delivered without proof photo and receiver signature.
- Keep existing compressed-photo approval/retry behavior.
- No database migration is required for this batch because the Production RPC and proof tables already support the required fields.

---

### Task 1: Contract regression test

**Files:**
- Create: `scripts/verify-rider-delivery-proof-v48.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `src/pages/RiderFieldPortalApp.tsx`
- Produces: build-time contract `verify:rider-delivery-proof-v48`

- [ ] Write a source contract that requires signature capture, payment method, transaction reference support, Wayplan RPC use, and Wayplan/delivery identifiers.
- [ ] Run in preview and verify RED against current Rider UI.
- [ ] Keep the contract in the normal Production build after GREEN.

### Task 2: Rider delivery proof UI and payload

**Files:**
- Modify: `src/pages/RiderFieldPortalApp.tsx`

**Interfaces:**
- Consumes: existing `selectedJob`, proof photo upload, `session`, `supabase`.
- Produces: payload accepted by `be_rider_wayplan_action`.

- [ ] Add customer signature canvas with clear/re-sign behavior.
- [ ] Add payment method selector: CASH, PREPAID, QR, BANK_TRANSFER, MOBILE_WALLET.
- [ ] Require transaction reference only for QR/BANK_TRANSFER/MOBILE_WALLET.
- [ ] Require exact COD amount when the job has COD.
- [ ] Capture browser GPS opportunistically; do not block proof if location permission is denied.
- [ ] For Wayplan jobs call `be_rider_wayplan_action` with `action=deliver`, `wayplan_id`, `delivery_way_id`, receiver fields, proof URL, signature payload/data URL, payment fields, COD and GPS.
- [ ] Keep legacy fallback for non-Wayplan delivery jobs.

### Task 3: Verify integration

**Files:**
- Test: `scripts/verify-rider-delivery-proof-v48.mjs`

- [ ] Run the V48 contract and full Vite build.
- [ ] Confirm V40/V41/Wayplan V43-V47 contracts remain green.
- [ ] Review the PR diff before merge.
- [ ] Deploy only the verified merge commit to Production and confirm domain aliases.
