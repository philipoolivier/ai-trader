'use client'

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface PortfolioChartProps {
  data: { date: string; value: number }[]
}

export default function PortfolioChart({ data }: PortfolioChartProps) {
  if (data.length < 2) {
    return (
      <div className="h-[300px] flex items-center justify-center text-text-muted text-sm">
        Chart will appear after more trading activity
      </div>
    )
  }

  const startValue = data[0]?.value || 0
  const endValue = data[data.length - 1]?.value || 0
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
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
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
            formatter={(value: number) => [formatCurrency(value), 'Portfolio Value']}
            labelStyle={{ color: '#9494a8' }}
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
