// Trading configuration — leverage, lot sizing, risk management

export interface TradingConfig {
  leverage: number           // e.g. 1000 = 1000:1
  defaultLotSize: number     // e.g. 0.01
  riskPerTradePercent: number // % of account to risk per trade, e.g. 2
  maxOpenPositions: number
  maxLotSize: number
}

// Standard lot sizes vary by instrument
// Forex: 1 lot = 100,000 units
// Gold (XAU): 1 lot = 100 oz
// Silver (XAG): 1 lot = 5,000 oz
export const LOT_UNIT_FOREX = 100_000
export const LOT_UNIT_GOLD = 100
export const LOT_UNIT_SILVER = 5_000
export const LOT_UNIT_CRYPTO = 1 // 1 lot = 1 coin

// For backwards compatibility
export const LOT_UNIT = 100_000

const CRYPTO_BASES = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOT', 'LTC', 'BNB', 'DOGE', 'AVAX', 'MATIC', 'LINK', 'UNI', 'SHIB', 'ATOM']

// Get the correct lot unit for a symbol
export function getLotUnit(symbol: string): number {
  const s = symbol.toUpperCase().replace('/', '')
  if (s.startsWith('XAU')) return LOT_UNIT_GOLD
  if (s.startsWith('XAG')) return LOT_UNIT_SILVER
  if (CRYPTO_BASES.some(c => s.startsWith(c))) return LOT_UNIT_CRYPTO
  return LOT_UNIT_FOREX
}

export const LOT_PRESETS = [
  { label: '0.01', value: 0.01 },
  { label: '0.05', value: 0.05 },
  { label: '0.1', value: 0.1 },
  { label: '0.5', value: 0.5 },
  { label: '1.0', value: 1.0 },
]

// Default config
const DEFAULT_CONFIG: TradingConfig = {
  leverage: 1000,
  defaultLotSize: 0.01,
  riskPerTradePercent: 2,
  maxOpenPositions: 10,
  maxLotSize: 10,
}

const CONFIG_KEY = 'ai-trader-config'

export function getTradingConfig(): TradingConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG
  try {
    const stored = localStorage.getItem(CONFIG_KEY)
    if (stored) return { ...DEFAULT_CONFIG, ...JSON.parse(stored) }
  } catch { /* ignore */ }
  return DEFAULT_CONFIG
}

export function saveTradingConfig(config: Partial<TradingConfig>): TradingConfig {
  const current = getTradingConfig()
  const updated = { ...current, ...config }
  if (typeof window !== 'undefined') {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(updated))
  }
  return updated
}

// Calculate margin required for a trade
// margin = (lot_size * LOT_UNIT * price) / leverage
export function calculateMargin(lotSize: number, price: number, leverage: number): number {
  return (lotSize * LOT_UNIT * price) / leverage
}

// Calculate position size in units from lots
export function lotsToUnits(lotSize: number): number {
  return lotSize * LOT_UNIT
}

// Calculate P&L for a position
// For a long: (exitPrice - entryPrice) * units
// For a short: (entryPrice - exitPrice) * units
export function calculatePnl(
  entryPrice: number,
  exitPrice: number,
  units: number,
  side: 'long' | 'short'
): number {
  if (side === 'long') return (exitPrice - entryPrice) * units
  return (entryPrice - exitPrice) * units
}

// Calculate lot size based on risk % and stop loss distance
export function calculateLotSizeFromRisk(
  accountBalance: number,
  riskPercent: number,
  stopLossPips: number,
  pipValue: number = 10 // $10 per pip for 1 standard lot
): number {
  if (stopLossPips <= 0) return 0
  const riskAmount = accountBalance * (riskPercent / 100)
  const lotSize = riskAmount / (stopLossPips * pipValue)
  return Math.round(lotSize * 100) / 100 // Round to 2 decimals
}
