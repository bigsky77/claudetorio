import { NextRequest, NextResponse } from 'next/server';

async function proxyToBroker(
  method: 'POST' | 'DELETE',
  { params }: { params: Promise<{ runId: string }> },
) {
  const brokerUrl = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const adminKey = process.env.BROKER_ADMIN_KEY || '';

  if (!brokerUrl) {
    console.error('[api/runs/replay/start-worker] BROKER_URL is not configured');
    return NextResponse.json({ error: 'BROKER_URL not configured' }, { status: 500 });
  }

  try {
    const { runId } = await params;
    const target = `${brokerUrl}/api/runs/${runId}/replay/start-worker`;
    console.log(`[api/runs/replay/start-worker] ${method} ${target}`);

    const res = await fetch(target, {
      method,
      headers: { Authorization: `Bearer ${adminKey}` },
    });

    const text = await res.text();
    console.log(`[api/runs/replay/start-worker] broker responded ${res.status}: ${text}`);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Invalid response from broker', detail: text }, { status: 502 });
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[api/runs/replay/start-worker] proxy error:', err);
    return NextResponse.json({ error: `Failed to ${method === 'POST' ? 'start' : 'stop'} replay worker`, detail: String(err) }, { status: 500 });
  }
}

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ runId: string }> },
) {
  return proxyToBroker('POST', ctx);
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ runId: string }> },
) {
  return proxyToBroker('DELETE', ctx);
}
