import { supabase } from '@/lib/supabase'
import { getPrice } from '@/lib/twelvedata'
import { LOT_UNIT } from '@/lib/trading-config'

const DEFAULT_USER_ID = 'default-user'

// Server-side defaults (client sends leverage + lotSize with each trade)
const DEFAULT_LEVERAGE = 1000

interface TradeParams {
  symbol: string
  side: 'buy' | 'sell'
  lotSize: number      // e.g. 0.01, 0.1, 1.0
  leverage?: number    // e.g. 1000
  notes?: string
  aiSuggestionId?: string
}

interface TradeResult {
  trade: Record<string, unknown>
  message: string
}

export async function executeTrade(params: TradeParams): Promise<TradeResult> {
  const { symbol, side, notes, aiSuggestionId } = params
  const leverage = params.leverage || DEFAULT_LEVERAGE

  const lotSize = Math.max(params.lotSize, 0.01) // Minimum 0.01 lots
  const units = Math.round(lotSize * LOT_UNIT)

  if (!symbol || !side || lotSize <= 0) {
    throw new Error('Invalid trade parameters')
  }

  // Get current price
  const price = await getPrice(symbol)

  // Margin required = (lots * 100,000 * price) / leverage
  const notional = lotSize * LOT_UNIT * price
  const marginRequired = notional / leverage

  // Get portfolio
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', DEFAULT_USER_ID)
    .single()

  if (!portfolio) {
    throw new Error('Portfolio not found')
  }

  // Get existing position
  const { data: existingPosition } = await supabase
    .from('positions')
    .select('*')
    .eq('portfolio_id', portfolio.id)
    .eq('symbol', symbol.toUpperCase())
    .single()

  let pnl: number | null = null
  let message = ''

  const hasPosition = existingPosition && existingPosition.quantity > 0

  if (hasPosition) {
    const positionSide = existingPosition.side
    const isClosing =
      (positionSide === 'long' && side === 'sell') ||
      (positionSide === 'short' && side === 'buy')

    if (isClosing) {
      // Closing (fully or partially) an existing position
      const closeUnits = Math.min(units, existingPosition.quantity)
      const closeLots = closeUnits / LOT_UNIT
      const remainingUnits = existingPosition.quantity - closeUnits

      // Calculate P&L
      if (positionSide === 'long') {
        pnl = (price - existingPosition.avg_price) * closeUnits
      } else {
        pnl = (existingPosition.avg_price - price) * closeUnits
      }

      // Return margin + P&L to cash
      const marginReturned = (closeUnits * existingPosition.avg_price) / leverage
      await supabase
        .from('portfolios')
        .update({ cash_balance: portfolio.cash_balance + marginReturned + pnl })
        .eq('id', portfolio.id)

      await supabase
        .from('positions')
        .update({ quantity: remainingUnits, updated_at: new Date().toISOString() })
        .eq('id', existingPosition.id)

      const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`
      message = `Closed ${closeLots} lots of ${symbol.toUpperCase()} ${positionSide} at $${price.toFixed(2)} (P&L: ${pnlStr})`

      // If leftover, flip position
      if (units > existingPosition.quantity) {
        const flipUnits = units - existingPosition.quantity
        const flipLots = flipUnits / LOT_UNIT
        const flipMargin = (flipUnits * price) / leverage
        const flipSide = side === 'buy' ? 'long' : 'short'

        await supabase
          .from('portfolios')
          .update({ cash_balance: portfolio.cash_balance + marginReturned + pnl - flipMargin })
          .eq('id', portfolio.id)

        await supabase
          .from('positions')
          .update({
            quantity: flipUnits,
            avg_price: price,
            side: flipSide,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingPosition.id)

        message += ` | Opened ${flipLots} lots ${flipSide} at $${price.toFixed(2)}`
      }
    } else {
      // Adding to existing position (same direction)
      if (portfolio.cash_balance < marginRequired) {
        throw new Error(
          `Insufficient margin. Need $${marginRequired.toFixed(2)} but only have $${portfolio.cash_balance.toFixed(2)}`
        )
      }

      await supabase
        .from('portfolios')
        .update({ cash_balance: portfolio.cash_balance - marginRequired })
        .eq('id', portfolio.id)

      const newUnits = existingPosition.quantity + units
      const newAvg =
        (existingPosition.avg_price * existingPosition.quantity + price * units) / newUnits

      await supabase
        .from('positions')
        .update({ quantity: newUnits, avg_price: newAvg, updated_at: new Date().toISOString() })
        .eq('id', existingPosition.id)

      message = `Added ${lotSize} lots to ${existingPosition.side} ${symbol.toUpperCase()} at $${price.toFixed(2)} (avg: $${newAvg.toFixed(2)})`
    }
  } else {
    // No existing position — open new long or short
    if (portfolio.cash_balance < marginRequired) {
      throw new Error(
        `Insufficient margin. Need $${marginRequired.toFixed(2)} but only have $${portfolio.cash_balance.toFixed(2)}`
      )
    }

    const positionSide = side === 'buy' ? 'long' : 'short'

    await supabase
      .from('portfolios')
      .update({ cash_balance: portfolio.cash_balance - marginRequired })
      .eq('id', portfolio.id)

    if (existingPosition) {
      await supabase
        .from('positions')
        .update({
          quantity: units,
          avg_price: price,
          side: positionSide,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingPosition.id)
    } else {
      await supabase.from('positions').insert({
        portfolio_id: portfolio.id,
        symbol: symbol.toUpperCase(),
        quantity: units,
        avg_price: price,
        side: positionSide,
      })
    }

    message = `Opened ${positionSide} ${lotSize} lots of ${symbol.toUpperCase()} at $${price.toFixed(2)} (margin: $${marginRequired.toFixed(2)})`
  }

  // Record trade
  const insertData: Record<string, unknown> = {
    portfolio_id: portfolio.id,
    symbol: symbol.toUpperCase(),
    side,
    quantity: units,
    price,
    total: notional,
    pnl,
    notes: notes || null,
    status: 'filled',
  }

  if (aiSuggestionId) {
    insertData.ai_suggestion_id = aiSuggestionId
  }

  const { data: trade, error: tradeError } = await supabase
    .from('trades')
    .insert(insertData)
    .select()
    .single()

  if (tradeError) throw tradeError

  return {
    trade: trade as Record<string, unknown>,
    message,
  }
}
