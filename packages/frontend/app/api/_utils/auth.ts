import { NextRequest, NextResponse } from 'next/server';

/**
 * Guard for dangerous dashboard actions.
 *
 * - Default: require a valid user JWT (GitHub OAuth)
 * - Set DASHBOARD_PUBLIC_CONTROL=true to bypass ("flip the switch")
 */
export async function enforceDashboardAuth(request: NextRequest): Promise<NextResponse | null> {
  if (process.env.DASHBOARD_PUBLIC_CONTROL === 'true') return null;

  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice('Bearer '.length);
  const brokerUrl = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';
  if (!brokerUrl) {
    return NextResponse.json({ error: 'BROKER_URL not configured' }, { status: 500 });
  }

  try {
    const res = await fetch(`${brokerUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: 'Auth validation failed', detail: String(err) },
      { status: 500 },
    );
  }

  return null;
}
