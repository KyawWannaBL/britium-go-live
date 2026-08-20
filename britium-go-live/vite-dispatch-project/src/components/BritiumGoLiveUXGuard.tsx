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

const ROLE_TOKENS = [
  'SUPER ADMIN',
  'ADMIN',
  'SUPERVISOR',
  'FINANCE',
  'OPERATIONS',
  'CS AGENT',
  'WAREHOUSE',
  'MARKETING',
  'EXECUTIVE',
  'DATA ENTRY',
  'BRANCH MGR',
]

const MOCK_TOKENS = [
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

function isLoginRoute(): boolean {
  return (
    window.location.hash.includes('/login') ||
    window.location.pathname.includes('/login') ||
    window.location.hash === '#/' ||
    window.location.hash === ''
  )
}

function isUnsafeToHide(el: Element): boolean {
  const node = el as HTMLElement

  if (node === document.body) return true
  if (node.id === 'root') return true
  if (node.tagName.toLowerCase() === 'html') return true
  if (node.querySelector('input[type="email"], input[type="password"]')) return true
  if (textOf(node).includes('EMAIL') && textOf(node).includes('PASSWORD')) return true

  return false
}

function clearManualRoleOverrides(): void {
  for (const key of MANUAL_ROLE_KEYS) {
    try {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    } catch {
      // ignore storage access issues
    }
  }
}

function hideSmallestRoleSelector(): void {
  if (!isLoginRoute()) return

  const candidates = Array.from(
    document.querySelectorAll('section, form, aside, div')
  ).filter((el) => {
    const txt = textOf(el)
    const roleHits = ROLE_TOKENS.filter((token) => txt.includes(token)).length

    return (
      txt.includes('SELECT YOUR ROLE') &&
      roleHits >= 3 &&
      !isUnsafeToHide(el)
    )
  })

  candidates.sort((a, b) => textOf(a).length - textOf(b).length)

  const target = candidates[0] as HTMLElement | undefined

  if (target) {
    target.dataset.beHidden = 'login-role-selector'
    target.setAttribute('aria-hidden', 'true')
    target.style.display = 'none'
  }
}

function hideSmallestMockPanel(): void {
  const candidates = Array.from(
    document.querySelectorAll('section, article, aside, div, p, span')
  ).filter((el) => {
    const txt = textOf(el)
    return MOCK_TOKENS.some((token) => txt.includes(token)) && !isUnsafeToHide(el)
  })

  candidates.sort((a, b) => textOf(a).length - textOf(b).length)

  for (const el of candidates.slice(0, 12)) {
    const node = el as HTMLElement
    if (textOf(node).length > 900) continue

    node.dataset.beHidden = 'mock-demo-panel'
    node.setAttribute('aria-hidden', 'true')
    node.style.display = 'none'
  }
}

function applyCleanup(): void {
  document.body.classList.add('be-go-live-clean-screen')
  document.body.dataset.backendRoleOnly = 'true'

  clearManualRoleOverrides()
  hideSmallestRoleSelector()
  hideSmallestMockPanel()
}

export default function BritiumGoLiveUXGuard() {
  useEffect(() => {
    let queued = false

    const schedule = () => {
      if (queued) return
      queued = true

      requestAnimationFrame(() => {
        queued = false
        applyCleanup()
      })
    }

    applyCleanup()

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    window.addEventListener('hashchange', schedule)
    window.addEventListener('popstate', schedule)

    return () => {
      observer.disconnect()
      window.removeEventListener('hashchange', schedule)
      window.removeEventListener('popstate', schedule)
    }
  }, [])

  return null
}
