'use client';

import type { RunStats as RunStatsType } from '../../hooks/useSessionWebSocket';

interface RunStatsProps {
  stats: RunStatsType | null;
  onClick?: () => void;
}

function formatPlaytime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export function RunStatsPanel({ stats, onClick }: RunStatsProps) {
  const score = stats?.score ?? 0;
  const gameTick = stats?.game_tick ?? 0;
  const playtime = stats?.playtime_seconds ?? 0;
  const entityCount = stats?.entity_count ?? 0;

  const research = stats?.research as Record<string, unknown> | undefined;
  const currentResearch = (research?.current_research as string) || null;
  const researchProgress = (research?.progress as number) ?? 0;
  const researched = Array.isArray(research?.researched) ? research.researched as string[] : [];

  const inventory = stats?.inventory_summary as Record<string, number> | undefined;
  const inventoryItems = inventory
    ? Object.entries(inventory).sort(([, a], [, b]) => b - a)
    : [];
  const totalItems = inventoryItems.reduce((sum, [, c]) => sum + c, 0);

  const production = stats?.production_summary as Record<string, unknown> | undefined;
  const produced = (production?.produced ?? production?.input_counts ?? {}) as Record<string, number>;
  const consumed = (production?.consumed ?? production?.output_counts ?? {}) as Record<string, number>;
  const producedCount = Object.keys(produced).length;
  const consumedCount = Object.keys(consumed).length;

  return (
    <div
      onClick={onClick}
      className="relative w-full h-full bg-zinc-950 border border-zinc-800 rounded overflow-hidden cursor-pointer panel-hover flex flex-col"
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">Run Stats</span>
        <span className="font-mono text-[10px] text-zinc-600">{formatPlaytime(playtime)}</span>
      </div>
      <div className="flex-1 p-2.5 overflow-y-auto terminal-scroll font-mono text-[11px]">
        {!stats ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-zinc-600 text-xs">Waiting for game data...</span>
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Core metrics */}
            <Section label="game">
              <Row label="score" value={score.toLocaleString()} highlight />
              <Row label="tick" value={gameTick.toLocaleString()} />
              <Row label="entities" value={entityCount.toLocaleString()} />
              <Row label="production types" value={`${producedCount} produced / ${consumedCount} consumed`} />
            </Section>

            {/* Research */}
            <Section label="research">
              {currentResearch ? (
                <>
                  <Row label="current" value={currentResearch} />
                  <div className="mt-1 mb-0.5">
                    <div className="h-1 bg-zinc-800 rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-zinc-500 transition-all"
                        style={{ width: `${Math.min(researchProgress * 100, 100)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-zinc-600 mt-0.5">{(researchProgress * 100).toFixed(1)}%</div>
                  </div>
                </>
              ) : (
                <Row label="current" value="none" />
              )}
              <Row label="completed" value={String(researched.length)} />
              {researched.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5">
                  {researched.slice(-8).map((tech) => (
                    <span key={tech} className="text-[10px] text-zinc-500">{tech}</span>
                  ))}
                  {researched.length > 8 && (
                    <span className="text-[10px] text-zinc-600">+{researched.length - 8} more</span>
                  )}
                </div>
              )}
            </Section>

            {/* Inventory */}
            <Section label={`inventory (${totalItems})`}>
              {inventoryItems.length === 0 ? (
                <div className="text-zinc-600">empty</div>
              ) : (
                <>
                  {inventoryItems.slice(0, 12).map(([name, count]) => (
                    <Row key={name} label={name} value={String(count)} />
                  ))}
                  {inventoryItems.length > 12 && (
                    <div className="text-[10px] text-zinc-600 mt-0.5">+{inventoryItems.length - 12} more items</div>
                  )}
                </>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-0.5">{label}</div>
      <div className="border-l border-zinc-800 pl-2 space-y-0">{children}</div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between leading-relaxed">
      <span className="text-zinc-500 truncate">{label}</span>
      <span className={`ml-3 tabular-nums shrink-0 ${highlight ? 'text-zinc-100' : 'text-zinc-400'}`}>{value}</span>
    </div>
  );
}
