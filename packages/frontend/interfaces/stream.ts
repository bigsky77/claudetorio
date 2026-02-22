export interface StreamInfo {
  run_id: string;
  type: 'replay' | 'available';
  label: string;
  stream_url: string | null;
  vtuber_stream_url: string | null;
  status: string;
  model: string;
  step_count: number;
  final_score: number | null;
}
