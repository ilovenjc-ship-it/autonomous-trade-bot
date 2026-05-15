/**
 * PrivacyValue — shared privacy-aware value renderer.
 *
 * Session XXXIV (carry-over #4): hoisted from pages/Wallet.tsx so
 * WalletTransactions and any other future page can reuse the same blur +
 * placeholder treatment.  Couple this with `usePrivacyMode` for full
 * cross-page persistence.
 */
import clsx from 'clsx'

export function PrivacyValue({
  value,
  privacy,
  className = '',
  placeholder = '••••••',
}: {
  value: string
  privacy: boolean
  className?: string
  placeholder?: string
}) {
  return (
    <span
      className={clsx(
        'transition-all duration-200 select-none',
        className,
        // blur-md is heavier than blur-sm — when paired with the masked
        // placeholder it gives an unmistakable "censored" look so the
        // Operator can't accidentally read it over a shoulder.
        privacy && 'blur-[5px] pointer-events-none',
      )}
    >
      {privacy ? placeholder : value}
    </span>
  )
}

/** Mask an SS58 address: first 6 + bullets + last 4. */
export function maskAddr(addr: string): string {
  if (!addr || addr.length < 12) return '••••••••••••••••••'
  return `${addr.slice(0, 6)}${'•'.repeat(20)}${addr.slice(-4)}`
}