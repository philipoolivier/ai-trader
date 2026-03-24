'use client'

import { useState } from 'react'
import { Plus, X, ChevronDown, ChevronUp, Code } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { IndicatorConfig, IndicatorType } from '@/types'

interface IndicatorPanelProps {
  indicators: IndicatorConfig[]
  onIndicatorsChange: (indicators: IndicatorConfig[]) => void
  pineScript: string
  onPineScriptChange: (code: string) => void
}

const INDICATOR_PRESETS: { type: IndicatorType; label: string; defaultParams: Record<string, number> }[] = [
  { type: 'ema', label: 'EMA', defaultParams: { period: 20 } },
  { type: 'sma', label: 'SMA', defaultParams: { period: 50 } },
  { type: 'rsi', label: 'RSI', defaultParams: { period: 14 } },
  { type: 'macd', label: 'MACD', defaultParams: { fast: 12, slow: 26, signal: 9 } },
  { type: 'bollinger', label: 'Bollinger Bands', defaultParams: { period: 20, multiplier: 2 } },
  { type: 'stochastic', label: 'Stochastic', defaultParams: { kPeriod: 14, dPeriod: 3 } },
]

export default function IndicatorPanel({
  indicators,
  onIndicatorsChange,
  pineScript,
  onPineScriptChange,
}: IndicatorPanelProps) {
  const [expanded, setExpanded] = useState(true)
  const [showPineScript, setShowPineScript] = useState(false)

  const addIndicator = (preset: typeof INDICATOR_PRESETS[number]) => {
    const newIndicator: IndicatorConfig = {
      id: `${preset.type}-${Date.now()}`,
      type: preset.type,
      params: { ...preset.defaultParams },
      visible: true,
    }
    onIndicatorsChange([...indicators, newIndicator])
  }

  const removeIndicator = (id: string) => {
    onIndicatorsChange(indicators.filter((ind) => ind.id !== id))
  }

  const updateParam = (id: string, key: string, value: number) => {
    onIndicatorsChange(
      indicators.map((ind) =>
        ind.id === id ? { ...ind, params: { ...ind.params, [key]: value } } : ind
      )
    )
  }

  return (
    <div className="bg-surface-1 rounded-xl border border-surface-3 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-2/50 transition-colors"
      >
        <span className="text-sm font-medium text-text-primary">
          Indicators {indicators.length > 0 && `(${indicators.length})`}
        </span>
        {expanded ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Add indicator buttons */}
          <div className="flex flex-wrap gap-1.5">
            {INDICATOR_PRESETS.map((preset) => (
              <button
                key={preset.type}
                onClick={() => addIndicator(preset)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-surface-2 hover:bg-surface-3 text-text-secondary rounded-lg transition-colors"
              >
                <Plus size={12} />
                {preset.label}
              </button>
            ))}
          </div>

          {/* Active indicators */}
          {indicators.length > 0 && (
            <div className="space-y-2">
              {indicators.map((ind) => {
                const preset = INDICATOR_PRESETS.find((p) => p.type === ind.type)
                return (
                  <div key={ind.id} className="flex items-center gap-2 bg-surface-2 rounded-lg p-2">
                    <span className="text-xs font-medium text-brand-400 w-16 shrink-0">
                      {preset?.label || ind.type.toUpperCase()}
                    </span>
                    <div className="flex items-center gap-1.5 flex-1 flex-wrap">
                      {Object.entries(ind.params).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-1">
                          <span className="text-[10px] text-text-muted">{key}:</span>
                          <input
                            type="number"
                            value={value}
                            onChange={(e) => updateParam(ind.id, key, parseFloat(e.target.value) || 0)}
                            className="w-12 px-1.5 py-0.5 text-xs bg-surface-3 border border-surface-4 rounded text-text-primary text-center focus:outline-none focus:ring-1 focus:ring-brand-600"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => removeIndicator(ind.id)}
                      className="p-1 hover:bg-surface-3 rounded transition-colors"
                    >
                      <X size={12} className="text-text-muted" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pine Script */}
          <button
            onClick={() => setShowPineScript(!showPineScript)}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <Code size={12} />
            {showPineScript ? 'Hide' : 'Show'} Pine Script
          </button>

          {showPineScript && (
            <div>
              <textarea
                value={pineScript}
                onChange={(e) => onPineScriptChange(e.target.value)}
                placeholder="Paste your Pine Script indicator code here. It will be sent to AI as context for analysis (not executed locally)."
                className="w-full h-28 px-3 py-2 text-xs font-mono bg-surface-2 border border-surface-4 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-brand-600 resize-none"
              />
              <p className="text-[10px] text-text-muted mt-1">
                AI will interpret your Pine Script logic but indicators are computed from the preset library above.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
