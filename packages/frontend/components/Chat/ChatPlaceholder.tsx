export default function ChatPlaceholder() {
  return (
    <div className="bg-surface-1 border border-surface-3 h-full flex flex-col">
      <div className="px-4 py-3 border-b border-surface-3">
        <span className="font-[family-name:var(--font-heading)] font-bold text-sm text-white/90">
          Chat
        </span>
      </div>
      <div className="flex-1" />
      {/* TODO: wire to real chat (LLM) */}
      <div className="px-4 py-3 border-t border-surface-3">
        <div className="bg-surface-2 border border-surface-3 px-3 py-2 text-white/30 font-[family-name:var(--font-body)] text-xs">
          Send a message...
        </div>
      </div>
    </div>
  );
}
