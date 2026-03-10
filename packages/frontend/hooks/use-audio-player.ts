'use client';

import { useEffect, useRef, useState } from 'react';

const BROKER_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export function useAudioPlayer() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('claudetorio_music') !== 'false';
    } catch {
      return false;
    }
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.volume = 0.25;
    audioRef.current = audio;

    const params = new URLSearchParams(window.location.search);
    const autoStart = params.get('music') === 'auto';

    if (autoStart || enabled) {
      audio.src = `${BROKER_URL}/api/music/random`;
      audio.play().catch((err) => {
        console.warn('Audio autoplay failed:', err);
      });
    }

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem('claudetorio_music', String(next));
    } catch {
      // localStorage unavailable
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (next) {
      if (!audio.src) {
        audio.src = `${BROKER_URL}/api/music/random`;
      }
      audio.play().catch((err) => {
        console.warn('Audio play failed:', err);
      });
    } else {
      audio.pause();
    }
  };

  return { enabled, toggle };
}
