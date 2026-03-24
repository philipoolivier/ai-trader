export interface Portfolio {
  id: string
  user_id: string
  cash_balance: number
  initial_balance: number
  created_at: string
  updated_at: string
}

export interface Position {
  id: string
  portfolio_id: string
  symbol: string
  quantity: number
  avg_price: number
  side: 'long' | 'short'
  created_at: string
  updated_at: string
}

export interface Trade {
  id: string
  portfolio_id: string
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  price: number
  total: number
  pnl: number | null
  notes: string | null
  status: 'filled' | 'cancelled'
  created_at: string
}

export interface PortfolioSnapshot {
  id: string
  portfolio_id: string
  total_value: number
  cash_balance: number
  positions_value: number
  created_at: string
}

export interface Quote {
  symbol: string
  name: string
  price: number
  change: number
  percent_change: number
  volume: number
  open: number
  high: number
  low: number
  previous_close: number
  timestamp: number
}

export interface SearchResult {
  symbol: string
  instrument_name: string
  exchange: string
  instrument_type: string
  country: string
}

export interface OHLC {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface PortfolioStats {
  totalValue: number
  cashBalance: number
  positionsValue: number
  totalPnl: number
  totalPnlPercent: number
  dayPnl: number
  dayPnlPercent: number
  winRate: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  avgWin: number
  avgLoss: number
  profitFactor: number
}

export interface PositionWithQuote extends Position {
  current_price: number
  market_value: number
  unrealized_pnl: number
  unrealized_pnl_percent: number
  name?: string
}
