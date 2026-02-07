'use client';

import { useEffect, useRef } from 'react';
import type { ActivityEvent } from '../../hooks/useSessionWebSocket';

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  thinking:  { icon: '>_', color: 'text-zinc-400' },
  tool_use:  { icon: '[T]', color: 'text-blue-400' },
  code_exec: { icon: '#',  color: 'text-emerald-400' },
  output:    { icon: '>>', color: 'text-zinc-300' },
  error:     { icon: '!!', color: 'text-red-400' },
  commit:    { icon: '[C]', color: 'text-amber-400' },
  system:    { icon: '~',  color: 'text-zinc-500' },
};

interface TerminalReadoutProps {
  activities: ActivityEvent[];
  onClick?: () => void;
}

export function TerminalReadout({ activities, onClick }: TerminalReadoutProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [activities.length]);

  return (
    <div
      onClick={onClick}
      className="relative w-full h-full bg-zinc-950 border border-zinc-800 rounded overflow-hidden cursor-pointer panel-hover flex flex-col"
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">Agent Activity</span>
        <span className="font-mono text-[10px] text-zinc-600">{activities.length} events</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-0.5 terminal-scroll">
        {activities.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <span className="font-mono text-xs text-zinc-600">Waiting for agent activity...</span>
          </div>
        )}
        {activities.map((event, i) => {
          const cfg = TYPE_CONFIG[event.type] || TYPE_CONFIG.system;
          const ts = event.timestamp ? new Date(event.timestamp).toLocaleTimeString([], { hour12: false }) : '';
          return (
            <div key={i} className="flex gap-2 font-mono text-[11px] leading-relaxed">
              <span className="text-zinc-600 shrink-0 w-[52px]">{ts}</span>
              <span className={`shrink-0 w-[24px] ${cfg.color}`}>{cfg.icon}</span>
              <span className={`${cfg.color} truncate`}>{event.summary}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
