'use client'

import { useState } from 'react'
import { Plus, X, ChevronDown, ChevronUp, Code } from 'lucide-react'
import type { IndicatorConfig, IndicatorType } from '@/types'

interface IndicatorPanelProps {
  indicators: IndicatorConfig[]
  onIndicatorsChange: (indicators: IndicatorConfig[]) => void
  pineScript: string
  onPineScriptChange: (code: string) => void
  tvStudies: string[]
  onTvStudiesChange: (studies: string[]) => void
}

const INDICATOR_PRESETS: { type: IndicatorType; label: string; defaultParams: Record<string, number> }[] = [
  { type: 'ema', label: 'EMA', defaultParams: { period: 20 } },
  { type: 'sma', label: 'SMA', defaultParams: { period: 50 } },
  { type: 'rsi', label: 'RSI', defaultParams: { period: 14 } },
  { type: 'macd', label: 'MACD', defaultParams: { fast: 12, slow: 26, signal: 9 } },
  { type: 'bollinger', label: 'Bollinger Bands', defaultParams: { period: 20, multiplier: 2 } },
  { type: 'stochastic', label: 'Stochastic', defaultParams: { kPeriod: 14, dPeriod: 3 } },
]

// TradingView built-in studies that can be added to the chart widget
const TV_STUDIES = [
  { id: 'MASimple@tv-basicstudies', label: 'SMA' },
  { id: 'MAExp@tv-basicstudies', label: 'EMA' },
  { id: 'RSI@tv-basicstudies', label: 'RSI' },
  { id: 'MACD@tv-basicstudies', label: 'MACD' },
  { id: 'BB@tv-basicstudies', label: 'Bollinger Bands' },
  { id: 'Stochastic@tv-basicstudies', label: 'Stochastic' },
  { id: 'VWAP@tv-basicstudies', label: 'VWAP' },
  { id: 'Volume@tv-basicstudies', label: 'Volume' },
  { id: 'IchimokuCloud@tv-basicstudies', label: 'Ichimoku Cloud' },
  { id: 'ATR@tv-basicstudies', label: 'ATR' },
  { id: 'ADX@tv-basicstudies', label: 'ADX' },
  { id: 'PSAR@tv-basicstudies', label: 'Parabolic SAR' },
  { id: 'VbPFixed@tv-basicstudies', label: 'Volume Profile' },
]

export default function IndicatorPanel({
  indicators,
  onIndicatorsChange,
  pineScript,
  onPineScriptChange,
  tvStudies,
  onTvStudiesChange,
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

  const toggleTvStudy = (studyId: string) => {
    if (tvStudies.includes(studyId)) {
      onTvStudiesChange(tvStudies.filter((s) => s !== studyId))
    } else {
      onTvStudiesChange([...tvStudies, studyId])
    }
  }

  return (
    <div className="bg-surface-1 rounded-xl border border-surface-3 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-2/50 transition-colors"
      >
        <span className="text-sm font-medium text-text-primary">
          Indicators {(indicators.length + tvStudies.length) > 0 && `(${indicators.length + tvStudies.length})`}
        </span>
        {expanded ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Chart Indicators (TradingView built-in) */}
          <div>
            <span className="text-xs text-text-muted block mb-2">Chart Indicators (click to add to chart)</span>
            <div className="flex flex-wrap gap-1.5">
              {TV_STUDIES.map((study) => {
                const active = tvStudies.includes(study.id)
                return (
                  <button
                    key={study.id}
                    onClick={() => toggleTvStudy(study.id)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      active
                        ? 'bg-brand-600 text-white'
                        : 'bg-surface-2 hover:bg-surface-3 text-text-secondary'
                    }`}
                  >
                    {study.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* AI Analysis Indicators (computed from data) */}
          <div>
            <span className="text-xs text-text-muted block mb-2">AI Analysis Indicators (sent to AI with OHLC data)</span>
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

            {indicators.length > 0 && (
              <div className="space-y-2 mt-2">
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
                      <button onClick={() => removeIndicator(ind.id)} className="p-1 hover:bg-surface-3 rounded transition-colors">
                        <X size={12} className="text-text-muted" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Pine Script */}
          <div>
            <button
              onClick={() => setShowPineScript(!showPineScript)}
              className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              <Code size={12} />
              {showPineScript ? 'Hide' : 'Add'} Pine Script Indicator
            </button>

            {showPineScript && (
              <div className="mt-2">
                <textarea
                  value={pineScript}
                  onChange={(e) => onPineScriptChange(e.target.value)}
                  placeholder={`// Paste your Pine Script here\n// Example:\n//@version=5\nindicator("My Indicator")\nema20 = ta.ema(close, 20)\nplot(ema20)`}
                  className="w-full h-36 px-3 py-2 text-xs font-mono bg-surface-2 border border-surface-4 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-brand-600 resize-none"
                />
                <p className="text-[10px] text-text-muted mt-1">
                  Your Pine Script will be sent to AI as context for analysis. The AI will interpret your indicator logic and factor it into trade recommendations.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
