export interface ChatMessage {
  id: number;
  stream_id: string;
  username: string;
  content: string;
  is_ai: boolean;
  created_at: string;
}
