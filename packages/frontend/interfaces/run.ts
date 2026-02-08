export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
}

export interface RunStepInfo {
  id: number;
  run_id: string;
  step_idx: number;
  created_at: string | null;
  code: string;
  result: string | null;
  error_occurred: boolean;
  reward: number | null;
  production_score: number | null;
  ticks: number | null;
  token_usage: TokenUsage | null;
  achievements: Record<string, unknown> | null;
  observation_summary: Record<string, unknown> | null;
}

export interface RunInfo {
  run_id: string;
  status: string;
  created_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  slot: number | null;
  task_key: string;
  model: string;
  max_steps: number;
  step_timeout_seconds: number;
  error: string | null;
  final_score: number | null;
  step_count: number;
}
