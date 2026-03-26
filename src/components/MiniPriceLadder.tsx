'use client'

import { formatCurrency } from '@/lib/utils'

interface MiniPriceLadderProps {
  currentPrice: number
  entryPrice: number
  stopLoss?: number | null
  takeProfit?: number | null
  side: 'long' | 'short' | 'buy' | 'sell'
  width?: number
  height?: number
}

export default function MiniPriceLadder({
  currentPrice,
  entryPrice,
  stopLoss,
  takeProfit,
  side,
  width = 200,
  height = 80,
}: MiniPriceLadderProps) {
  const isLong = side === 'long' || side === 'buy'

  // Collect all prices to determine range
  const prices = [currentPrice, entryPrice]
  if (stopLoss) prices.push(stopLoss)
  if (takeProfit) prices.push(takeProfit)

  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const range = maxPrice - minPrice || 1
  const padding = range * 0.15 // 15% padding top/bottom
  const fullMin = minPrice - padding
  const fullMax = maxPrice + padding
  const fullRange = fullMax - fullMin

  // Map price to Y coordinate (inverted — higher price = higher on chart)
  const priceToY = (price: number) => {
    return height - ((price - fullMin) / fullRange) * height
  }

  const entryY = priceToY(entryPrice)
  const currentY = priceToY(currentPrice)
  const slY = stopLoss ? priceToY(stopLoss) : null
  const tpY = takeProfit ? priceToY(takeProfit) : null

  // Current price progress between SL and TP
  let progress = 0
  if (stopLoss && takeProfit) {
    const totalDist = Math.abs(takeProfit - stopLoss)
    const currentDist = isLong
      ? currentPrice - stopLoss
      : stopLoss - currentPrice
    progress = totalDist > 0 ? Math.max(0, Math.min(100, (currentDist / totalDist) * 100)) : 50
  }

  const labelX = width - 4

  return (
    <div className="bg-surface-2 rounded-lg p-2">
      <svg width={width} height={height} className="overflow-visible">
        {/* SL zone (red area) */}
        {slY !== null && (
          <>
            <rect
              x={0} y={Math.min(slY, entryY)}
              width={width} height={Math.abs(slY - entryY)}
              fill="rgba(239, 68, 68, 0.08)"
            />
            <line x1={0} y1={slY} x2={width} y2={slY} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2" />
            <text x={4} y={slY - 3} fill="#ef4444" fontSize={9} fontWeight={600}>SL {formatCurrency(stopLoss!)}</text>
          </>
        )}

        {/* TP zone (green area) */}
        {tpY !== null && (
          <>
            <rect
              x={0} y={Math.min(tpY, entryY)}
              width={width} height={Math.abs(tpY - entryY)}
              fill="rgba(34, 197, 94, 0.08)"
            />
            <line x1={0} y1={tpY} x2={width} y2={tpY} stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 2" />
            <text x={4} y={tpY - 3} fill="#22c55e" fontSize={9} fontWeight={600}>TP {formatCurrency(takeProfit!)}</text>
          </>
        )}

        {/* Entry line */}
        <line x1={0} y1={entryY} x2={width} y2={entryY} stroke="#6366f1" strokeWidth={1.5} />
        <text x={labelX} y={entryY - 3} fill="#6366f1" fontSize={9} fontWeight={600} textAnchor="end">Entry</text>

        {/* Current price marker */}
        <line x1={0} y1={currentY} x2={width} y2={currentY} stroke="#f0f0f5" strokeWidth={2} />
        <circle cx={width / 2} cy={currentY} r={3} fill="#f0f0f5" />
        <text x={labelX} y={currentY + 12} fill="#f0f0f5" fontSize={9} fontWeight={700} textAnchor="end">
          {formatCurrency(currentPrice)}
        </text>
      </svg>

      {/* Progress bar SL→TP */}
      {stopLoss && takeProfit && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[9px] text-loss">SL</span>
          <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${progress > 50 ? 'bg-profit' : 'bg-loss'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[9px] text-profit">TP</span>
        </div>
      )}
    </div>
  )
}
