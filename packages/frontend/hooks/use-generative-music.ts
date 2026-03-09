'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import type { RunInfo, RunStepInfo } from '@/interfaces';
import { FactorioAudioEngine, MusicMood } from '@/lib/audioEngine';

interface UseGenerativeMusicOptions {
  status: RunInfo['status'];
  latestStep: RunStepInfo | null;
  score: number | null;
  stepCount: number;
}

export function useGenerativeMusic({ status, latestStep, score, stepCount }: UseGenerativeMusicOptions) {
  const [enabled, setEnabled] = useState(true);
  const [ready, setReady] = useState(false);
  const engineRef = useRef<FactorioAudioEngine | null>(null);
  const previousScoreRef = useRef<number | null>(null);
  const errorStreakRef = useRef(0);
  const previousStatusRef = useRef(status);

  // Read localStorage on mount (layout effect to avoid flicker)
  useLayoutEffect(() => {
    try {
      const stored = localStorage.getItem('claudetorio_music');
      if (stored === 'false') setEnabled(false);
    } catch {
      // localStorage unavailable
    }
  }, []);

  // Create engine on mount, destroy on unmount
  useEffect(() => {
    engineRef.current = new FactorioAudioEngine();

    // Auto-start if ?music=auto is present (e.g. VTuber iframe context where
    // Chrome runs with --autoplay-policy=no-user-gesture-required)
    const params = new URLSearchParams(window.location.search);
    if (params.get('music') === 'auto') {
      Tone.start().then(() => {
        engineRef.current?.start();
        setReady(true);
      }).catch((err) => {
        console.warn('Tone.js auto-start failed:', err);
      });
    }

    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Derive mood from step state
  useEffect(() => {
    if (!ready || !engineRef.current) return;

    let mood: MusicMood = 'idle';

    if (latestStep?.error_occurred) {
      errorStreakRef.current += 1;
    } else {
      errorStreakRef.current = 0;
    }

    const currentScore = score ?? latestStep?.production_score ?? null;
    const scoreRising = currentScore != null && previousScoreRef.current != null && currentScore > previousScoreRef.current;

    if (latestStep?.error_occurred) {
      mood = 'error_spike';
    } else if (stepCount > 0) {
      mood = scoreRising ? 'active' : 'idle';
    }

    previousScoreRef.current = currentScore;
    engineRef.current.setMood(mood);
  }, [latestStep, stepCount, score, ready]);

  // Handle terminal status transitions
  useEffect(() => {
    if (!ready || !engineRef.current) return;
    const prev = previousStatusRef.current;
    previousStatusRef.current = status;

    if (prev === status) return;

    if (status === 'completed') {
      engineRef.current.setMood('completed');
    } else if (status === 'failed' || status === 'stopped') {
      engineRef.current.setMood('failed');
    }
  }, [status, ready]);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem('claudetorio_music', String(next));
    } catch {
      // localStorage unavailable
    }

    if (next) {
      // Button click is a valid user gesture — start AudioContext directly here.
      // Tone must be imported statically (not via dynamic import) so Tone.start()
      // is the first await; any microtask before it breaks the gesture context.
      try {
        await Tone.start();
        engineRef.current?.start();
        setReady(true);
      } catch (err) {
        console.warn('Tone.js start failed:', err);
      }
    } else {
      engineRef.current?.stop();
      setReady(false);
    }
  };

  return { enabled, ready, toggle };
}
