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
  stream_url: string | null;
  replay_worker_running?: boolean | null;
  stream_host?: string | null;
  stream_port?: number | null;
  stream_scheme?: string | null;
  vtuber_stream_url?: string | null;
  vtuber_channel?: string | null;
  vtuber_platform?: string | null;
}
