import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { InfoBubble } from '@/components/Tooltip'

interface Props {
  label: string
  value: string | number
  sub?: string
  icon?: LucideIcon
  color?: 'green' | 'red' | 'blue' | 'yellow' | 'purple' | 'default'
  className?: string
  /**
   * Day 12 (Session XLII): optional InfoBubble tooltip rendered next to the
   * label. Mark's spec for Manual Trades / Risk Configuration / Subnet
   * Analytics: every KPI card carries an "(i)" so the operator can see what
   * the metric means without leaving the page.
   */
  info?: ReactNode
}

const colorMap = {
  green:  'text-accent-green',
  red:    'text-accent-red',
  blue:   'text-accent-blue',
  yellow: 'text-accent-yellow',
  purple: 'text-accent-purple',
  default:'text-white',
}

export default function StatCard({ label, value, sub, icon: Icon, color = 'default', className, info }: Props) {
  return (
    <div className={clsx('card p-4 animate-fade-in', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="stat-label">{label}</p>
            {info && <InfoBubble content={info} side="right" maxWidth={300} />}
          </div>
          <p className={clsx('stat-value', colorMap[color])}>{value}</p>
          {sub && <p className="text-xs text-slate-300">{sub}</p>}
        </div>
        {Icon && (
          <div className={clsx('p-2 rounded-lg bg-dark-700', colorMap[color])}>
            <Icon size={16} />
          </div>
        )}
      </div>
    </div>
  )
}