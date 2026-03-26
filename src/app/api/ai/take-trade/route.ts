import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { executeTrade } from '@/lib/trade'
import { getPrice } from '@/lib/twelvedata'

export async function POST(request: Request) {
  try {
    const { suggestionId, symbol, side, lotSize, entryPrice, stopLoss, takeProfit, label } = await request.json()
    const lots = lotSize || 0.01
    const validSuggestionId = suggestionId && typeof suggestionId === 'string' && suggestionId.length > 10 ? suggestionId : null

    if (!symbol || !side) {
      return NextResponse.json({ error: 'Symbol and side are required' }, { status: 400 })
    }

    // Try to find suggestion, but don't fail if not found
    let suggestion = null
    if (validSuggestionId) {
      const { data } = await supabase
        .from('ai_suggestions')
        .select('*')
        .eq('id', validSuggestionId)
        .single()
      suggestion = data
    }

    // Get current price
    const currentPrice = await getPrice(symbol)
    const aiEntry = entryPrice ? parseFloat(entryPrice) : (suggestion?.entry_price ? parseFloat(suggestion.entry_price) : null)

    // If there's an entry price and it's not the current price, create pending order
    // For forex/metals, any difference matters — don't use % threshold
    if (aiEntry && Math.abs(aiEntry - currentPrice) > 0.00001) {
      // Determine order type based on side and entry vs current
      let orderType: string
      if (side === 'buy') {
        orderType = aiEntry > currentPrice ? 'buy_stop' : 'buy_limit'
      } else {
        orderType = aiEntry < currentPrice ? 'sell_stop' : 'sell_limit'
      }

      // Check if this would trigger immediately (entry already hit)
      const wouldTriggerNow =
        (orderType === 'buy_stop' && currentPrice >= aiEntry) ||
        (orderType === 'buy_limit' && currentPrice <= aiEntry) ||
        (orderType === 'sell_stop' && currentPrice <= aiEntry) ||
        (orderType === 'sell_limit' && currentPrice >= aiEntry)

      if (!wouldTriggerNow) {
        try {
          const { data: order, error: orderError } = await supabase
            .from('pending_orders')
            .insert({
              symbol: symbol.toUpperCase(),
              side,
              lot_size: lots,
              entry_price: aiEntry,
              stop_loss: stopLoss || suggestion?.stop_loss || null,
              take_profit: takeProfit || suggestion?.take_profit || null,
              order_type: orderType,
              status: 'pending',
              ai_suggestion_id: validSuggestionId,
            })
            .select()
            .single()

          if (orderError) throw orderError

          // Mark suggestion as taken
          if (suggestion && suggestion.status === 'pending') {
            await supabase.from('ai_suggestions').update({ status: 'taken' }).eq('id', validSuggestionId)
          }

          const slText = stopLoss ? ` | SL: $${parseFloat(stopLoss).toFixed(5)}` : ''
          const tpText = takeProfit ? ` | TP: $${parseFloat(takeProfit).toFixed(5)}` : ''

          return NextResponse.json({
            trade: order,
            message: `${orderType.replace('_', ' ').toUpperCase()} placed: ${lots} lots ${symbol.toUpperCase()} @ $${aiEntry.toFixed(5)}${slText}${tpText}`,
            orderType,
          })
        } catch (pendingErr) {
          console.error('Pending order insert failed:', pendingErr)
          // Fall through to market order
        }
      }
      // If would trigger now, fall through to market order
    }

    // Execute market order
    const tradeNotes = label
      ? `AI: ${label}${suggestion ? ` (confidence: ${suggestion.confidence}/10)` : ''}`
      : suggestion
        ? `AI suggestion (confidence: ${suggestion.confidence}/10) - ${suggestion.reasoning?.slice(0, 100)}`
        : 'AI trade'

    const result = await executeTrade({
      symbol,
      side,
      lotSize: lots,
      stopLoss: stopLoss ? parseFloat(stopLoss) : (suggestion?.stop_loss ? parseFloat(suggestion.stop_loss) : null),
      takeProfit: takeProfit ? parseFloat(takeProfit) : (suggestion?.take_profit ? parseFloat(suggestion.take_profit) : null),
      notes: tradeNotes,
      aiSuggestionId: validSuggestionId || undefined,
    })

    // Mark suggestion as taken
    if (suggestion && suggestion.status === 'pending' && validSuggestionId) {
      await supabase
        .from('ai_suggestions')
        .update({
          status: 'taken',
          trade_id: (result.trade as Record<string, unknown>).id as string,
        })
        .eq('id', validSuggestionId)
    }

    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to execute AI trade'
    console.error('Take trade error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
