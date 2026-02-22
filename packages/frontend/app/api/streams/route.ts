import { NextResponse } from 'next/server';

const BROKER_URL = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';
const BROKER_ADMIN_KEY = process.env.BROKER_ADMIN_KEY || '';

export async function GET() {
  if (!BROKER_URL) {
    return NextResponse.json({ error: 'BROKER_URL not configured' }, { status: 500 });
  }

  try {
    const res = await fetch(`${BROKER_URL}/api/streams`, {
      headers: {
        'Authorization': `Bearer ${BROKER_ADMIN_KEY}`,
      },
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch streams', detail: String(err) }, { status: 500 });
  }
}
