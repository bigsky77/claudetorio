/**
 * Auth token lives in localStorage (set by GitHub OAuth callback).
 *
 * NOTE: This helper must only be used from client components / browser code.
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('claudetorio_jwt');
  } catch {
    return null;
  }
}
