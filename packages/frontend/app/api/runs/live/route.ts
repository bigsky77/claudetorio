import { NextResponse } from 'next/server';

export async function GET() {
  const brokerUrl = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';
  try {
    const res = await fetch(`${brokerUrl}/api/runs/live`, { cache: 'no-store' });
    if (res.status === 404) return NextResponse.json(null, { status: 404 });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return NextResponse.json({ error: 'Invalid response from broker' }, { status: 502 });
    }
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
