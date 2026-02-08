import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const brokerUrl = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const adminKey = process.env.BROKER_ADMIN_KEY || '';

  if (!brokerUrl) {
    console.error('[api/runs/stop] BROKER_URL is not configured');
    return NextResponse.json({ error: 'BROKER_URL not configured' }, { status: 500 });
  }

  try {
    const { runId } = await params;
    const target = `${brokerUrl}/api/runs/${runId}/stop`;
    console.log(`[api/runs/stop] POST ${target}`);

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${adminKey}`,
    };

    const res = await fetch(target, {
      method: 'POST',
      headers,
    });

    const text = await res.text();
    console.log(`[api/runs/stop] broker responded ${res.status}: ${text}`);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Invalid response from broker', detail: text }, { status: 502 });
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[api/runs/stop] proxy error:', err);
    return NextResponse.json({ error: 'Failed to stop run', detail: String(err) }, { status: 500 });
  }
}
