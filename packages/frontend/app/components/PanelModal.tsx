'use client';

import { useEffect } from 'react';
import type { ActivityEvent, RunStats } from '../hooks/useSessionWebSocket';
import { TerminalReadout } from './panels/TerminalReadout';
import { RunStatsPanel } from './panels/RunStats';

type PanelType = 'game' | 'terminal' | 'stats';

interface PanelModalProps {
  panelType: PanelType;
  username: string;
  streamUrl: string;
  activities: ActivityEvent[];
  runStats: RunStats | null;
  onClose: () => void;
}

export function PanelModal({ panelType, username, streamUrl, activities, runStats, onClose }: PanelModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="relative w-full h-full max-w-7xl max-h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-t backdrop-blur shrink-0">
          <div className="flex items-center">
            <span className="w-3 h-3 bg-emerald-500 rounded-full mr-3 shadow-[0_0_6px_rgba(16,185,129,0.6)]"></span>
            <h2 className="text-lg font-bold font-mono">{username}</h2>
            <span className="ml-3 font-mono text-xs text-zinc-500 uppercase tracking-widest">
              {panelType === 'game' ? 'Game Stream' : panelType === 'terminal' ? 'Agent Activity' : 'Run Stats'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded text-2xl leading-none transition-colors"
            title="Close (Esc)"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 bg-zinc-950 rounded-b border-x border-b border-zinc-800 overflow-hidden">
          {panelType === 'game' && (
            <div className="w-full h-full scanline">
              <iframe
                src={streamUrl}
                className="w-full h-full border-0"
                allow="autoplay; fullscreen"
                title={`Live stream: ${username}`}
              />
            </div>
          )}
          {panelType === 'terminal' && (
            <div className="w-full h-full">
              <TerminalReadout activities={activities} />
            </div>
          )}
          {panelType === 'stats' && (
            <div className="w-full h-full">
              <RunStatsPanel stats={runStats} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
