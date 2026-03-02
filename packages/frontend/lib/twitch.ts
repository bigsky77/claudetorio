export interface TwitchStream {
  id: string;
  title: string;
  viewer_count: number;
  thumbnail_url: string;
  started_at: string;
}

export interface TwitchVideo {
  id: string;
  title: string;
  duration: string;
  thumbnail_url: string;
  published_at: string;
  url: string;
  view_count: number;
}

async function getAppToken(): Promise<string> {
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: 'POST', next: { revalidate: 3600 * 24 } } as RequestInit,
  );
  const data = await res.json();
  return data.access_token;
}

async function helixFetch(path: string, revalidate?: number): Promise<Response> {
  const token = await getAppToken();
  const init: RequestInit = revalidate
    ? { headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${token}` }, next: { revalidate } } as RequestInit
    : { headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${token}` }, cache: 'no-store' };
  return fetch(`https://api.twitch.tv/helix/${path}`, init);
}

export async function getLiveStream(channel: string): Promise<TwitchStream | null> {
  try {
    const res = await helixFetch(`streams?user_login=${channel}`);
    const data = await res.json();
    return data.data?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function getVideos(channel: string, limit = 8): Promise<TwitchVideo[]> {
  try {
    const userRes = await helixFetch(`users?login=${channel}`, 3600);
    const user = (await userRes.json()).data?.[0];
    if (!user) return [];
    const videoRes = await helixFetch(`videos?user_id=${user.id}&type=archive&first=${limit}`, 3600);
    return (await videoRes.json()).data ?? [];
  } catch {
    return [];
  }
}
