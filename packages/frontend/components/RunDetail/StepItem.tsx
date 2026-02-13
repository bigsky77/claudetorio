import type { RunStepInfo } from '@/interfaces';

export default function StepItem({
  step,
  expanded,
  onToggle,
}: {
  step: RunStepInfo;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tokens = step.token_usage;
  const totalTokens =
    tokens ? (tokens.input_tokens ?? 0) + (tokens.output_tokens ?? 0) : null;

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-800 hover:bg-gray-750 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-gray-400 font-mono text-sm w-12">
            #{step.step_idx}
          </span>
          {step.error_occurred && (
            <span className="px-2 py-0.5 text-xs rounded bg-red-900/50 text-red-400">
              error
            </span>
          )}
          {step.production_score != null && (
            <span className="text-orange-400 font-mono text-sm">
              score {step.production_score.toLocaleString()}
            </span>
          )}
          {step.reward != null && (
            <span
              className={`font-mono text-sm ${step.reward >= 0 ? 'text-green-400' : 'text-red-400'}`}
            >
              {step.reward >= 0 ? '+' : ''}
              {step.reward.toFixed(2)}
            </span>
          )}
        </div>
        <span className="text-gray-500 text-lg">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {/* Body — collapsible */}
      {expanded && (
        <div className="px-4 py-3 space-y-3 bg-gray-900">
          {/* Code */}
          <div>
            <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-1">
              Code
            </h4>
            <pre className="bg-gray-950 rounded p-3 text-sm text-green-300 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
              {step.code}
            </pre>
          </div>

          {/* Result */}
          {step.result && (
            <div>
              <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                Result
              </h4>
              <pre
                className={`bg-gray-950 rounded p-3 text-sm overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap ${
                  step.error_occurred ? 'text-red-400' : 'text-gray-300'
                }`}
              >
                {step.result}
              </pre>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {step.reward != null && (
              <div className="bg-gray-800 rounded p-2">
                <div className="text-gray-500 text-xs">Reward</div>
                <div className={step.reward >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {step.reward.toFixed(2)}
                </div>
              </div>
            )}
            {step.production_score != null && (
              <div className="bg-gray-800 rounded p-2">
                <div className="text-gray-500 text-xs">Production Score</div>
                <div className="text-orange-400">
                  {step.production_score.toLocaleString()}
                </div>
              </div>
            )}
            {step.ticks != null && (
              <div className="bg-gray-800 rounded p-2">
                <div className="text-gray-500 text-xs">Ticks</div>
                <div className="text-gray-300">{step.ticks.toLocaleString()}</div>
              </div>
            )}
            {totalTokens != null && (
              <div className="bg-gray-800 rounded p-2">
                <div className="text-gray-500 text-xs">Tokens</div>
                <div className="text-gray-300">
                  {totalTokens.toLocaleString()}
                  {tokens && (
                    <span className="text-gray-500 text-xs ml-1">
                      ({tokens.input_tokens?.toLocaleString() ?? 0}in /{' '}
                      {tokens.output_tokens?.toLocaleString() ?? 0}out)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
