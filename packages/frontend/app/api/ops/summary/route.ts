import { NextRequest, NextResponse } from 'next/server';

import { enforceDashboardAuth } from '../../_utils/auth';

export async function GET(request: NextRequest) {
  const auth = await enforceDashboardAuth(request);
  if (auth) return auth;

  const brokerUrl = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const adminKey = process.env.BROKER_ADMIN_KEY || '';

  if (!brokerUrl || !adminKey) {
    return NextResponse.json(
      { error: 'Server misconfigured' },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(`${brokerUrl}/api/ops/summary`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch ops summary', detail: String(error) },
      { status: 500 },
    );
  }
}
