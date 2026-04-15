import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'

interface Props {
  label: string
  value: string | number
  sub?: string
  icon?: LucideIcon
  color?: 'green' | 'red' | 'blue' | 'yellow' | 'purple' | 'default'
  className?: string
}

const colorMap = {
  green:  'text-accent-green',
  red:    'text-accent-red',
  blue:   'text-accent-blue',
  yellow: 'text-accent-yellow',
  purple: 'text-accent-purple',
  default:'text-white',
}

export default function StatCard({ label, value, sub, icon: Icon, color = 'default', className }: Props) {
  return (
    <div className={clsx('card p-4 animate-fade-in', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="stat-label">{label}</p>
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