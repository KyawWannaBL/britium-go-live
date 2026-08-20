import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  Link2,
  MonitorCheck,
  RefreshCw,
  Save,
  Search,
  Smartphone,
  UploadCloud,
} from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'

const C = {
  bg: '#061524',
  panel: '#0b2236',
  panel2: '#081b2e',
  panelHover: '#0f2a42',
  border: '#1a3a5c',
  gold: '#f6b84b',
  orange: '#ff8a4c',
  text: '#eef8ff',
  text2: '#c8dff0',
  muted: '#4d7a9b',
  success: '#22c55e',
  error: '#ff4f86',
  warning: '#f59e0b',
  info: '#38bdf8',
}

const FF = { body: "'Poppins',Inter,system-ui,sans-serif", sub: "'Helvetica Neue',Helvetica,Arial,sans-serif" }

type EntityKey =
  | 'merchant'
  | 'township'
  | 'rider'
  | 'driver'
  | 'helper'
  | 'employee'
  | 'vehicle'
  | 'service_type'
  | 'weight_bracket'
  | 'zone'
  | 'cod_fee_rule'
  | 'surcharge_rule'
  | 'cargo_dropoff_rate'

type MasterRecord = Record<string, unknown>
type MasterSnapshot = Record<string, MasterRecord[] | string | number | undefined>

type SupabaseResult<T> = { data: T | null; error: { message?: string } | null; count?: number | null }
type SupabaseRpc = (name: string, args?: Record<string, unknown>) => Promise<SupabaseResult<unknown>>
type SupabaseQuery = {
  select: (columns?: string, options?: Record<string, unknown>) => SupabaseQuery
  order: (column: string, options?: Record<string, unknown>) => SupabaseQuery
  limit: (count: number) => Promise<SupabaseResult<MasterRecord[]>>
}
type SupabaseLike = {
  rpc?: SupabaseRpc
  from: (table: string) => SupabaseQuery
}

type EntityConfig = {
  key: EntityKey
  label: string
  canonicalKey: string
  backendTable: string
  snapshotKeys: string[]
  localKeys: string[]
  idFields: string[]
  fields: string[]
  portalRole: 'portal' | 'rider_app' | 'both'
}

type WorkforceAccount = {
  workforce_code: string
  workforce_type: 'rider' | 'driver' | 'helper' | 'staff'
  display_name: string
  phone_e164: string
  branch_code: string
  status: string
  is_active: boolean
  assigned_zone: string
  source_entity: string
  raw: MasterRecord
}

type DropdownSnapshot = {
  merchants: MasterRecord[]
  townships: MasterRecord[]
  tariffs: MasterRecord[]
  workforce: WorkforceAccount[]
  vehicles: MasterRecord[]
  serviceTypes: MasterRecord[]
  zones: MasterRecord[]
  generatedAt: string
}

const ENTITIES: EntityConfig[] = [
  {
    key: 'merchant',
    label: 'Merchant Master',
    canonicalKey: 'merchants',
    backendTable: 'merchant_masters',
    snapshotKeys: ['merchants', 'merchant', 'merchant_master', 'merchant_masters'],
    localKeys: ['britium.production.merchantMaster', 'britium.portal.merchants'],
    idFields: ['merchant_code', 'merchant_id', 'merchant_name'],
    fields: ['merchant_code', 'merchant_name', 'business_type', 'contact_person', 'phone_primary', 'email', 'address_line_1', 'township', 'city', 'customer_tier', 'status'],
    portalRole: 'portal',
  },
  {
    key: 'township',
    label: 'Township / Tariff',
    canonicalKey: 'townships',
    backendTable: 'township_tariffs',
    snapshotKeys: ['townships', 'tariffs', 'township', 'township_master', 'township_tariffs'],
    localKeys: ['britium.production.townshipMaster', 'britium.production.tariffMaster', 'britium.portal.townships'],
    idFields: ['township_code', 'township_name', 'township'],
    fields: ['township_code', 'township_name', 'township_mm', 'city', 'region', 'zone_label', 'delivery_fee', 'is_active', 'notes'],
    portalRole: 'both',
  },
  {
    key: 'rider',
    label: 'Rider Master',
    canonicalKey: 'riders',
    backendTable: 'rider_masters',
    snapshotKeys: ['riders', 'rider', 'rider_master', 'rider_masters'],
    localKeys: ['britium.production.riderMaster', 'britium.riderApp.riders'],
    idFields: ['rider_id', 'rider_code', 'rider_name', 'name'],
    fields: ['rider_id', 'rider_name', 'name', 'phone_primary', 'phone', 'assigned_zone', 'branch_code', 'employment_type', 'status'],
    portalRole: 'rider_app',
  },
  {
    key: 'driver',
    label: 'Driver Master',
    canonicalKey: 'drivers',
    backendTable: 'driver_masters',
    snapshotKeys: ['drivers', 'driver', 'driver_master', 'driver_masters'],
    localKeys: ['britium.production.driverMaster', 'britium.riderApp.drivers'],
    idFields: ['driver_id', 'driver_code', 'driver_name', 'name'],
    fields: ['driver_id', 'driver_name', 'name', 'phone_primary', 'phone', 'license_no', 'assigned_fleet_id', 'branch_code', 'status'],
    portalRole: 'rider_app',
  },
  {
    key: 'helper',
    label: 'Helper Master',
    canonicalKey: 'helpers',
    backendTable: 'helper_masters',
    snapshotKeys: ['helpers', 'helper', 'helper_master', 'helper_masters'],
    localKeys: ['britium.production.helperMaster', 'britium.riderApp.helpers'],
    idFields: ['helper_id', 'helper_code', 'helper_name', 'name'],
    fields: ['helper_id', 'helper_name', 'name', 'phone_primary', 'phone', 'assigned_zone', 'branch_code', 'employment_type', 'status'],
    portalRole: 'rider_app',
  },
  {
    key: 'employee',
    label: 'Employee Master',
    canonicalKey: 'staff',
    backendTable: 'employee_masters',
    snapshotKeys: ['staff', 'employees', 'employee', 'employee_master', 'employee_masters'],
    localKeys: ['britium.production.staffMaster'],
    idFields: ['employee_id', 'employee_name', 'email'],
    fields: ['employee_id', 'employee_name', 'role_id', 'department', 'phone_primary', 'email', 'supervisor_employee_id', 'status'],
    portalRole: 'portal',
  },
  {
    key: 'vehicle',
    label: 'Vehicle / Fleet',
    canonicalKey: 'vehicles',
    backendTable: 'fleet_vehicles',
    snapshotKeys: ['vehicles', 'fleet', 'fleets', 'vehicle', 'vehicle_master', 'fleet_vehicles'],
    localKeys: ['britium.production.vehicleMaster', 'britium.production.fleetMaster', 'britium.riderApp.vehicles'],
    idFields: ['fleet_id', 'vehicle_no', 'vehicle_code'],
    fields: ['fleet_id', 'vehicle_no', 'vehicle_type', 'capacity_kg', 'capacity_cbm', 'assigned_driver_id', 'ownership_type', 'status', 'zone_note'],
    portalRole: 'both',
  },
  {
    key: 'service_type',
    label: 'Service Type',
    canonicalKey: 'serviceTypes',
    backendTable: 'service_types',
    snapshotKeys: ['serviceTypes', 'service_types', 'service_type'],
    localKeys: ['britium.production.serviceTypes', 'britium.portal.serviceTypes'],
    idFields: ['service_type', 'name_en'],
    fields: ['service_type', 'name_en', 'name_mm', 'description', 'is_active'],
    portalRole: 'portal',
  },
  {
    key: 'weight_bracket',
    label: 'Weight Bracket',
    canonicalKey: 'weightBrackets',
    backendTable: 'weight_brackets',
    snapshotKeys: ['weightBrackets', 'weight_brackets', 'weight_bracket'],
    localKeys: ['britium.production.weightBrackets'],
    idFields: ['weight_bracket_code', 'weight_from_kg'],
    fields: ['weight_bracket_code', 'weight_from_kg', 'weight_to_kg', 'description'],
    portalRole: 'portal',
  },
  {
    key: 'zone',
    label: 'Zone Master',
    canonicalKey: 'zones',
    backendTable: 'zone_masters',
    snapshotKeys: ['zones', 'zone', 'zone_masters'],
    localKeys: ['britium.production.zoneMaster', 'britium.riderApp.zoneList'],
    idFields: ['state_region_code', 'zone_label_final', 'zone_label', 'state_region_name_en'],
    fields: ['state_region_code', 'state_region_name_en', 'state_region_name_mm', 'suggested_zone_group', 'zone_label_final', 'zone_label', 'notes'],
    portalRole: 'both',
  },
  {
    key: 'cod_fee_rule',
    label: 'COD Fee Rule',
    canonicalKey: 'codRules',
    backendTable: 'cod_fee_rules',
    snapshotKeys: ['codRules', 'cod_fee_rules', 'cod_fee_rule'],
    localKeys: ['britium.production.codFeeRules'],
    idFields: ['rule_code', 'version_code'],
    fields: ['rule_code', 'version_code', 'service_type', 'cod_amount_from_mmk', 'cod_amount_to_mmk', 'cod_fee_fixed_mmk', 'cod_fee_percent', 'is_active', 'notes'],
    portalRole: 'portal',
  },
  {
    key: 'surcharge_rule',
    label: 'Surcharge Rule',
    canonicalKey: 'surchargeRules',
    backendTable: 'surcharge_models',
    snapshotKeys: ['surchargeRules', 'surcharge_rules', 'surcharge_rule', 'surcharge_models'],
    localKeys: ['britium.production.surchargeRules'],
    idFields: ['surcharge_code', 'version_code', 'surcharge_type'],
    fields: ['surcharge_code', 'version_code', 'surcharge_type', 'state_region_code', 'township_code', 'zone_label', 'amount_mmk', 'percent', 'is_active', 'notes'],
    portalRole: 'portal',
  },
  {
    key: 'cargo_dropoff_rate',
    label: 'Cargo Drop-off Rate',
    canonicalKey: 'dropoffRates',
    backendTable: 'cargo_dropoff_rates',
    snapshotKeys: ['dropoffRates', 'cargo_dropoff_rates', 'cargo_dropoff_rate'],
    localKeys: ['britium.production.cargoDropoffRate'],
    idFields: ['dropoff_code', 'dropoff_name_en'],
    fields: ['dropoff_code', 'dropoff_name_en', 'location_type', 'base_fee_mmk', 'included_weight_kg', 'extra_per_started_kg_mmk', 'currency', 'notes'],
    portalRole: 'portal',
  },
]

const LOCAL_ALIAS_KEYS = [
  'britium.master.snapshot',
  'britium.master.dropdownSnapshot',
  'britium.portal.masterSnapshot',
  'britium.portal.dropdownSnapshot',
  'britium.portal.merchants',
  'britium.portal.townships',
  'britium.riderApp.masterSnapshot',
  'britium.riderApp.workforceAccounts',
  'britium.riderApp.riders',
  'britium.riderApp.drivers',
  'britium.riderApp.helpers',
  'britium.riderApp.zoneList',
  'britium.riderApp.tariffRules',
]

function clean(value: unknown, fallback = ''): string {
  const result = String(value ?? '').trim()
  return result || fallback
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readJson<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as unknown
    return parsed as T
  } catch {
    return fallback
  }
}

function readRows(key: string): MasterRecord[] {
  const parsed = readJson<unknown>(key, [])
  if (Array.isArray(parsed)) return parsed.filter((item): item is MasterRecord => item !== null && typeof item === 'object' && !Array.isArray(item))
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown[] }).rows)) {
    return ((parsed as { rows: unknown[] }).rows || []).filter((item): item is MasterRecord => item !== null && typeof item === 'object' && !Array.isArray(item))
  }
  return []
}

function writeJson(key: string, value: unknown): void {
  if (!isBrowser()) return
  window.localStorage.setItem(key, JSON.stringify(value ?? []))
}

function dispatchWireupEvent(name: string, detail: unknown): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

function getConfig(entityKey: EntityKey): EntityConfig {
  return ENTITIES.find((item) => item.key === entityKey) || ENTITIES[0]
}

function rowsFromSnapshot(snapshot: MasterSnapshot | Record<string, unknown>, config: EntityConfig): MasterRecord[] {
  for (const key of [config.canonicalKey, ...config.snapshotKeys]) {
    const rows = (snapshot as Record<string, unknown>)?.[key]
    if (Array.isArray(rows)) return rows.filter((item): item is MasterRecord => item !== null && typeof item === 'object' && !Array.isArray(item))
  }
  return []
}

function rowsFromLocal(config: EntityConfig): MasterRecord[] {
  for (const key of config.localKeys) {
    const rows = readRows(key)
    if (rows.length) return rows
  }
  return []
}

function meaningfulRows(rows: MasterRecord[], idFields: string[]): MasterRecord[] {
  return rows.filter((row) => idFields.some((field) => clean(row[field])))
}

function recordKey(row: MasterRecord, idFields: string[]): string {
  for (const field of idFields) {
    const value = clean(row[field])
    if (value) return `${field}:${value.toLowerCase()}`
  }
  return JSON.stringify(row).slice(0, 200)
}

function dedupeRows(rows: MasterRecord[], idFields: string[]): MasterRecord[] {
  const seen = new Set<string>()
  const result: MasterRecord[] = []
  for (const row of meaningfulRows(rows, idFields)) {
    const key = recordKey(row, idFields)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(row)
  }
  return result
}

function chooseRows(backendRows: MasterRecord[], localRows: MasterRecord[], idFields: string[]): MasterRecord[] {
  const backendClean = dedupeRows(backendRows, idFields)
  const localClean = dedupeRows(localRows, idFields)
  if (localClean.length >= backendClean.length && localClean.length > 0) return localClean
  return backendClean
}

export function rowsForEntity(snapshot: MasterSnapshot, entityKey: EntityKey): MasterRecord[] {
  return rowsFromSnapshot(snapshot, getConfig(entityKey))
}

export function normalizeWorkforceAccounts(snapshot: MasterSnapshot): WorkforceAccount[] {
  const sources: Array<{ key: EntityKey; type: WorkforceAccount['workforce_type']; codeFields: string[]; nameFields: string[] }> = [
    { key: 'rider', type: 'rider', codeFields: ['rider_id', 'rider_code', 'worker_code', 'workforce_code', 'code'], nameFields: ['rider_name', 'display_name', 'full_name', 'name'] },
    { key: 'driver', type: 'driver', codeFields: ['driver_id', 'driver_code', 'worker_code', 'workforce_code', 'code'], nameFields: ['driver_name', 'display_name', 'full_name', 'name'] },
    { key: 'helper', type: 'helper', codeFields: ['helper_id', 'helper_code', 'worker_code', 'workforce_code', 'code'], nameFields: ['helper_name', 'display_name', 'full_name', 'name'] },
    { key: 'employee', type: 'staff', codeFields: ['employee_id', 'staff_id', 'worker_code', 'workforce_code', 'code'], nameFields: ['employee_name', 'display_name', 'full_name', 'name'] },
  ]

  const result: WorkforceAccount[] = []
  const seen = new Set<string>()

  sources.forEach((source) => {
    const rows = rowsForEntity(snapshot, source.key)
    rows.forEach((row, index) => {
      const rawCode = source.codeFields.map((field) => clean(row[field])).find(Boolean) || `${source.type.toUpperCase()}-${String(index + 1).padStart(3, '0')}`
      const code = rawCode.toUpperCase()
      if (seen.has(code)) return
      seen.add(code)
      const displayName = source.nameFields.map((field) => clean(row[field])).find(Boolean) || code
      const phone = clean(row.phone_e164) || clean(row.phone_primary) || clean(row.phone_number) || clean(row.phone)
      const status = (clean(row.status, 'active') || 'active').toLowerCase()
      result.push({
        workforce_code: code,
        workforce_type: source.type,
        display_name: displayName,
        phone_e164: phone,
        branch_code: clean(row.branch_code, 'YGN'),
        status,
        is_active: !['inactive', 'disabled', 'terminated', 'offboarded'].includes(status),
        assigned_zone: clean(row.assigned_zone) || clean(row.zone) || clean(row.township),
        source_entity: source.key,
        raw: row,
      })
    })
  })

  return result
}

export function buildMergedMasterSnapshot(backendSnapshot: Record<string, unknown> = {}): MasterSnapshot {
  const localSnapshot = readJson<Record<string, unknown>>('britium.master.snapshot', {})
  const merged: MasterSnapshot = { ...localSnapshot, ...backendSnapshot, generatedAt: new Date().toISOString() }

  ENTITIES.forEach((config) => {
    const backendRows = rowsFromSnapshot(backendSnapshot, config)
    const localSnapshotRows = rowsFromSnapshot(localSnapshot, config)
    const localRows = localSnapshotRows.length ? localSnapshotRows : rowsFromLocal(config)
    merged[config.canonicalKey] = chooseRows(backendRows, localRows, config.idFields)
  })

  merged.tariffs = (merged.townships as MasterRecord[]) || []
  merged.fleet = (merged.vehicles as MasterRecord[]) || []
  merged.workforce = normalizeWorkforceAccounts(merged) as unknown as MasterRecord[]

  return merged
}

export function buildDropdownSnapshot(snapshot: MasterSnapshot): DropdownSnapshot {
  return {
    merchants: rowsForEntity(snapshot, 'merchant'),
    townships: rowsForEntity(snapshot, 'township'),
    tariffs: (snapshot.tariffs as MasterRecord[]) || rowsForEntity(snapshot, 'township'),
    workforce: normalizeWorkforceAccounts(snapshot),
    vehicles: rowsForEntity(snapshot, 'vehicle'),
    serviceTypes: rowsForEntity(snapshot, 'service_type'),
    zones: rowsForEntity(snapshot, 'zone'),
    generatedAt: new Date().toISOString(),
  }
}

export function persistMasterDataAliases(snapshot: MasterSnapshot): DropdownSnapshot {
  const dropdown = buildDropdownSnapshot(snapshot)
  const workforce = dropdown.workforce

  writeJson('britium.master.snapshot', snapshot)
  writeJson('britium.master.dropdownSnapshot', dropdown)

  writeJson('britium.production.merchantMaster', rowsForEntity(snapshot, 'merchant'))
  writeJson('britium.production.townshipMaster', rowsForEntity(snapshot, 'township'))
  writeJson('britium.production.tariffMaster', dropdown.tariffs)
  writeJson('britium.production.riderMaster', rowsForEntity(snapshot, 'rider'))
  writeJson('britium.production.driverMaster', rowsForEntity(snapshot, 'driver'))
  writeJson('britium.production.helperMaster', rowsForEntity(snapshot, 'helper'))
  writeJson('britium.production.staffMaster', rowsForEntity(snapshot, 'employee'))
  writeJson('britium.production.vehicleMaster', rowsForEntity(snapshot, 'vehicle'))
  writeJson('britium.production.fleetMaster', rowsForEntity(snapshot, 'vehicle'))
  writeJson('britium.production.serviceTypes', rowsForEntity(snapshot, 'service_type'))
  writeJson('britium.production.weightBrackets', rowsForEntity(snapshot, 'weight_bracket'))
  writeJson('britium.production.zoneMaster', rowsForEntity(snapshot, 'zone'))
  writeJson('britium.production.codFeeRules', rowsForEntity(snapshot, 'cod_fee_rule'))
  writeJson('britium.production.surchargeRules', rowsForEntity(snapshot, 'surcharge_rule'))
  writeJson('britium.production.cargoDropoffRate', rowsForEntity(snapshot, 'cargo_dropoff_rate'))

  writeJson('britium.portal.masterSnapshot', snapshot)
  writeJson('britium.portal.dropdownSnapshot', dropdown)
  writeJson('britium.portal.merchants', dropdown.merchants)
  writeJson('britium.portal.townships', dropdown.townships)
  writeJson('britium.portal.tariffs', dropdown.tariffs)
  writeJson('britium.portal.serviceTypes', dropdown.serviceTypes)

  writeJson('britium.riderApp.masterSnapshot', snapshot)
  writeJson('britium.riderApp.workforceAccounts', workforce)
  writeJson('britium.riderApp.riders', rowsForEntity(snapshot, 'rider'))
  writeJson('britium.riderApp.drivers', rowsForEntity(snapshot, 'driver'))
  writeJson('britium.riderApp.helpers', rowsForEntity(snapshot, 'helper'))
  writeJson('britium.riderApp.vehicles', rowsForEntity(snapshot, 'vehicle'))
  writeJson('britium.riderApp.zoneList', dropdown.zones)
  writeJson('britium.riderApp.tariffRules', dropdown.tariffs)

  dispatchWireupEvent('britium:master-data-synced', { snapshot, dropdown })
  dispatchWireupEvent('britium:portal-masterdata-synced', dropdown)
  dispatchWireupEvent('britium:rider-app-masterdata-synced', { workforce, dropdown })

  return dropdown
}

async function fetchBackendSnapshot(): Promise<Record<string, unknown>> {
  const client = supabase as unknown as SupabaseLike

  if (client.rpc) {
    try {
      const rpcResult = await client.rpc('be_masterdata_snapshot_v2')
      if (!rpcResult.error && rpcResult.data && typeof rpcResult.data === 'object') return rpcResult.data as Record<string, unknown>
    } catch {
      // fall through to direct table reads
    }
  }

  const result: Record<string, unknown> = {}
  await Promise.all(
    ENTITIES.map(async (config) => {
      try {
        const res = await client.from(config.backendTable).select('*').order('created_at', { ascending: false }).limit(5000)
        if (!res.error && Array.isArray(res.data)) result[config.canonicalKey] = res.data
      } catch {
        result[config.canonicalKey] = []
      }
    }),
  )
  return result
}

function entityCounts(snapshot: MasterSnapshot) {
  return ENTITIES.map((config) => ({ ...config, count: rowsForEntity(snapshot, config.key).length }))
}

function toCsv(rows: MasterRecord[], fields: string[]): string {
  const escape = (value: unknown) => {
    const text = String(value ?? '')
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [fields.join(','), ...rows.map((row) => fields.map((field) => escape(row[field])).join(','))].join('\n')
}

function downloadText(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  if (typeof document === 'undefined') return
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function parseCsv(textValue: string): MasterRecord[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < textValue.length; i += 1) {
    const char = textValue[i]
    const next = textValue[i + 1]
    if (char === '"' && quoted && next === '"') {
      cell += '"'
      i += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell.trim())
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1
      row.push(cell.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  if (rows.length < 2) return []

  const headers = rows[0].map((header) => header.trim().toLowerCase().replace(/\s+/g, '_'))
  return rows.slice(1).map((values) => {
    const record: MasterRecord = {}
    headers.forEach((header, index) => {
      record[header] = values[index] ?? ''
    })
    return record
  })
}

function inferEntityFromFilename(fileName: string, fallback: EntityKey): EntityKey {
  const lower = fileName.toLowerCase()
  const found = ENTITIES.find((entity) => lower.includes(entity.key) || lower.includes(entity.backendTable.replace(/_/g, '-')) || lower.includes(entity.backendTable))
  return found?.key || fallback
}

function localAnalysis(snapshot: MasterSnapshot): string {
  const dropdown = buildDropdownSnapshot(snapshot)
  const activeWorkers = dropdown.workforce.filter((worker) => worker.is_active).length
  const missing: string[] = []
  if (!dropdown.merchants.length) missing.push('merchant records')
  if (!dropdown.townships.length) missing.push('township/tariff records')
  if (!dropdown.workforce.length) missing.push('workforce records')
  if (!dropdown.serviceTypes.length) missing.push('service type records')

  if (missing.length) {
    return `Wire-up check needs attention: ${missing.join(', ')} are still empty. Portal dropdowns and rider assignment screens will load, but these modules need data before go-live. Active workforce available for rider app: ${activeWorkers}.`
  }

  return `Wire-up check passed for portal and rider app. Current snapshot has ${dropdown.merchants.length} merchants, ${dropdown.townships.length} township/tariff rows, ${dropdown.serviceTypes.length} service types, and ${activeWorkers} active workforce accounts. Local aliases and browser events are ready for portal dropdowns, rider assignment, dispatch, warehouse, settlement, and readiness checks.`
}

function badge(status: 'ok' | 'warn' | 'error' | 'info'): React.CSSProperties {
  const map = {
    ok: { bg: '#052e16', color: C.success, border: '#166534' },
    warn: { bg: '#451a03', color: C.warning, border: '#92400e' },
    error: { bg: '#4a0521', color: C.error, border: '#831843' },
    info: { bg: '#082f49', color: C.info, border: '#0c4a6e' },
  }
  const s = map[status]
  return { display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999, background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }
}

const inputStyle: React.CSSProperties = { height: 42, borderRadius: 12, border: `1px solid ${C.border}`, background: C.panel2, color: C.text, padding: '0 12px', outline: 'none', fontFamily: FF.body, fontSize: 13 }
const buttonStyle: React.CSSProperties = { height: 42, borderRadius: 12, border: `1px solid ${C.border}`, background: C.panel2, color: C.text2, padding: '0 14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', fontWeight: 800, fontFamily: FF.body, fontSize: 13 }
const primaryButtonStyle: React.CSSProperties = { ...buttonStyle, border: `1px solid ${C.gold}`, background: `linear-gradient(135deg, ${C.gold}, ${C.orange})`, color: '#082032' }

function KpiCard({ label, value, note, active, onClick }: { label: string; value: number; note: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ textAlign: 'left', borderRadius: 18, padding: 16, border: `1px solid ${active ? C.gold : C.border}`, background: active ? 'rgba(246,184,75,0.12)' : C.panel, cursor: 'pointer', minHeight: 104 }}>
      <div style={{ fontSize: 11, color: active ? C.gold : C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 900 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 26, color: active ? C.gold : C.text, fontWeight: 900 }}>{value.toLocaleString()}</div>
      <div style={{ marginTop: 4, fontSize: 12, color: C.text2 }}>{note}</div>
    </button>
  )
}

function WireCard({ icon: Icon, title, count, note, status }: { icon: React.ElementType; title: string; count: number; note: string; status: 'ok' | 'warn' | 'info' }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 18, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: `${C.info}16`, border: `1px solid ${C.info}33` }}>
            <Icon size={16} color={C.info} />
          </div>
          <div>
            <div style={{ color: C.text, fontWeight: 900 }}>{title}</div>
            <div style={{ color: C.text2, fontSize: 12, marginTop: 2 }}>{note}</div>
          </div>
        </div>
        <span style={badge(status)}>{count.toLocaleString()}</span>
      </div>
    </div>
  )
}

export default function MasterDataPortalWired() {
  const [entity, setEntity] = useState<EntityKey>('merchant')
  const [snapshot, setSnapshot] = useState<MasterSnapshot>(() => buildMergedMasterSnapshot({}))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('Master data is loading...')
  const [search, setSearch] = useState('')
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const config = getConfig(entity)
  const summary = useMemo(() => entityCounts(snapshot), [snapshot])
  const rows = rowsForEntity(snapshot, entity)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q))
  }, [rows, search])
  const dropdown = useMemo(() => buildDropdownSnapshot(snapshot), [snapshot])
  const activeWorkers = dropdown.workforce.filter((worker) => worker.is_active).length

  const refreshMasterData = useCallback(async (reason = 'manual refresh') => {
    setLoading(true)
    setMessage('Refreshing master data from backend, browser aliases, and workbook cache...')
    try {
      const backendSnapshot = await fetchBackendSnapshot()
      const merged = buildMergedMasterSnapshot(backendSnapshot)
      const syncedDropdown = persistMasterDataAliases(merged)
      setSnapshot(merged)
      setLastSync(new Date())
      const total = ENTITIES.reduce((sum, item) => sum + rowsForEntity(merged, item.key).length, 0)
      setMessage(`Master data synchronized (${reason}). ${total.toLocaleString()} total records loaded. Portal dropdowns: ${syncedDropdown.merchants.length} merchants / ${syncedDropdown.townships.length} townships. Rider app workforce: ${syncedDropdown.workforce.length}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Master data refresh failed.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshMasterData('initial load')

    const onMasterSync = () => void refreshMasterData('external sync')
    window.addEventListener('britium:master-data-workbook-imported', onMasterSync)
    window.addEventListener('britium:master-data-synced-request', onMasterSync)
    window.addEventListener('focus', onMasterSync)
    return () => {
      window.removeEventListener('britium:master-data-workbook-imported', onMasterSync)
      window.removeEventListener('britium:master-data-synced-request', onMasterSync)
      window.removeEventListener('focus', onMasterSync)
    }
  }, [refreshMasterData])

  async function handleFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const importEntity = inferEntityFromFilename(file.name, entity)
    const importConfig = getConfig(importEntity)
    setLoading(true)
    try {
      const content = await file.text()
      let importedRows: MasterRecord[] = []
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(content) as unknown
        importedRows = Array.isArray(parsed) ? parsed as MasterRecord[] : rowsFromSnapshot(parsed as Record<string, unknown>, importConfig)
      } else if (file.name.toLowerCase().endsWith('.csv')) {
        importedRows = parseCsv(content)
      } else {
        setMessage('XLS/XLSX browser parsing is not bundled in this fixed page. Export that workbook sheet to CSV, then import it here; existing workbook import panels can still dispatch britium:master-data-workbook-imported.')
        return
      }

      const next: MasterSnapshot = { ...snapshot, [importConfig.canonicalKey]: dedupeRows(importedRows, importConfig.idFields), generatedAt: new Date().toISOString() }
      if (importConfig.key === 'township') next.tariffs = next.townships as MasterRecord[]
      next.workforce = normalizeWorkforceAccounts(next) as unknown as MasterRecord[]
      persistMasterDataAliases(next)
      setSnapshot(next)
      setEntity(importEntity)
      setLastSync(new Date())
      setMessage(`Imported ${importedRows.length.toLocaleString()} row(s) into ${importConfig.label} from ${file.name}. Portal and rider aliases were refreshed.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'File import failed.')
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function wirePortalAndRiderApp() {
    setSaving(true)
    try {
      const syncedDropdown = persistMasterDataAliases(snapshot)
      const client = supabase as unknown as SupabaseLike
      if (client.rpc) {
        try {
          await client.rpc('be_sync_masterdata_workforce_accounts')
        } catch {
          // Local alias sync is still valid even if the optional RPC is not installed.
        }
      }
      setMessage(`Portal and rider app wire-up refreshed. ${LOCAL_ALIAS_KEYS.length} browser aliases updated. Workforce ready: ${syncedDropdown.workforce.length}; active: ${syncedDropdown.workforce.filter((worker) => worker.is_active).length}.`)
      setLastSync(new Date())
    } finally {
      setSaving(false)
    }
  }

  async function saveSnapshotToBackend() {
    setSaving(true)
    setMessage('Saving current master snapshot to backend and refreshing operational aliases...')
    try {
      persistMasterDataAliases(snapshot)
      const client = supabase as unknown as SupabaseLike
      const rpcNames = ['be_masterdata_save_snapshot', 'be_masterdata_ingest_snapshot_v2', 'be_sync_master_snapshot_to_backend']
      let committed = false
      if (client.rpc) {
        for (const rpcName of rpcNames) {
          try {
            const res = await client.rpc(rpcName, { p_snapshot: snapshot })
            if (!res.error) {
              committed = true
              break
            }
          } catch {
            // Try the next RPC name.
          }
        }
        try {
          await client.rpc('be_sync_masterdata_workforce_accounts')
        } catch {
          // Optional backend materialization RPC.
        }
      }
      await refreshMasterData(committed ? 'backend save' : 'local alias save')
      setMessage(committed ? 'Saved master snapshot to backend and rewired portal/rider app.' : 'Backend save RPC was not available. Browser aliases were still updated for the portal and rider app.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Snapshot save failed.')
    } finally {
      setSaving(false)
    }
  }

  function exportCurrentCsv() {
    downloadText(`${config.key}_master_export.csv`, toCsv(filtered, config.fields), 'text/csv;charset=utf-8')
  }

  return (
    <main style={{ minHeight: '100%', background: C.bg, color: C.text, padding: 24, fontFamily: FF.body }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        input:focus,select:focus{outline:none;border-color:${C.gold}!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important}
        tr:hover td{background:${C.panelHover}!important}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}
      `}</style>

      <div style={{ maxWidth: 1720, margin: '0 auto', display: 'grid', gap: 18 }}>
        <section style={{ background: `linear-gradient(135deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.border}`, borderRadius: 24, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ maxWidth: 980 }}>
              <div style={{ color: C.gold, fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Master Data Synchronization</div>
              <h1 style={{ margin: '8px 0 0', color: C.text, fontSize: 28, fontWeight: 900 }}>Master Data Control Center</h1>
              <p style={{ margin: '8px 0 0', color: C.text2, fontSize: 14, lineHeight: 1.6 }}>
                One synchronized source for merchant portals, customer/CS forms, dispatch, warehouse, workforce assignment, and the rider app. Backend rows, browser aliases, and uploaded CSV snapshots are merged, normalized, and broadcast to the whole portal.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" onClick={() => fileRef.current?.click()} style={buttonStyle}><UploadCloud size={16} /> Import CSV/JSON</button>
              <button type="button" onClick={() => void refreshMasterData('manual refresh')} disabled={loading} style={buttonStyle}><RefreshCw size={16} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} /> Refresh</button>
              <button type="button" onClick={() => void wirePortalAndRiderApp()} disabled={saving} style={buttonStyle}><Link2 size={16} /> Wire Portal + Rider</button>
              <button type="button" onClick={() => void saveSnapshotToBackend()} disabled={saving} style={primaryButtonStyle}>{saving ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />} Save Snapshot</button>
              <input ref={fileRef} type="file" accept=".csv,.json,.xlsx,.xls" onChange={handleFileImport} style={{ display: 'none' }} />
            </div>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
          <WireCard icon={MonitorCheck} title="Portal dropdowns" count={dropdown.merchants.length + dropdown.townships.length + dropdown.serviceTypes.length} note={`${dropdown.merchants.length} merchants, ${dropdown.townships.length} townships, ${dropdown.serviceTypes.length} services`} status={dropdown.merchants.length && dropdown.townships.length ? 'ok' : 'warn'} />
          <WireCard icon={Smartphone} title="Rider app workforce" count={dropdown.workforce.length} note={`${activeWorkers} active workforce accounts from rider/driver/helper/staff masters`} status={dropdown.workforce.length ? 'ok' : 'warn'} />
          <WireCard icon={Database} title="Backend snapshot" count={summary.reduce((sum, item) => sum + item.count, 0)} note={lastSync ? `Last synced ${lastSync.toLocaleString()}` : 'Waiting for sync'} status="info" />
        </section>

        <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 18, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {message.toLowerCase().includes('failed') || message.toLowerCase().includes('not available') ? <AlertTriangle size={18} color={C.warning} /> : <CheckCircle2 size={18} color={C.success} />}
          <div>
            <div style={{ color: C.text, fontWeight: 900 }}>Wire-up status</div>
            <div style={{ marginTop: 4, color: C.text2, fontSize: 13, lineHeight: 1.5 }}>{message}</div>
            <div style={{ marginTop: 8, color: C.muted, fontSize: 12 }}>{localAnalysis(snapshot)}</div>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
          {summary.map((item) => (
            <KpiCard key={item.key} label={item.label} value={item.count} note={item.portalRole === 'both' ? 'Portal + Rider' : item.portalRole === 'rider_app' ? 'Rider app' : 'Portal'} active={entity === item.key} onClick={() => { setEntity(item.key); setSearch('') }} />
          ))}
        </section>

        <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, overflow: 'hidden' }}>
          <div style={{ padding: 20, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, color: C.text, fontSize: 20, fontWeight: 900 }}>{config.label}</h2>
              <p style={{ margin: '5px 0 0', color: C.text2, fontSize: 13 }}>{filtered.length.toLocaleString()} row(s) displayed from synchronized master data.</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={15} color={C.muted} style={{ position: 'absolute', left: 12, top: 13 }} />
                <input value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder="Search current master data..." style={{ ...inputStyle, width: 320, paddingLeft: 36 }} />
              </div>
              <button type="button" onClick={exportCurrentCsv} style={buttonStyle}><Download size={16} /> CSV</button>
              <span style={badge(filtered.length ? 'ok' : 'warn')}>{filtered.length ? 'Synced' : 'No Rows'}</span>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: 1180, width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: C.panel2 }}>
                  {config.fields.map((field) => (
                    <th key={field} style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`, color: C.muted, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                      {field.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={config.fields.length} style={{ padding: 36, textAlign: 'center', color: C.muted }}>Loading synchronized master data...</td></tr>
                ) : filtered.length ? (
                  filtered.map((row, index) => (
                    <tr key={clean(row.id) || clean(row.record_key) || recordKey(row, config.idFields) || index}>
                      {config.fields.map((field) => (
                        <td key={field} style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}66`, color: field === config.idFields[0] ? C.gold : C.text2, fontSize: 13, maxWidth: 280, verticalAlign: 'top' }}>
                          {clean(row[field], '—')}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={config.fields.length} style={{ padding: 36, textAlign: 'center', color: C.muted }}>
                      No synchronized records found for {config.label}. Import CSV/JSON, refresh backend, or save a snapshot from workbook data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 18, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Link2 size={16} color={C.gold} />
            <h3 style={{ margin: 0, color: C.text, fontSize: 16, fontWeight: 900 }}>Alias keys updated by wire-up</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 8 }}>
            {LOCAL_ALIAS_KEYS.map((key) => (
              <code key={key} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 10px', color: C.text2, fontSize: 12 }}>{key}</code>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
