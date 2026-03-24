import { cn, formatCurrency, formatPercent, getPnlColor } from '@/lib/utils'
import type { ReactNode } from 'react'

interface StatCardProps {
  title: string
  value: string | number
  change?: number
  changePercent?: number
  icon?: ReactNode
  format?: 'currency' | 'percent' | 'number' | 'none'
}

export default function StatCard({
  title,
  value,
  change,
  changePercent,
  icon,
  format = 'none',
}: StatCardProps) {
  const formattedValue =
    format === 'currency'
      ? formatCurrency(value as number)
      : format === 'percent'
      ? formatPercent(value as number)
      : String(value)

  return (
    <div className="bg-surface-1 rounded-xl border border-surface-3 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-text-secondary">{title}</span>
        {icon && <div className="text-text-muted">{icon}</div>}
      </div>
      <div className="text-2xl font-bold text-text-primary mb-1">{formattedValue}</div>
      {(change !== undefined || changePercent !== undefined) && (
        <div className="flex items-center gap-2">
          {change !== undefined && (
            <span className={cn('text-sm font-medium', getPnlColor(change))}>
              {change >= 0 ? '+' : ''}
              {formatCurrency(change)}
            </span>
          )}
          {changePercent !== undefined && (
            <span className={cn('text-sm', getPnlColor(changePercent))}>
              ({formatPercent(changePercent)})
            </span>
          )}
        </div>
      )}
    </div>
  )
}
