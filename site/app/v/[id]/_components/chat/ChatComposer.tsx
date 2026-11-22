'use client';

import {
  ImagePlus,
  MapPin,
  Mic,
  Paperclip,
  SendHorizontal,
  Smile,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';

import type { ChatSharedLocation } from './chat-types';
import {
  playChatSound,
  playChatSoundAsync,
  prefetchChatSounds,
  unlockChatSounds,
} from './chat-sound-manager';

const EMOJI_SET = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🙂', '😉', '😍', '🥰',
  '😘', '😜', '🤔', '😏', '😌', '😔', '😢', '😭', '😤', '🤯',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '✌️', '👋', '❤️', '🔥',
  '✨', '⭐', '🍕', '🍔', '🌮', '🍟', '🥤', '🍺', '🍰', '🍦',
  '✅', '❌', '💯', '🎉', '🏠', '🚗', '⏰', '📍',
];

export type ChatVoicePayload = {
  blob: Blob;
  url: string;
  durationMs: number;
  transcript?: string;
};

export type ChatFilePayload = {
  file: File;
  url: string;
  kind: 'image' | 'file';
};

type ChatComposerProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onSendVoice?: (payload: ChatVoicePayload) => void;
  onSendFile?: (payload: ChatFilePayload) => void;
  onShareLocation?: (location: ChatSharedLocation) => void;
};

function pickRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/ogg;codecs=opus',
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      /* ignore */
    }
  }
  return '';
}

function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ChatComposer({
  value,
  disabled = false,
  onChange,
  onSend,
  onSendVoice,
  onSendFile,
  onShareLocation,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const emojiPanelId = useId();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState<ChatVoicePayload | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptRef = useRef('');
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const cancelRecordRef = useRef(false);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = '0px';
    node.style.height = `${Math.min(node.scrollHeight, 120)}px`;
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (voiceDraft?.url) URL.revokeObjectURL(voiceDraft.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup draft URL on unmount only
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (disabled || !value.trim() || recording || voiceDraft) return;
      unlockChatSounds();
      playChatSound('messageSent');
      onSend();
      keepComposerFocused();
    }
  }

  function insertEmoji(emoji: string) {
    const node = textareaRef.current;
    if (!node) {
      onChange(`${value}${emoji}`);
      return;
    }
    const start = node.selectionStart ?? value.length;
    const end = node.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${emoji}${value.slice(end)}`;
    onChange(next);
    window.requestAnimationFrame(() => {
      node.focus();
      const pos = start + emoji.length;
      node.setSelectionRange(pos, pos);
    });
  }

  function clearTimersAndRecognition() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
  }

  function micErrorMessage(err: unknown): string {
    const name =
      err && typeof err === 'object' && 'name' in err
        ? String((err as { name?: string }).name || '')
        : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Permiso de micrófono denegado. Actívalo en el candado del navegador y vuelve a intentar.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No encontramos un micrófono en este dispositivo.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'El micrófono está en uso por otra app. Ciérrala e inténtalo de nuevo.';
    }
    if (name === 'SecurityError') {
      return 'Este sitio no puede usar el micrófono (contexto no seguro o política del navegador).';
    }
    return 'No pudimos acceder al micrófono. Revisa el permiso e inténtalo de nuevo.';
  }

  async function startRecording() {
    setVoiceError(null);
    if (disabled || !onSendVoice || voiceDraft) return;
    if (!window.isSecureContext) {
      setVoiceError('El micrófono requiere HTTPS.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceError('Tu navegador no permite grabar audio aquí.');
      return;
    }
    unlockChatSounds();
    // Request mic first (same user-gesture turn) so the browser can show the prompt.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    } catch (err) {
      setVoiceError(micErrorMessage(err));
      return;
    }
    streamRef.current = stream;
    prefetchChatSounds([
      'recordingStart',
      'recordingStop',
      'recordingCancel',
      'voiceSent',
    ]);
    try {
      // Play start cue fully BEFORE MediaRecorder so it is not captured and the
      // user can start speaking as soon as recording UI appears.
      const cueMs = await playChatSoundAsync('recordingStart');
      await new Promise((r) =>
        window.setTimeout(r, Math.max(80, Math.min(cueMs + 40, 280))),
      );
      if (!streamRef.current) return;

      const mime = pickRecorderMime();
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      cancelRecordRef.current = false;
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        const durationMs = Math.max(400, Date.now() - startedAtRef.current);
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mime || 'audio/webm',
        });
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (cancelRecordRef.current) {
          cancelRecordRef.current = false;
          return;
        }
        if (blob.size < 200) {
          setVoiceError('No se capturó audio. Inténtalo de nuevo.');
          return;
        }
        const url = URL.createObjectURL(blob);
        setVoiceDraft({
          blob,
          url,
          durationMs,
          transcript: transcriptRef.current || undefined,
        });
      };
      mediaRef.current = recorder;
      startedAtRef.current = Date.now();
      setRecordMs(0);
      transcriptRef.current = '';
      const SpeechRecognitionCtor =
        (window as unknown as {
          SpeechRecognition?: new () => {
            lang: string;
            continuous: boolean;
            interimResults: boolean;
            onresult:
              | ((ev: {
                  results: ArrayLike<{ 0: { transcript: string } }>;
                }) => void)
              | null;
            onerror: (() => void) | null;
            start: () => void;
            stop: () => void;
          };
          webkitSpeechRecognition?: new () => {
            lang: string;
            continuous: boolean;
            interimResults: boolean;
            onresult:
              | ((ev: {
                  results: ArrayLike<{ 0: { transcript: string } }>;
                }) => void)
              | null;
            onerror: (() => void) | null;
            start: () => void;
            stop: () => void;
          };
        }).SpeechRecognition ||
        (
          window as unknown as {
            webkitSpeechRecognition?: new () => {
              lang: string;
              continuous: boolean;
              interimResults: boolean;
              onresult:
                | ((ev: {
                    results: ArrayLike<{ 0: { transcript: string } }>;
                  }) => void)
                | null;
              onerror: (() => void) | null;
              start: () => void;
              stop: () => void;
            };
          }
        ).webkitSpeechRecognition;
      if (SpeechRecognitionCtor) {
        try {
          const recognition = new SpeechRecognitionCtor();
          recognition.lang = 'es-ES';
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.onresult = (ev) => {
            const parts: string[] = [];
            for (let i = 0; i < ev.results.length; i++) {
              parts.push(ev.results[i][0].transcript);
            }
            transcriptRef.current = parts.join(' ').trim();
          };
          recognition.onerror = () => {};
          recognition.start();
          recognitionRef.current = recognition;
        } catch {
          recognitionRef.current = null;
        }
      }
      recorder.start(250);
      setRecording(true);
      setEmojiOpen(false);
      setAttachOpen(false);
      timerRef.current = window.setInterval(() => {
        setRecordMs(Date.now() - startedAtRef.current);
      }, 200);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setVoiceError(micErrorMessage(err));
    }
  }

  function keepComposerFocused() {
    // Keep soft-keyboard open: readOnly still accepts focus (disabled does not).
    const focus = () => {
      const node = textareaRef.current;
      if (!node) return;
      try {
        node.focus({ preventScroll: true });
      } catch {
        node.focus();
      }
    };
    focus();
    window.requestAnimationFrame(focus);
    window.setTimeout(focus, 0);
  }

  function stopRecording() {
    clearTimersAndRecognition();
    const recorder = mediaRef.current;
    setRecording(false);
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    mediaRef.current = null;
    // After stop so the cue is not inside the recorded blob.
    playChatSound('recordingStop');
  }

  function cancelRecording() {
    cancelRecordRef.current = true;
    clearTimersAndRecognition();
    const recorder = mediaRef.current;
    setRecording(false);
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    mediaRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    chunksRef.current = [];
    playChatSound('recordingCancel');
  }

  function discardVoiceDraft() {
    if (voiceDraft?.url) URL.revokeObjectURL(voiceDraft.url);
    setVoiceDraft(null);
    playChatSound('recordingCancel');
  }

  function confirmVoiceDraft() {
    if (!voiceDraft || !onSendVoice || disabled) return;
    const payload = voiceDraft;
    setVoiceDraft(null);
    unlockChatSounds();
    playChatSound('voiceSent');
    onSendVoice(payload);
  }

  function handleFileChosen(event: ChangeEvent<HTMLInputElement>, kind: 'image' | 'file') {
    const file = event.target.files?.[0];
    event.target.value = '';
    setAttachOpen(false);
    if (!file || !onSendFile || disabled) return;
    const max = kind === 'image' ? 4_000_000 : 4_000_000;
    if (file.size > max) {
      setVoiceError('El archivo es demasiado grande (máx. 4 MB).');
      return;
    }
    const url = URL.createObjectURL(file);
    onSendFile({ file, url, kind: file.type.startsWith('image/') ? 'image' : kind });
  }

  function shareLocation() {
    if (!onShareLocation || disabled || locating) return;
    setAttachOpen(false);
    if (!navigator.geolocation) {
      setVoiceError('Tu navegador no permite compartir ubicación.');
      return;
    }
    setLocating(true);
    setVoiceError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onShareLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          label: 'Ubicación actual',
        });
      },
      () => {
        setLocating(false);
        setVoiceError('No se pudo obtener la ubicación. Revisa los permisos.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  const canSend = !disabled && Boolean(value.trim()) && !recording && !voiceDraft;
  const showMic = !canSend && Boolean(onSendVoice) && !voiceDraft;

  return (
    <form
      className="relative shrink-0 px-2.5 pt-1.5"
      style={{
        backgroundColor: 'var(--chat-composer)',
        paddingBottom: 'max(0.55rem, env(safe-area-inset-bottom))',
      }}
      data-chat-composer="1"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSend) return;
        unlockChatSounds();
        playChatSound('messageSent');
        onSend();
        keepComposerFocused();
      }}
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => handleFileChosen(e, 'image')}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        className="hidden"
        onChange={(e) => handleFileChosen(e, 'file')}
      />

      {voiceError ? (
        <p className="mb-1 px-1 text-[11px] text-rose-500" role="alert">
          {voiceError}
        </p>
      ) : null}

      {voiceDraft ? (
        <div
          className="mx-auto mb-2 flex max-w-3xl items-center gap-2 rounded-2xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] px-3 py-2"
          data-chat-voice-draft="1"
        >
          <audio
            controls
            preload="metadata"
            src={voiceDraft.url}
            className="h-9 min-w-0 flex-1"
          />
          <span className="shrink-0 text-[12px] tabular-nums text-[var(--chat-text-muted)]">
            {formatDuration(voiceDraft.durationMs)}
          </span>
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-rose-600 hover:bg-rose-500/10"
            aria-label="Descartar nota de voz"
            onClick={discardVoiceDraft}
            data-chat-voice-discard="1"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            disabled={disabled}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--chat-send-fg)]"
            style={{ backgroundColor: 'var(--chat-send)' }}
            aria-label="Enviar nota de voz"
            onClick={confirmVoiceDraft}
            data-chat-voice-confirm="1"
          >
            <SendHorizontal className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      ) : null}

      {emojiOpen ? (
        <div
          id={emojiPanelId}
          className="mx-auto mb-2 max-w-3xl overflow-hidden rounded-2xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] p-2 shadow-lg"
          data-chat-emoji-panel="1"
        >
          <div className="grid max-h-44 grid-cols-8 gap-1 overflow-y-auto overscroll-contain touch-manipulation sm:grid-cols-10">
            {EMOJI_SET.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="grid h-11 min-h-[44px] place-items-center rounded-xl text-[22px] active:bg-[color-mix(in_srgb,var(--chat-text)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)]"
                onClick={() => insertEmoji(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {attachOpen ? (
        <div
          className="mx-auto mb-2 flex max-w-3xl flex-wrap gap-2 rounded-2xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] p-2 shadow-lg"
          data-chat-attach-panel="1"
        >
          <button
            type="button"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[13px] font-medium text-[var(--chat-text)] hover:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)]"
            onClick={() => imageInputRef.current?.click()}
            data-chat-attach-image="1"
          >
            <ImagePlus className="h-4 w-4" aria-hidden />
            Imagen
          </button>
          <button
            type="button"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[13px] font-medium text-[var(--chat-text)] hover:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)]"
            onClick={() => fileInputRef.current?.click()}
            data-chat-attach-file="1"
          >
            <Paperclip className="h-4 w-4" aria-hidden />
            Archivo
          </button>
          {onShareLocation ? (
            <button
              type="button"
              disabled={locating}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[13px] font-medium text-[var(--chat-text)] hover:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)] disabled:opacity-50"
              onClick={shareLocation}
              data-chat-attach-location="1"
            >
              <MapPin className="h-4 w-4" aria-hidden />
              {locating ? 'Obteniendo…' : 'Ubicación'}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
        {recording ? (
          <>
            <button
              type="button"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-rose-600 hover:bg-rose-500/10"
              aria-label="Cancelar grabación"
              onClick={cancelRecording}
              data-chat-voice-cancel="1"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            <div
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[24px] px-3 text-[14px] text-rose-600 shadow-sm"
              style={{ backgroundColor: 'var(--chat-input)' }}
              data-chat-voice-recording="1"
            >
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-600" />
              Grabando {Math.floor(recordMs / 1000)}s
            </div>
            <button
              type="button"
              className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full bg-rose-600 px-3 text-white shadow-sm"
              aria-label="Detener grabación"
              onClick={stopRecording}
              data-chat-voice-stop="1"
            >
              <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
            </button>
          </>
        ) : (
          <>
            <div
              className="flex min-h-[44px] flex-1 items-end rounded-[24px] py-1 pl-1 pr-2 shadow-sm"
              style={{ backgroundColor: 'var(--chat-input)' }}
            >
              <button
                type="button"
                className="mb-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--chat-text-muted)] hover:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)]"
                aria-label="Emojis"
                aria-expanded={emojiOpen}
                aria-controls={emojiPanelId}
                disabled={disabled || Boolean(voiceDraft)}
                onClick={() => {
                  setAttachOpen(false);
                  setEmojiOpen((v) => !v);
                }}
                data-chat-emoji-toggle="1"
              >
                <Smile className="h-[22px] w-[22px]" strokeWidth={1.85} aria-hidden />
              </button>
              <button
                type="button"
                className="mb-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--chat-text-muted)] hover:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)]"
                aria-label="Adjuntar"
                aria-expanded={attachOpen}
                disabled={disabled || Boolean(voiceDraft)}
                onClick={() => {
                  setEmojiOpen(false);
                  setAttachOpen((v) => !v);
                }}
                data-chat-attach-toggle="1"
              >
                <Paperclip className="h-[20px] w-[20px]" strokeWidth={1.85} aria-hidden />
              </button>
              <label className="sr-only" htmlFor="chatbot-composer-input">
                Escribe un mensaje
              </label>
              <textarea
                id="chatbot-composer-input"
                ref={textareaRef}
                rows={1}
                value={value}
                // readOnly (not disabled) while sending keeps focus / mobile keyboard open
                readOnly={disabled || Boolean(voiceDraft)}
                aria-disabled={disabled || Boolean(voiceDraft)}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  setEmojiOpen(false);
                  setAttachOpen(false);
                }}
                placeholder="Escribe un mensaje"
                className="max-h-[7.5rem] min-h-[28px] w-full resize-none bg-transparent py-2 text-[15.5px] leading-[1.35] text-[var(--chat-text)] outline-none placeholder:text-[var(--chat-text-muted)] read-only:opacity-60"
                enterKeyHint="send"
                autoComplete="off"
              />
            </div>

            {showMic ? (
              <button
                type="button"
                disabled={disabled}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--chat-send-fg)] shadow-sm transition enabled:hover:brightness-110 disabled:opacity-40"
                style={{ backgroundColor: 'var(--chat-send)' }}
                aria-label="Grabar nota de voz"
                onClick={() => {
                  void startRecording();
                }}
                data-chat-voice-start="1"
              >
                <Mic className="h-[20px] w-[20px]" strokeWidth={2.1} aria-hidden />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--chat-send-fg)] shadow-sm transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-send)]"
                style={{ backgroundColor: 'var(--chat-send)' }}
                aria-label="Enviar mensaje"
              >
                {disabled ? (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                    aria-hidden
                  />
                ) : (
                  <SendHorizontal className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
                )}
              </button>
            )}
          </>
        )}
      </div>
    </form>
  );
}
