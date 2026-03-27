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
  stop_loss: number | null
  take_profit: number | null
  notes: string | null
  ai_suggestion_id: string | null
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
  stop_loss?: number | null
  take_profit?: number | null
}

// AI Features
export interface AiSuggestion {
  id: string
  portfolio_id: string
  image_data: string | null
  symbol: string | null
  direction: 'buy' | 'sell' | null
  entry_price: number | null
  stop_loss: number | null
  take_profit: number | null
  confidence: number | null
  reasoning: string | null
  patterns: string[] | null
  raw_analysis: ChartAnalysisResponse | null
  status: 'pending' | 'taken' | 'skipped'
  trade_id: string | null
  outcome_pnl: number | null
  created_at: string
}

export interface ChartAnalysisResponse {
  symbol: string
  direction: 'buy' | 'sell' | null
  entry_price: number | null
  stop_loss: number | null
  take_profit: number | null
  confidence: number
  reasoning: string
  patterns: string[]
  trend: 'uptrend' | 'downtrend' | 'ranging'
  support_levels: number[]
  resistance_levels: number[]
  indicators_detected: string[]
  risk_reward_ratio: number | null
  follow_up_suggestion?: string
  label?: string
  order_type?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  analysis?: ChartAnalysisResponse | null
  trades?: ChartAnalysisResponse[]
  timestamp: string
}

export type IndicatorType = 'ema' | 'sma' | 'rsi' | 'macd' | 'bollinger' | 'stochastic'

export interface IndicatorConfig {
  id: string
  type: IndicatorType
  params: Record<string, number>
  visible: boolean
}

export interface IndicatorValues {
  type: string
  params: Record<string, number>
  values: Record<string, (number | null)[]>
}

export interface CustomIndicator {
  id: string
  user_id: string
  name: string
  description: string | null
  pine_script: string
  category: string
  created_at: string
  updated_at: string
}

export interface AnalyzeChartDataRequest {
  symbol: string
  interval: string
  ohlcData: OHLC[]
  indicators: IndicatorValues[]
  pineScriptCode?: string
  conversationHistory: ChatMessage[]
  userMessage?: string
}

export interface NewsSentiment {
  id: string
  pair: string
  sentiment_score: number
  sentiment_label: 'bullish' | 'bearish' | 'neutral'
  headlines: NewsHeadline[]
  analysis_summary: string | null
  fetched_at: string
  expires_at: string
}

export interface NewsHeadline {
  title: string
  source: string
  url: string
  published_at: string
  individual_score: number
}

export interface AiPerformanceStats {
  totalSuggestions: number
  takenCount: number
  skippedCount: number
  takenWinRate: number
  takenAvgPnl: number
  skippedWouldHaveWon: number
  avgConfidence: number
  bestSuggestionPnl: number
  worstSuggestionPnl: number
}
