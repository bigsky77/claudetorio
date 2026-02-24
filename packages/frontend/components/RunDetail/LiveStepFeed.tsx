'use client';

import { useEffect, useRef } from 'react';
import type { RunStepInfo } from '@/interfaces';

export default function LiveStepFeed({
  steps,
  isActive,
}: {
  steps: RunStepInfo[];
  isActive: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef(steps.length);

  // Auto-scroll to bottom on new steps
  useEffect(() => {
    if (steps.length > prevLen.current) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
    prevLen.current = steps.length;
  }, [steps.length]);

  if (steps.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-600 text-sm">
        <div className="text-center space-y-2">
          <div className="font-mono">Waiting for first step...</div>
          {isActive && (
            <div className="flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs text-green-600">Agent active</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const latest = steps[steps.length - 1];
  const older = steps.slice(0, -1).reverse(); // newest-first for older steps

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      {/* Older steps: compact */}
      {older.length > 0 && (
        <div className="border-b border-gray-800">
          {older.map((step) => (
            <CompactStep key={step.id} step={step} />
          ))}
        </div>
      )}

      {/* Latest step: prominent */}
      <LatestStep step={latest} isActive={isActive} />
    </div>
  );
}

function LatestStep({ step, isActive }: { step: RunStepInfo; isActive: boolean }) {
  return (
    <div className="p-3 space-y-2">
      {/* Step header */}
      <div className="flex items-center gap-2">
        {isActive && (
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shrink-0" />
        )}
        <span className="font-mono text-xs text-gray-500">STEP {step.step_idx}</span>
        {step.error_occurred && (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-red-900/50 text-red-400 font-medium">
            ERROR
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {step.production_score != null && (
            <span className="text-orange-400 font-mono text-xs">
              {step.production_score.toLocaleString()}
            </span>
          )}
          {step.reward != null && (
            <span className={`font-mono text-xs ${step.reward >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {step.reward >= 0 ? '+' : ''}{step.reward.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Code block — terminal style */}
      <div className="bg-gray-950 rounded border border-gray-800 overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 border-b border-gray-800">
          <span className="w-2 h-2 rounded-full bg-red-500/60" />
          <span className="w-2 h-2 rounded-full bg-yellow-500/60" />
          <span className="w-2 h-2 rounded-full bg-green-500/60" />
          <span className="ml-2 text-[10px] text-gray-600 font-mono">lua</span>
        </div>
        <pre className="p-3 text-xs text-green-300 font-mono overflow-x-auto max-h-48 overflow-y-auto leading-relaxed whitespace-pre-wrap">
          {step.code}
        </pre>
      </div>

      {/* Result */}
      {step.result && (
        <div className="bg-gray-900/50 rounded border border-gray-800 p-3">
          <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1 font-medium">Output</div>
          <pre className={`text-xs font-mono overflow-x-auto max-h-24 overflow-y-auto whitespace-pre-wrap ${
            step.error_occurred ? 'text-red-400' : 'text-gray-400'
          }`}>
            {step.result}
          </pre>
        </div>
      )}

      {/* Token usage */}
      {step.token_usage && (
        <div className="flex gap-3 text-[10px] text-gray-600 font-mono">
          {step.token_usage.input_tokens != null && (
            <span>{step.token_usage.input_tokens.toLocaleString()} in</span>
          )}
          {step.token_usage.output_tokens != null && (
            <span>{step.token_usage.output_tokens.toLocaleString()} out</span>
          )}
        </div>
      )}
    </div>
  );
}

function CompactStep({ step }: { step: RunStepInfo }) {
  // Show first meaningful line of code as a summary
  const codeSummary = step.code
    .split('\n')
    .find((line) => line.trim() && line.trim().startsWith('--'))
    ?.replace(/^--\s*/, '')
    || step.code.split('\n').find((line) => line.trim())?.trim()
    || '...';

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
      <span className="font-mono text-gray-600 w-6 text-right shrink-0">
        {step.step_idx}
      </span>
      {step.error_occurred && (
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
      )}
      <span className="text-gray-500 truncate min-w-0">
        {codeSummary}
      </span>
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {step.production_score != null && (
          <span className="text-orange-400/60 font-mono">
            {step.production_score.toLocaleString()}
          </span>
        )}
        {step.reward != null && (
          <span className={`font-mono ${step.reward >= 0 ? 'text-green-400/60' : 'text-red-400/60'}`}>
            {step.reward >= 0 ? '+' : ''}{step.reward.toFixed(1)}
          </span>
        )}
      </div>
    </div>
  );
}
