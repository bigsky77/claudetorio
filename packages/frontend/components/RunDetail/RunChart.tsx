'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { RunStepInfo } from '@/interfaces';

export default function RunChart({ steps }: { steps: RunStepInfo[] }) {
  const data = steps
    .filter((s) => s.production_score != null)
    .map((s) => ({ step: s.step_idx, score: s.production_score }));

  if (data.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 flex items-center justify-center text-gray-500 h-64">
        No production data yet
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="step"
            tick={{ fill: '#6b7280', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: 8,
              color: '#e5e7eb',
              fontSize: 13,
            }}
            labelFormatter={(v) => `Step ${v}`}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#f97316"
            strokeWidth={2}
            fill="url(#scoreGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
