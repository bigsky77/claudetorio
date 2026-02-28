import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const brokerUrl = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const { runId } = await params;
  try {
    const res = await fetch(`${brokerUrl}/api/runs/${runId}`, { cache: 'no-store' });
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
