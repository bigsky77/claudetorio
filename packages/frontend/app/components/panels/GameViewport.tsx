'use client';

interface GameViewportProps {
  streamUrl: string;
  username: string;
  onClick?: () => void;
}

export function GameViewport({ streamUrl, username, onClick }: GameViewportProps) {
  return (
    <div
      onClick={onClick}
      className="relative w-full h-full bg-zinc-900 overflow-hidden scanline cursor-pointer group panel-hover"
    >
      <iframe
        src={streamUrl}
        className="w-full h-full border-0 pointer-events-none"
        title={`Game stream: ${username}`}
        loading="lazy"
      />
      {/* LIVE badge */}
      <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-black/70 px-2 py-1 backdrop-blur">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"></span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-200">Live</span>
      </div>
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
        <span className="font-mono text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity">
          Expand
        </span>
      </div>
    </div>
  );
}
