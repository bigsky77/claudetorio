export interface AuthUser {
  id: number;
  github_id: number;
  github_username: string;
  email: string | null;
  avatar_url: string | null;
}
