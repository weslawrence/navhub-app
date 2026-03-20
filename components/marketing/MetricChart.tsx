'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface MetricChartProps {
  data:        { period: string; value: number }[]
  metricLabel: string
  metricType:  'number' | 'percentage' | 'currency'
  color?:      string
}

function formatValue(val: number, type: MetricChartProps['metricType']): string {
  if (type === 'percentage') return `${val.toFixed(1)}%`
  if (type === 'currency') {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`
    if (val >= 1_000)     return `$${(val / 1_000).toFixed(1)}K`
    return `$${val.toFixed(0)}`
  }
  // number
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000)     return `${(val / 1_000).toFixed(1)}K`
  return val.toLocaleString()
}

function formatPeriod(period: string): string {
  // period is YYYY-MM
  const [year, month] = period.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const m = parseInt(month, 10) - 1
  const y = parseInt(year, 10)
  const currentYear = new Date().getFullYear()
  return y !== currentYear ? `${months[m]} '${String(y).slice(2)}` : (months[m] ?? period)
}

interface TooltipProps {
  active?:  boolean
  payload?: { value: number }[]
  label?:   string
}

function CustomTooltip({ active, payload, label, metricType }: TooltipProps & { metricType: MetricChartProps['metricType'] }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-primary">{formatValue(payload[0].value, metricType)}</p>
    </div>
  )
}

export default function MetricChart({ data, metricLabel, metricType, color = 'var(--palette-primary, #0ea5e9)' }: MetricChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
        No data for this period
      </div>
    )
  }

  const chartData = data.map(d => ({
    period: formatPeriod(d.period),
    value:  d.value,
  }))

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.5 }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={v => formatValue(v as number, metricType)}
          />
          <Tooltip content={<CustomTooltip metricType={metricType} />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
            name={metricLabel}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
