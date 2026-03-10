import { NextResponse } from 'next/server';

export async function GET() {
  const brokerUrl = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';
  try {
    const res = await fetch(`${brokerUrl}/api/music/random`, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json({ error: 'No music available' }, { status: res.status });
    }
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
