import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'

type MasterRecord = Record<string, unknown>

type WorkforceAccount = {
  workforce_code: string
  workforce_type: string
  display_name: string
  phone_e164?: string
  branch_code?: string
  status?: string
  is_active?: boolean
  assigned_zone?: string
}

type DropdownSnapshot = {
  merchants: MasterRecord[]
  townships: MasterRecord[]
  tariffs: MasterRecord[]
  workforce: WorkforceAccount[]
  vehicles: MasterRecord[]
  serviceTypes: MasterRecord[]
  zones: MasterRecord[]
  generatedAt?: string
}

type DropdownOption = { label: string; value: string; raw?: MasterRecord | WorkforceAccount }

const EMPTY_DROPDOWN: DropdownSnapshot = {
  merchants: [],
  townships: [],
  tariffs: [],
  workforce: [],
  vehicles: [],
  serviceTypes: [],
  zones: [],
}

function clean(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim()
  return text || fallback
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function toArray(value: unknown): MasterRecord[] {
  return Array.isArray(value) ? value.filter((item): item is MasterRecord => item !== null && typeof item === 'object' && !Array.isArray(item)) : []
}

function option(label: string, value: string, raw: MasterRecord | WorkforceAccount): DropdownOption {
  return { label, value, raw }
}

export function readMasterDropdownSnapshot(): DropdownSnapshot {
  const stored = readJson<Partial<DropdownSnapshot>>('britium.master.dropdownSnapshot', {})
  const portal = readJson<Partial<DropdownSnapshot>>('britium.portal.dropdownSnapshot', {})
  const riderWorkforce = readJson<WorkforceAccount[]>('britium.riderApp.workforceAccounts', [])

  return {
    merchants: toArray(stored.merchants || portal.merchants || readJson('britium.portal.merchants', [])),
    townships: toArray(stored.townships || portal.townships || readJson('britium.portal.townships', [])),
    tariffs: toArray(stored.tariffs || portal.tariffs || readJson('britium.production.tariffMaster', [])),
    workforce: Array.isArray(stored.workforce) && stored.workforce.length ? stored.workforce : riderWorkforce,
    vehicles: toArray(stored.vehicles || readJson('britium.production.vehicleMaster', [])),
    serviceTypes: toArray(stored.serviceTypes || portal.serviceTypes || readJson('britium.portal.serviceTypes', [])),
    zones: toArray(stored.zones || readJson('britium.riderApp.zoneList', [])),
    generatedAt: clean(stored.generatedAt || portal.generatedAt),
  }
}

export function buildPortalDropdownOptions(snapshot: DropdownSnapshot) {
  const merchants = snapshot.merchants.map((row) => {
    const code = clean(row.merchant_code || row.merchant_id || row.code)
    const name = clean(row.merchant_name || row.name, code)
    return option(code ? `${code} - ${name}` : name, code || name, row)
  })

  const townships = snapshot.townships.map((row) => {
    const code = clean(row.township_code || row.code)
    const name = clean(row.township_name || row.township || row.name, code)
    return option(code ? `${name} (${code})` : name, code || name, row)
  })

  const serviceTypes = snapshot.serviceTypes.map((row) => {
    const value = clean(row.service_type || row.name_en || row.code)
    const label = clean(row.name_en || row.service_type || row.name_mm, value)
    return option(label, value, row)
  })

  const workforce = snapshot.workforce.map((row) => {
    const code = clean(row.workforce_code)
    const name = clean(row.display_name, code)
    const type = clean(row.workforce_type)
    return option(`${code} - ${name}${type ? ` (${type})` : ''}`, code, row)
  })

  return { merchants, townships, serviceTypes, workforce }
}

export function useMasterDropdownsWired(branchCode = 'YGN') {
  const [snapshot, setSnapshot] = useState<DropdownSnapshot>(() => readMasterDropdownSnapshot())
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await (supabase as any).rpc('be_master_dropdown_snapshot', { p_branch_code: branchCode })
      if (!error && data && typeof data === 'object') {
        const next = { ...EMPTY_DROPDOWN, ...(data as Partial<DropdownSnapshot>) }
        setSnapshot(next)
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('britium.master.dropdownSnapshot', JSON.stringify(next))
          window.localStorage.setItem('britium.portal.dropdownSnapshot', JSON.stringify(next))
          window.localStorage.setItem('britium.riderApp.workforceAccounts', JSON.stringify(next.workforce || []))
        }
        return
      }
      setSnapshot(readMasterDropdownSnapshot())
    } catch {
      setSnapshot(readMasterDropdownSnapshot())
    } finally {
      setLoading(false)
    }
  }, [branchCode])

  useEffect(() => {
    void refresh()
    const sync = () => setSnapshot(readMasterDropdownSnapshot())
    window.addEventListener('britium:master-data-synced', sync)
    window.addEventListener('britium:portal-masterdata-synced', sync)
    window.addEventListener('britium:rider-app-masterdata-synced', sync)
    return () => {
      window.removeEventListener('britium:master-data-synced', sync)
      window.removeEventListener('britium:portal-masterdata-synced', sync)
      window.removeEventListener('britium:rider-app-masterdata-synced', sync)
    }
  }, [refresh])

  const options = buildPortalDropdownOptions(snapshot)

  return {
    ...snapshot,
    ...options,
    loading,
    refresh,
  }
}
