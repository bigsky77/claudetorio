import { NextRequest, NextResponse } from 'next/server';

const BROKER_URL = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';

export async function POST(request: NextRequest) {
  if (!BROKER_URL) {
    return NextResponse.json({ error: 'BROKER_URL not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const res = await fetch(`${BROKER_URL}/api/auth/github/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      return NextResponse.json(data, { status: res.status });
    } catch {
      return NextResponse.json({ error: text || 'Unknown broker error' }, { status: res.status });
    }
  } catch (err) {
    return NextResponse.json({ error: 'Auth service unavailable', detail: String(err) }, { status: 502 });
  }
}
