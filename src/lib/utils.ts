import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number, symbol?: string): string {
  // Detect appropriate decimal places
  // JPY pairs (50-200 range): 3 decimals (150.342)
  // Forex pairs (< $10): 5 decimals (1.15342)
  // Metals/indices (> $200): 2 decimals ($4,522.50)
  const absVal = Math.abs(value)
  const isJpy = symbol ? symbol.toUpperCase().includes('JPY') : false
  let decimals = 2
  if (isJpy || (absVal >= 10 && absVal < 200)) {
    decimals = 3
  } else if (absVal > 0 && absVal < 10) {
    decimals = 5
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function getPnlColor(value: number): string {
  if (value > 0) return 'text-profit'
  if (value < 0) return 'text-loss'
  return 'text-text-secondary'
}

export function getPnlBgColor(value: number): string {
  if (value > 0) return 'bg-profit/10 text-profit'
  if (value < 0) return 'bg-loss/10 text-loss'
  return 'bg-surface-3 text-text-secondary'
}
