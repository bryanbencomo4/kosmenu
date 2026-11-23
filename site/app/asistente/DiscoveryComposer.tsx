'use client';

import { SendHorizontal } from 'lucide-react';
import { type KeyboardEvent } from 'react';

type DiscoveryComposerProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  inputTestId?: string;
  sendTestId?: string;
};

/** Text-only composer matching chat theme vars — avoids ChatComposer media hydration. */
export function DiscoveryComposer({
  value,
  disabled = false,
  onChange,
  onSend,
  placeholder = 'Escribe un mensaje',
  inputTestId = 'discovery-composer-input',
  sendTestId = 'discovery-composer-send',
}: DiscoveryComposerProps) {
  const canSend = value.trim().length > 0 && !disabled;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <form
      className="flex items-end gap-2 px-1 py-1"
      data-discovery-composer="1"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
    >
      <label className="flex min-h-[42px] flex-1 items-center rounded-2xl bg-[var(--chat-input)] px-3 py-1.5">
        <textarea
          data-testid={inputTestId}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="max-h-[7.5rem] min-h-[28px] w-full resize-none bg-transparent text-[15px] leading-5 text-[var(--chat-text)] outline-none placeholder:text-[var(--chat-text-muted)]"
          enterKeyHint="send"
          autoComplete="off"
        />
      </label>
      <button
        type="submit"
        disabled={!canSend}
        data-testid={sendTestId}
        aria-label="Enviar"
        className="relative z-30 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--chat-send)] text-[var(--chat-send-fg)] disabled:opacity-40"
      >
        <SendHorizontal className="h-4 w-4" aria-hidden />
      </button>
    </form>
  );
}
