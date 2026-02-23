import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchChatMessages, sendChatMessage } from '@/services/api';
import type { ChatMessage } from '@/interfaces';

const CHAT_POLL_INTERVAL_MS = 3000;

export function useChat(streamId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const maxIdRef = useRef(0);

  const poll = useCallback(async () => {
    const newMessages = await fetchChatMessages(streamId, maxIdRef.current);
    if (newMessages.length > 0) {
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const fresh = newMessages.filter((m) => !existingIds.has(m.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
      maxIdRef.current = Math.max(
        maxIdRef.current,
        ...newMessages.map((m) => m.id),
      );
    }
  }, [streamId]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, CHAT_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [poll]);

  const sendMessage = useCallback(
    async (content: string, username: string) => {
      setIsLoading(true);

      // Optimistically show user message immediately
      const optimisticMsg: ChatMessage = {
        id: -(Date.now()),
        stream_id: streamId,
        username,
        content,
        is_ai: false,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);
      setIsAiTyping(true);

      try {
        const returned = await sendChatMessage(streamId, content, username);
        // Replace optimistic message with real ones
        setMessages((prev) => {
          const withoutOptimistic = prev.filter((m) => m.id !== optimisticMsg.id);
          const existingIds = new Set(withoutOptimistic.map((m) => m.id));
          const fresh = returned.filter((m) => !existingIds.has(m.id));
          return [...withoutOptimistic, ...fresh];
        });
        if (returned.length > 0) {
          maxIdRef.current = Math.max(
            maxIdRef.current,
            ...returned.map((m) => m.id),
          );
        }
      } catch {
        // Remove optimistic message on failure
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      } finally {
        setIsLoading(false);
        setIsAiTyping(false);
      }
    },
    [streamId],
  );

  return { messages, sendMessage, isLoading, isAiTyping };
}
