'use client';

import {
  ChatComposer,
  type ChatFilePayload,
  type ChatVoicePayload,
} from '../v/[id]/_components/chat/ChatComposer';
import type { ChatSharedLocation } from '../v/[id]/_components/chat/chat-types';

type DiscoveryComposerProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onSendVoice?: (payload: ChatVoicePayload) => void;
  onSendFile?: (payload: ChatFilePayload) => void;
  onShareLocation?: (location: ChatSharedLocation) => void;
  onComposerFocus?: () => void;
  onRecordingChange?: (recording: boolean) => void;
  placeholder?: string;
  inputTestId?: string;
  sendTestId?: string;
};

/** Full WhatsApp ChatComposer surface (emoji, attach, mic, location, send). */
export function DiscoveryComposer({
  value,
  disabled = false,
  onChange,
  onSend,
  onSendVoice,
  onSendFile,
  onShareLocation,
  onComposerFocus,
  onRecordingChange,
  placeholder = 'Escribe un mensaje',
  inputTestId = 'discovery-composer-input',
  sendTestId = 'discovery-composer-send',
}: DiscoveryComposerProps) {
  return (
    <div className="relative z-30" data-discovery-composer="1">
      <ChatComposer
        value={value}
        disabled={disabled}
        onChange={onChange}
        onSend={onSend}
        onSendVoice={onSendVoice}
        onSendFile={onSendFile}
        onShareLocation={onShareLocation}
        onComposerFocus={onComposerFocus}
        onRecordingChange={onRecordingChange}
        placeholder={placeholder}
        inputTestId={inputTestId}
        sendTestId={sendTestId}
      />
    </div>
  );
}
