import { ActiveSession } from './session';

export interface SystemStatus {
  total_slots: number;
  available_slots: number;
  active_sessions: ActiveSession[];
  total_users: number;
  total_sessions_all_time: number;
  vtuber_stream_url?: string | null;
  vtuber_channel?: string | null;
  vtuber_platform?: string | null;
}
