import { NextRequest, NextResponse } from 'next/server';

async function proxyTobroker(
  request: NextRequest,
  params: Promise<{ runId: string }>,
  method: 'POST' | 'DELETE',
) {
  const brokerUrl = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const adminKey = process.env.BROKER_ADMIN_KEY || '';

  if (!brokerUrl) {
    console.error('[api/runs/replay] BROKER_URL is not configured');
    return NextResponse.json({ error: 'BROKER_URL not configured' }, { status: 500 });
  }

  try {
    const { runId } = await params;

    // Forward query params (vtuber, rtmp_url, stream_key) to the broker
    const incomingParams = request.nextUrl.searchParams;
    const qs = incomingParams.toString();
    const target = `${brokerUrl}/api/runs/${runId}/replay${qs ? `?${qs}` : ''}`;
    console.log(`[api/runs/replay] ${method} ${target}`);

    // Forward JSON body if present (contains API key overrides)
    let body: string | undefined;
    let contentType: string | undefined;
    if (method === 'POST') {
      const text = await request.text();
      if (text) {
        body = text;
        contentType = 'application/json';
      }
    }

    const res = await fetch(target, {
      method,
      headers: {
        'Authorization': `Bearer ${adminKey}`,
        ...(contentType ? { 'Content-Type': contentType } : {}),
      },
      ...(body ? { body } : {}),
    });

    const text = await res.text();
    console.log(`[api/runs/replay] broker responded ${res.status}: ${text}`);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Invalid response from broker', detail: text }, { status: 502 });
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[api/runs/replay] proxy error:', err);
    return NextResponse.json({ error: 'Replay request failed', detail: String(err) }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  return proxyTobroker(request, params, 'POST');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  return proxyTobroker(request, params, 'DELETE');
}
