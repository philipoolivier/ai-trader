import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number, symbol?: string): string {
  // Default: 2 decimals for account values, P&L, etc.
  // Only use extra decimals for forex price display (when symbol is provided)
  let decimals = 2

  if (symbol) {
    const s = symbol.toUpperCase()
    const absVal = Math.abs(value)
    if (s.includes('JPY')) {
      decimals = 3 // USD/JPY: 150.342
    } else if (absVal > 0 && absVal < 10) {
      decimals = 5 // EUR/USD: 1.15342
    }
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
