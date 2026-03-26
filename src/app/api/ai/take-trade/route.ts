import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { executeTrade } from '@/lib/trade'
import { getPrice } from '@/lib/twelvedata'

export async function POST(request: Request) {
  try {
    const { suggestionId, symbol, side, lotSize, entryPrice, stopLoss, takeProfit, label } = await request.json()
    const lots = lotSize || 0.01

    if (!symbol || !side) {
      return NextResponse.json({ error: 'Symbol and side are required' }, { status: 400 })
    }

    // Try to find and update suggestion, but don't fail if not found
    let suggestion = null
    if (suggestionId && suggestionId.length > 5) {
      const { data } = await supabase
        .from('ai_suggestions')
        .select('*')
        .eq('id', suggestionId)
        .single()
      suggestion = data
    }

    // Check if entry price differs from current — create pending order
    const currentPrice = await getPrice(symbol)
    const aiEntry = entryPrice || (suggestion?.entry_price ? parseFloat(suggestion.entry_price) : null)
    const priceDiff = aiEntry ? Math.abs(aiEntry - currentPrice) / currentPrice : 0

    if (aiEntry && priceDiff > 0.001) {
      let orderType: string
      if (side === 'buy') {
        orderType = aiEntry > currentPrice ? 'buy_stop' : 'buy_limit'
      } else {
        orderType = aiEntry < currentPrice ? 'sell_stop' : 'sell_limit'
      }

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
            ai_suggestion_id: suggestionId || null,
          })
          .select()
          .single()

        if (orderError) throw orderError

        // Mark suggestion as taken
        if (suggestion && suggestion.status === 'pending') {
          await supabase.from('ai_suggestions').update({ status: 'taken' }).eq('id', suggestionId)
        }

        return NextResponse.json({
          trade: order,
          message: `${orderType.replace('_', ' ').toUpperCase()}: ${lots} lots ${symbol.toUpperCase()} at $${aiEntry.toFixed(2)}`,
          orderType,
        })
      } catch (pendingErr) {
        console.error('Pending order creation failed, falling through to market order:', pendingErr)
        // Fall through to market order
      }
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
      stopLoss: stopLoss || (suggestion?.stop_loss ? parseFloat(suggestion.stop_loss) : null),
      takeProfit: takeProfit || (suggestion?.take_profit ? parseFloat(suggestion.take_profit) : null),
      notes: tradeNotes,
      aiSuggestionId: suggestionId || undefined,
    })

    // Mark suggestion as taken (only if still pending)
    if (suggestion && suggestion.status === 'pending') {
      await supabase
        .from('ai_suggestions')
        .update({
          status: 'taken',
          trade_id: (result.trade as Record<string, unknown>).id as string,
        })
        .eq('id', suggestionId)
    }

    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to execute AI trade'
    console.error('Take trade error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
