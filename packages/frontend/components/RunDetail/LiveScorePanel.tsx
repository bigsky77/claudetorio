'use client';

import {
  AreaChart,
  Area,
  ResponsiveContainer,
  YAxis,
} from 'recharts';
import type { RunStepInfo } from '@/interfaces';

export default function LiveScorePanel({
  score,
  reward,
  steps,
}: {
  score: number;
  reward: number;
  steps: RunStepInfo[];
}) {
  const chartData = steps
    .filter((s) => s.production_score != null)
    .map((s) => ({ step: s.step_idx, score: s.production_score }));

  return (
    <div className="shrink-0 border-b border-gray-800 bg-gray-900/50">
      {/* Big score number */}
      <div className="px-4 pt-3 pb-1 flex items-baseline gap-3">
        <div className="text-3xl font-bold font-mono text-orange-400 tabular-nums">
          {score.toLocaleString()}
        </div>
        <div className="text-xs text-gray-500 uppercase tracking-wider">Production Score</div>
        {reward !== 0 && (
          <div className={`ml-auto text-sm font-mono font-medium ${
            reward > 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {reward > 0 ? '+' : ''}{reward.toFixed(2)}
          </div>
        )}
      </div>

      {/* Sparkline chart */}
      {chartData.length > 1 && (
        <div className="h-16 px-2 pb-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="scoreSpark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Area
                type="monotone"
                dataKey="score"
                stroke="#f97316"
                strokeWidth={2}
                fill="url(#scoreSpark)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
