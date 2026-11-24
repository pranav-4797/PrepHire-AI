import { useSyncExternalStore } from 'react'

// Shared open/closed state for the portal sidebar (student, faculty, admin).
// The state is mirrored onto <html data-sidebar="open|closed"> so the CSS in
// index.css can animate the layout without every dashboard wiring up props.

const MOBILE_QUERY = '(max-width: 860px)'
const hasWindow = typeof window !== 'undefined'
const isMobile = () => hasWindow && window.matchMedia(MOBILE_QUERY).matches

// Desktop starts open, phones start closed (the sidebar is an overlay drawer there).
let open = hasWindow ? !isMobile() : true
const listeners = new Set<() => void>()

function apply() {
  if (hasWindow) document.documentElement.dataset.sidebar = open ? 'open' : 'closed'
  listeners.forEach((l) => l())
}

export function setSidebarOpen(next: boolean) {
  if (open === next) return
  open = next
  apply()
}

export function toggleSidebar() {
  setSidebarOpen(!open)
}

if (hasWindow) {
  apply()

  // Crossing the breakpoint resets to the sensible default for that size.
  window.matchMedia(MOBILE_QUERY).addEventListener('change', (e) => setSidebarOpen(!e.matches))

  // On phones, picking a tab or pressing Escape closes the drawer.
  document.addEventListener('click', (e) => {
    if (!isMobile() || !open) return
    const target = e.target as Element | null
    if (target?.closest('.portal-sidebar button')) setSidebarOpen(false)
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMobile() && open) setSidebarOpen(false)
  })
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useSidebar() {
  const isOpen = useSyncExternalStore(subscribe, () => open, () => true)
  return { open: isOpen, toggle: toggleSidebar, close: () => setSidebarOpen(false) }
}
