'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@/hooks/use-chat';
import { getOrCreateUsername } from '@/lib/names';
import type { ChatMessage } from '@/interfaces';

function MessageBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className={`px-3 py-1.5 ${msg.is_ai ? 'bg-surface-2/50' : ''}`}>
      <span
        className={`text-xs font-semibold ${
          msg.is_ai ? 'text-accent-green' : 'text-accent-orange'
        }`}
      >
        {msg.username}
      </span>
      <p className="text-xs text-white/80 leading-relaxed">{msg.content}</p>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="px-3 py-1.5 bg-surface-2/50">
      <span className="text-xs font-semibold text-accent-green">Claudetorio</span>
      <p className="text-xs text-white/40 leading-relaxed italic">
        thinking<span className="animate-pulse">...</span>
      </p>
    </div>
  );
}

export default function ChatPanel({ streamId }: { streamId: string }) {
  const { messages, sendMessage, isLoading, isAiTyping } = useChat(streamId);
  const [input, setInput] = useState('');
  const [username, setUsername] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Defer username to client to avoid SSR hydration mismatch
  useEffect(() => {
    setUsername(getOrCreateUsername());
  }, []);

  // Auto-scroll to bottom on new messages or typing state change
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, isAiTyping]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading || !username) return;
    setInput('');
    await sendMessage(text, username);
  };

  return (
    <div className="bg-surface-1 border border-surface-3 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-3 flex items-center justify-between shrink-0">
        <span className="font-[family-name:var(--font-heading)] font-bold text-sm text-white/90">
          Chat
        </span>
        <span className="text-[10px] text-white/30 font-[family-name:var(--font-body)]">
          {username}
        </span>
      </div>

      {/* Messages — scrollable, fixed within parent */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain space-y-1 py-2"
      >
        {messages.length === 0 && !isAiTyping && (
          <p className="text-xs text-white/20 text-center py-8">
            No messages yet — say something!
          </p>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {isAiTyping && <TypingIndicator />}
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-surface-3 shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Send a message..."
            maxLength={500}
            disabled={isLoading}
            className="flex-1 bg-surface-2 border border-surface-3 px-3 py-2 text-xs text-white placeholder:text-white/30 font-[family-name:var(--font-body)] outline-none focus:border-accent-green/50 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim() || !username}
            className="px-3 py-2 bg-accent-green/20 text-accent-green text-xs font-semibold border border-accent-green/30 hover:bg-accent-green/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
