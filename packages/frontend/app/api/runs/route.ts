import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const brokerUrl = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const adminKey = process.env.BROKER_ADMIN_KEY || '';

  if (!brokerUrl) {
    console.error('[api/runs] BROKER_URL is not configured');
    return NextResponse.json({ error: 'BROKER_URL not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const target = `${brokerUrl}/api/runs`;
    console.log(`[api/runs] POST ${target}`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminKey}`,
    };

    const res = await fetch(target, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const text = await res.text();
    console.log(`[api/runs] broker responded ${res.status}: ${text}`);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Invalid response from broker', detail: text }, { status: 502 });
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[api/runs] proxy error:', err);
    return NextResponse.json({ error: 'Failed to create run', detail: String(err) }, { status: 500 });
  }
}
