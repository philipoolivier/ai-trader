'use client'

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface PortfolioChartProps {
  data: { date: string; value: number }[]
  initialBalance?: number
}

export default function PortfolioChart({ data, initialBalance = 500 }: PortfolioChartProps) {
  if (data.length < 2) {
    return (
      <div className="h-[300px] flex items-center justify-center text-text-muted text-sm">
        Equity curve will appear after your first closed trade
      </div>
    )
  }

  const startValue = data[0]?.value || initialBalance
  const endValue = data[data.length - 1]?.value || initialBalance
  const isPositive = endValue >= startValue

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor={isPositive ? '#22c55e' : '#ef4444'}
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor={isPositive ? '#22c55e' : '#ef4444'}
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#232330" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#5e5e72', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#232330' }}
          />
          <YAxis
            tick={{ fill: '#5e5e72', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#232330' }}
            tickFormatter={(v) => `$${v.toFixed(0)}`}
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1a1a24',
              border: '1px solid #2d2d3d',
              borderRadius: '8px',
              color: '#f0f0f5',
              fontSize: '13px',
            }}
            formatter={(value: number) => [formatCurrency(value), 'Equity']}
            labelStyle={{ color: '#9494a8' }}
          />
          <ReferenceLine
            y={initialBalance}
            stroke="#5e5e72"
            strokeDasharray="3 3"
            label={{ value: 'Start', fill: '#5e5e72', fontSize: 10, position: 'right' }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={isPositive ? '#22c55e' : '#ef4444'}
            strokeWidth={2}
            fill="url(#colorValue)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
