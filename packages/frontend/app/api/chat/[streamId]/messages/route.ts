import { NextRequest, NextResponse } from 'next/server';

const BROKER_URL = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ streamId: string }> },
) {
  if (!BROKER_URL) {
    return NextResponse.json({ error: 'BROKER_URL not configured' }, { status: 500 });
  }

  const { streamId } = await params;
  const afterId = request.nextUrl.searchParams.get('after_id') || '0';
  const limit = request.nextUrl.searchParams.get('limit') || '50';

  try {
    const res = await fetch(
      `${BROKER_URL}/api/chat/${streamId}/messages?after_id=${afterId}&limit=${limit}`,
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[api/chat] GET proxy error:', err);
    return NextResponse.json([], { status: 502 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ streamId: string }> },
) {
  if (!BROKER_URL) {
    return NextResponse.json({ error: 'BROKER_URL not configured' }, { status: 500 });
  }

  const { streamId } = await params;

  try {
    const body = await request.json();
    const res = await fetch(`${BROKER_URL}/api/chat/${streamId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[api/chat] POST proxy error:', err);
    return NextResponse.json({ error: 'Chat request failed' }, { status: 502 });
  }
}
