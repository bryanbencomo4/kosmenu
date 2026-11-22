'use client';

import { useEffect, useState, type ComponentType } from 'react';

import { ChatAssistantSkeleton } from './ChatAssistantSkeleton';
import type { ChatAssistantViewProps } from './ChatAssistantView';

/**
 * Loads the heavy WhatsApp chat UI only when mounted (chatbot mode).
 * Normal menu never downloads this chunk.
 */
export function ChatAssistantLazy(props: ChatAssistantViewProps) {
  const [View, setView] = useState<ComponentType<ChatAssistantViewProps> | null>(
    null,
  );

  useEffect(() => {
    let alive = true;
    void import('./ChatAssistantView')
      .then((mod) => {
        if (alive) setView(() => mod.ChatAssistantView);
      })
      .catch(() => {
        /* keep skeleton; user can go back to menu */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!View) {
    return (
      <ChatAssistantSkeleton
        businessName={props.businessName}
        logoUrl={props.logoUrl}
        initialLetter={props.initialLetter}
      />
    );
  }

  return <View {...props} />;
}
