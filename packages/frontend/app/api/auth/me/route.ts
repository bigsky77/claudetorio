import { NextRequest, NextResponse } from 'next/server';

const BROKER_URL = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';

export async function GET(request: NextRequest) {
  if (!BROKER_URL) {
    return NextResponse.json({ error: 'BROKER_URL not configured' }, { status: 500 });
  }

  try {
    const authHeader = request.headers.get('authorization') || '';
    const res = await fetch(`${BROKER_URL}/api/auth/me`, {
      headers: { Authorization: authHeader },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: 'Auth service unavailable', detail: String(err) }, { status: 502 });
  }
}
