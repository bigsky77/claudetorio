import { NextRequest, NextResponse } from 'next/server';

async function proxyToBroker(
  request: NextRequest,
  params: Promise<{ runId: string }>,
  method: 'POST' | 'DELETE',
) {
  const brokerUrl = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const adminKey = process.env.BROKER_ADMIN_KEY || '';

  if (!brokerUrl) {
    console.error('[api/runs/vtuber] BROKER_URL is not configured');
    return NextResponse.json({ error: 'BROKER_URL not configured' }, { status: 500 });
  }

  try {
    const { runId } = await params;
    const target = `${brokerUrl}/api/runs/${runId}/vtuber`;
    console.log(`[api/runs/vtuber] ${method} ${target}`);

    const fetchOptions: RequestInit = {
      method,
      headers: { 'Authorization': `Bearer ${adminKey}` },
    };

    if (method === 'POST') {
      const body = await request.text();
      fetchOptions.headers = {
        ...fetchOptions.headers as Record<string, string>,
        'Content-Type': 'application/json',
      };
      fetchOptions.body = body;
    }

    const res = await fetch(target, fetchOptions);
    const text = await res.text();
    console.log(`[api/runs/vtuber] broker responded ${res.status}: ${text}`);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Invalid response from broker', detail: text }, { status: 502 });
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[api/runs/vtuber] proxy error:', err);
    return NextResponse.json({ error: 'VTuber request failed', detail: String(err) }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  return proxyToBroker(request, params, 'POST');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  return proxyToBroker(request, params, 'DELETE');
}
