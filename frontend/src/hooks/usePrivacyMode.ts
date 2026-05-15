/**
 * usePrivacyMode — Operator privacy toggle
 *
 * Session XXXIV (carry-over #4): the per-page useState model meant that the
 * Privacy Mode toggle on Wallet was effectively non-functional from the
 * Operator's perspective:
 *   1. State reset to default (ON) on every navigation — toggling OFF and
 *      moving away forgot the choice immediately.
 *   2. WalletTransactions page had ZERO privacy treatment, so once the
 *      Operator clicked through to view Tx history all amounts/addresses
 *      were exposed regardless of toggle state.
 *
 * Fix:
 *   - Hoist privacy state into a tiny global hook backed by localStorage
 *     (storage event listener keeps multiple tabs in sync).
 *   - Default OFF so the page renders the real values for first-time
 *     viewers; Operator opts INTO privacy explicitly.  (Was default ON
 *     before, but with no persistence, every reload nuked the choice — so
 *     defaulting ON felt arbitrary.)
 *
 * Usage:
 *   const [privacy, setPrivacy] = usePrivacyMode()
 *   <PrivacyValue privacy={privacy} value={...} placeholder="τ ████" />
 */
import { useEffect, useState, useCallback } from 'react'

const STORAGE_KEY = 'taobot:wallet:privacy-mode:v1'

function readInitial(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
  } catch {
    /* SSR or storage blocked */
  }
  return false   // default OFF — Operator opts in
}

export function usePrivacyMode(): [boolean, (next: boolean | ((p: boolean) => boolean)) => void] {
  const [privacy, setPrivacyState] = useState<boolean>(readInitial)

  // Cross-tab + cross-component sync via the storage event.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return
      setPrivacyState(e.newValue === '1' || e.newValue === 'true')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Same-tab sync — broadcast a custom event so other components mounting
  // this hook in the same window see the change immediately (the storage
  // event does NOT fire in the tab that wrote the value).
  useEffect(() => {
    function onLocal(e: Event) {
      const ce = e as CustomEvent<boolean>
      if (typeof ce.detail === 'boolean') setPrivacyState(ce.detail)
    }
    window.addEventListener('taobot:privacy-mode', onLocal as EventListener)
    return () => window.removeEventListener('taobot:privacy-mode', onLocal as EventListener)
  }, [])

  const setPrivacy = useCallback((next: boolean | ((p: boolean) => boolean)) => {
    setPrivacyState(prev => {
      const value = typeof next === 'function' ? (next as (p: boolean) => boolean)(prev) : next
      try { localStorage.setItem(STORAGE_KEY, value ? '1' : '0') } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent('taobot:privacy-mode', { detail: value }))
      return value
    })
  }, [])

  return [privacy, setPrivacy]
}