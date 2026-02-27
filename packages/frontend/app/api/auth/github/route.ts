import { NextResponse } from 'next/server';

const BROKER_URL = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';

export async function GET() {
  if (!BROKER_URL) {
    return NextResponse.json({ error: 'BROKER_URL not configured' }, { status: 500 });
  }

  try {
    const res = await fetch(`${BROKER_URL}/api/auth/github`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: 'Auth service unavailable', detail: String(err) }, { status: 502 });
  }
}
