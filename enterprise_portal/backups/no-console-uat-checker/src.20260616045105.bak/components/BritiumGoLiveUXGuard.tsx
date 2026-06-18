import { useEffect } from 'react'

const MANUAL_ROLE_KEYS = [
  'selectedRole',
  'loginRole',
  'uatRole',
  'uat_selected_role',
  'be_selected_role',
  'roleOverride',
  'demoRole',
  'mockRole',
  'manualRole',
  'selected_login_role',
]

const LOGIN_ROLE_TOKENS = [
  'SELECT YOUR ROLE',
  'SUPER ADMIN',
  'FULL ACCESS',
  'CS AGENT',
  'BRANCH MGR',
  'WAREHOUSE',
  'MARKETING',
  'EXECUTIVE',
  'DATA ENTRY',
]

const MOCK_DEMO_TOKENS = [
  'LOGIN BYPASSED FOR UAT SMOKE TESTING',
  'MOCK / DEMO RUNTIME DATA',
  'MOCK WAREHOUSE RECORD',
  'MOCK RECORD',
  'DEMO RUNTIME DATA',
  'SAMPLE RUNTIME DATA',
]

function textOf(el: Element): string {
  return (el.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase()
}

function markRoleSelectorHidden(): void {
  const isLogin =
    window.location.hash.includes('/login') ||
    window.location.pathname.includes('/login') ||
    window.location.hash === '#/' ||
    window.location.hash === ''

  if (!isLogin) return

  const candidates = Array.from(document.querySelectorAll('section, form, div'))

  for (const el of candidates) {
    const txt = textOf(el)
    const hasRoleHeader = txt.includes('SELECT YOUR ROLE')
    const hasManyRoleLabels =
      LOGIN_ROLE_TOKENS.filter((token) => txt.includes(token)).length >= 4

    if (hasRoleHeader && hasManyRoleLabels) {
      ;(el as HTMLElement).dataset.beHidden = 'login-role-selector'
      ;(el as HTMLElement).setAttribute('aria-hidden', 'true')
      break
    }
  }

  for (const el of Array.from(document.querySelectorAll('button, [role="button"], div'))) {
    const txt = textOf(el)
    const isRoleButton =
      txt === 'SUPER ADMIN' ||
      txt === 'ADMIN' ||
      txt === 'SUPERVISOR' ||
      txt === 'FINANCE' ||
      txt === 'OPERATIONS' ||
      txt === 'CS AGENT' ||
      txt === 'WAREHOUSE' ||
      txt === 'MARKETING' ||
      txt === 'EXECUTIVE' ||
      txt === 'DATA ENTRY' ||
      txt === 'BRANCH MGR'

    if (isRoleButton) {
      ;(el as HTMLElement).dataset.beHidden = 'login-role-selector'
      ;(el as HTMLElement).setAttribute('aria-hidden', 'true')
    }
  }
}

function markMockDemoHidden(): void {
  const candidates = Array.from(document.querySelectorAll('section, article, aside, div, p, span'))

  for (const el of candidates) {
    const txt = textOf(el)

    if (MOCK_DEMO_TOKENS.some((token) => txt.includes(token))) {
      const target =
        el.closest('section') ||
        el.closest('article') ||
        el.closest('[class*="card"]') ||
        el

      ;(target as HTMLElement).dataset.beHidden =
        txt.includes('LOGIN BYPASSED') ? 'uat-bypass-note' : 'mock-demo-panel'
      ;(target as HTMLElement).setAttribute('aria-hidden', 'true')
    }
  }
}

function clearManualRoleOverrides(): void {
  for (const key of MANUAL_ROLE_KEYS) {
    try {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    } catch {
      // ignore storage access errors
    }
  }
}

function applyBodyState(): void {
  document.body.classList.add('be-go-live-clean-screen')
  document.body.dataset.backendRoleOnly = 'true'
}

export default function BritiumGoLiveUXGuard() {
  useEffect(() => {
    let timer: number | undefined

    const run = () => {
      applyBodyState()
      clearManualRoleOverrides()
      markRoleSelectorHidden()
      markMockDemoHidden()
    }

    run()
    timer = window.setInterval(run, 700)

    window.addEventListener('hashchange', run)
    window.addEventListener('popstate', run)

    return () => {
      if (timer !== undefined) window.clearInterval(timer)
      window.removeEventListener('hashchange', run)
      window.removeEventListener('popstate', run)
    }
  }, [])

  return null
}
