import { supabase } from '@/lib/supabase'
import { getPrice } from '@/lib/twelvedata'

const DEFAULT_USER_ID = 'default-user'

interface TradeParams {
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  notes?: string
  aiSuggestionId?: string
}

interface TradeResult {
  trade: Record<string, unknown>
  message: string
}

export async function executeTrade(params: TradeParams): Promise<TradeResult> {
  const { symbol, side, quantity, notes, aiSuggestionId } = params

  if (!symbol || !side || !quantity || quantity <= 0) {
    throw new Error('Invalid trade parameters')
  }

  // Get current price
  const price = await getPrice(symbol)
  const total = price * quantity

  // Get portfolio
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', DEFAULT_USER_ID)
    .single()

  if (!portfolio) {
    throw new Error('Portfolio not found')
  }

  // Check margin/funds
  if (portfolio.cash_balance < total) {
    throw new Error(
      `Insufficient funds. Need $${total.toFixed(2)} but only have $${portfolio.cash_balance.toFixed(2)}`
    )
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
    const positionSide = existingPosition.side // 'long' or 'short'
    const isClosing =
      (positionSide === 'long' && side === 'sell') ||
      (positionSide === 'short' && side === 'buy')

    if (isClosing) {
      // Closing (fully or partially) an existing position
      const closeQty = Math.min(quantity, existingPosition.quantity)
      const remainingQty = existingPosition.quantity - closeQty

      // Calculate P&L
      if (positionSide === 'long') {
        pnl = (price - existingPosition.avg_price) * closeQty
      } else {
        pnl = (existingPosition.avg_price - price) * closeQty
      }

      // Return margin + P&L to cash
      const marginReturned = existingPosition.avg_price * closeQty
      await supabase
        .from('portfolios')
        .update({ cash_balance: portfolio.cash_balance + marginReturned + pnl })
        .eq('id', portfolio.id)

      if (remainingQty > 0) {
        await supabase
          .from('positions')
          .update({ quantity: remainingQty, updated_at: new Date().toISOString() })
          .eq('id', existingPosition.id)
      } else {
        await supabase
          .from('positions')
          .update({ quantity: 0, updated_at: new Date().toISOString() })
          .eq('id', existingPosition.id)
      }

      const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`
      message = `Closed ${closeQty} units of ${symbol.toUpperCase()} ${positionSide} at $${price.toFixed(2)} (P&L: ${pnlStr})`

      // If there's leftover quantity beyond the existing position, open opposite direction
      if (quantity > existingPosition.quantity) {
        const flipQty = quantity - existingPosition.quantity
        const flipTotal = price * flipQty
        const flipSide = side === 'buy' ? 'long' : 'short'

        await supabase
          .from('portfolios')
          .update({ cash_balance: portfolio.cash_balance + marginReturned + pnl - flipTotal })
          .eq('id', portfolio.id)

        await supabase
          .from('positions')
          .update({
            quantity: flipQty,
            avg_price: price,
            side: flipSide,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingPosition.id)

        message += ` | Opened ${flipQty} units ${flipSide} at $${price.toFixed(2)}`
      }
    } else {
      // Adding to existing position (same direction)
      await supabase
        .from('portfolios')
        .update({ cash_balance: portfolio.cash_balance - total })
        .eq('id', portfolio.id)

      const newQty = existingPosition.quantity + quantity
      const newAvg =
        (existingPosition.avg_price * existingPosition.quantity + price * quantity) / newQty

      await supabase
        .from('positions')
        .update({ quantity: newQty, avg_price: newAvg, updated_at: new Date().toISOString() })
        .eq('id', existingPosition.id)

      message = `Added ${quantity} units to ${existingPosition.side} ${symbol.toUpperCase()} at $${price.toFixed(2)} (avg: $${newAvg.toFixed(2)})`
    }
  } else {
    // No existing position — open new long or short
    const positionSide = side === 'buy' ? 'long' : 'short'

    await supabase
      .from('portfolios')
      .update({ cash_balance: portfolio.cash_balance - total })
      .eq('id', portfolio.id)

    if (existingPosition) {
      // Row exists but quantity is 0, reuse it
      await supabase
        .from('positions')
        .update({
          quantity,
          avg_price: price,
          side: positionSide,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingPosition.id)
    } else {
      await supabase.from('positions').insert({
        portfolio_id: portfolio.id,
        symbol: symbol.toUpperCase(),
        quantity,
        avg_price: price,
        side: positionSide,
      })
    }

    message = `Opened ${positionSide} ${quantity} units of ${symbol.toUpperCase()} at $${price.toFixed(2)}`
  }

  // Record trade
  const insertData: Record<string, unknown> = {
    portfolio_id: portfolio.id,
    symbol: symbol.toUpperCase(),
    side,
    quantity,
    price,
    total,
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
