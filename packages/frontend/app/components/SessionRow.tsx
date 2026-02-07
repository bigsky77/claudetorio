'use client';

import { useState } from 'react';
import { useSessionWebSocket } from '../hooks/useSessionWebSocket';
import { GameViewport } from './panels/GameViewport';
import { TerminalReadout } from './panels/TerminalReadout';
import { RunStatsPanel } from './panels/RunStats';
import { PanelModal } from './PanelModal';

function formatElapsedTime(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const elapsed = Math.floor((now - start) / 1000);
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

interface SessionRowProps {
  sessionId: string;
  username: string;
  slot: number;
  startedAt: string;
  streamUrl: string;
  currentScore: number;
}

export function SessionRow({ sessionId, username, startedAt, streamUrl, currentScore }: SessionRowProps) {
  const { activities, runStats, connected } = useSessionWebSocket(sessionId);
  const [expandedPanel, setExpandedPanel] = useState<'game' | 'terminal' | 'stats' | null>(null);

  const displayScore = runStats?.score ?? currentScore;

  return (
    <>
      <div className="rounded border border-zinc-800 bg-zinc-950 overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]' : 'bg-zinc-600'}`}></span>
            <span className="font-mono text-sm text-zinc-200">{username}</span>
            <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">{sessionId}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-zinc-500">{formatElapsedTime(startedAt)}</span>
            <span className="font-mono text-sm text-amber-400 font-bold">{displayScore.toLocaleString()}</span>
          </div>
        </div>

        {/* 3-panel grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 lg:gap-px bg-zinc-800" style={{ height: '320px' }}>
          <div className="bg-zinc-950">
            <GameViewport
              streamUrl={streamUrl}
              username={username}
              onClick={() => setExpandedPanel('game')}
            />
          </div>
          <div className="bg-zinc-950">
            <TerminalReadout
              activities={activities}
              onClick={() => setExpandedPanel('terminal')}
            />
          </div>
          <div className="bg-zinc-950">
            <RunStatsPanel
              stats={runStats}
              onClick={() => setExpandedPanel('stats')}
            />
          </div>
        </div>
      </div>

      {/* Expanded panel modal */}
      {expandedPanel && (
        <PanelModal
          panelType={expandedPanel}
          username={username}
          streamUrl={streamUrl}
          activities={activities}
          runStats={runStats}
          onClose={() => setExpandedPanel(null)}
        />
      )}
    </>
  );
}
