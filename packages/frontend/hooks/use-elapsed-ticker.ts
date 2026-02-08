import { useEffect, useState } from 'react';
import { TICK_INTERVAL_MS } from '@/constants';

export function useElapsedTicker() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const ticker = setInterval(() => setTick(t => t + 1), TICK_INTERVAL_MS);
    return () => clearInterval(ticker);
  }, []);
}
