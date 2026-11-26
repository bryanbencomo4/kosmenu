'use client';

import {
  Camera,
  ChevronLeft,
  ChevronUp,
  FileText,
  ImagePlus,
  Lock,
  MapPin,
  Mic,
  Paperclip,
  Pause,
  SendHorizontal,
  Smile,
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
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { ChatVoiceNote } from './ChatVoiceNote';
import {
  VOICE_CANCEL_THRESHOLD_PX,
  VOICE_LOCK_THRESHOLD_PX,
  resampleVoiceLevels,
  resolveVoiceHoldSlide,
  resolveVoiceRelease,
} from './chat-gestures';
import type { ChatReplyRef, ChatSharedLocation } from './chat-types';
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
  /** Message being replied to; shows a compact bar above the input. */
  replyTo?: ChatReplyRef | null;
  /** Called when the user dismisses the reply bar (X). */
  onClearReply?: () => void;
  /** Label for who is being replied to (panel: "Cliente" / "Tú"). */
  replyAuthorFallback?: string;
  /** Fires when mic recording starts/stops (e.g. to hide suggested replies). */
  onRecordingChange?: (recording: boolean) => void;
  /** Optional: notify parent that the user is typing (presence). */
  onTypingActivity?: () => void;
  /** Fires when the text field is focused (mobile keyboard → pin chat to bottom). */
  onComposerFocus?: () => void;
  /** Override textarea data-testid (merchant panel uses staff-draft). */
  inputTestId?: string;
  /** Override send button data-testid (merchant panel uses staff-send). */
  sendTestId?: string;
  /** Input placeholder (default WhatsApp-like copy). */
  placeholder?: string;
  /**
   * Prefer formats WhatsApp providers accept (ogg/mp4/aac) over browser-default webm.
   * Used by the platform WA inbox (Wasender rejects audio/webm uploads).
   */
  preferWhatsappVoiceMime?: boolean;
  /** Hide attach control (admin text shell). */
  hideAttach?: boolean;
};

/** Live state of a mic press, kept in a ref so pointer handlers never go stale. */
type VoiceGesture = {
  pointerId: number;
  /** 'mouse' | 'touch' | 'pen': a mouse click toggles hands-free (WhatsApp Web), touch shows the hint. */
  pointerType: string;
  startX: number;
  startY: number;
  startedAt: number;
  /** Max Euclidean distance from the start point (tap detection). */
  maxMovePx: number;
  /** Finger already crossed the lock threshold. */
  lockIntent: boolean;
  /** Finger already lifted (possible before getUserMedia resolves). */
  released: boolean;
  /** Gesture ended (cancelled / locked-and-released / finished). */
  done: boolean;
};

function pickRecorderMime(preferWhatsapp = false): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const whatsappFirst = [
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
    'audio/aac',
    'audio/mpeg',
    'audio/webm;codecs=opus',
    'audio/webm',
  ];
  const browserFirst = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/ogg;codecs=opus',
  ];
  const candidates = preferWhatsapp ? whatsappFirst : browserFirst;
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
  replyTo = null,
  onClearReply,
  replyAuthorFallback,
  onRecordingChange,
  onTypingActivity,
  onComposerFocus,
  inputTestId = 'chat-composer-input',
  sendTestId = 'chat-composer-send',
  placeholder = 'Escribe un mensaje',
  preferWhatsappVoiceMime = false,
  hideAttach = false,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
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

  // --- Voice hold gesture state -------------------------------------------------
  // `voiceLocked`: hands-free mode (Stop / Cancel / Send buttons instead of holding).
  const [voiceLocked, setVoiceLocked] = useState(false);
  // Visual feedback only (cancel tint / lock chip); derived from pointer deltas.
  const [slide, setSlide] = useState({
    cancelProgress: 0,
    lockProgress: 0,
    dx: 0,
    dy: 0,
  });
  // WhatsApp-style feedback: "hold to record" tooltip, mic→trash animation, live input level.
  const [voiceHint, setVoiceHint] = useState(false);
  const [trashing, setTrashing] = useState(false);
  const [levels, setLevels] = useState<number[]>([]);
  const levelsRef = useRef<number[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const levelTimerRef = useRef<number | null>(null);
  const hintTimerRef = useRef<number | null>(null);
  const gestureRef = useRef<VoiceGesture | null>(null);
  const micButtonRef = useRef<HTMLButtonElement | null>(null);
  /** Bumped on every start/cancel so stale async startRecording() calls bail out. */
  const startTokenRef = useRef(0);
  const voiceLockedRef = useRef(false);
  /** When true the recorder's onstop sends immediately instead of showing the draft. */
  const sendAfterStopRef = useRef(false);
  /** Last pointerdown on the mic; used to ignore the synthetic click that follows. */
  const lastMicPointerDownRef = useRef(0);
  // Latest props for async recorder callbacks (avoid stale closures).
  const onSendVoiceRef = useRef(onSendVoice);
  const disabledRef = useRef(disabled);
  onSendVoiceRef.current = onSendVoice;
  disabledRef.current = disabled;
  /** True when browser SpeechRecognition was started for the current recording. */
  const recognitionUsedRef = useRef(false);

  const onRecordingChangeRef = useRef(onRecordingChange);
  onRecordingChangeRef.current = onRecordingChange;
  useEffect(() => {
    onRecordingChangeRef.current?.(recording);
  }, [recording]);

  /**
   * Browser STT keeps delivering results briefly after the recorder stops, so the
   * payload built in `onstop` can be stale. Always re-read `transcriptRef` right
   * before handing the payload to the parent (draft confirm AND locked "Send").
   */
  function withLatestTranscript(payload: ChatVoicePayload): ChatVoicePayload {
    const latest = transcriptRef.current.trim();
    const prior = payload.transcript?.trim() || '';
    const best = latest.length >= prior.length ? latest : prior;
    return { ...payload, transcript: best || undefined };
  }

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    // Empty → back to the CSS one-line height (never carry a previous multi-line height over).
    if (!value) {
      node.style.height = '';
      return;
    }
    node.style.height = 'auto';
    node.style.height = `${Math.max(36, Math.min(node.scrollHeight, 120))}px`;
  }, [value]);

  // Focus the input when a reply target is picked (keeps keyboard flow natural).
  const replyMessageId = replyTo?.messageId ?? null;
  useEffect(() => {
    if (!replyMessageId) return;
    const node = textareaRef.current;
    if (!node) return;
    try {
      node.focus({ preventScroll: true });
    } catch {
      node.focus();
    }
  }, [replyMessageId]);

  useEffect(() => {
    return () => {
      // Abort any in-flight start and silently discard an active recording
      // (no sound, no draft). Pointer handlers are React props, so nothing else leaks.
      startTokenRef.current += 1;
      cancelRecordRef.current = true;
      gestureRef.current = null;
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
      if (levelTimerRef.current) window.clearInterval(levelTimerRef.current);
      try {
        void audioCtxRef.current?.close();
      } catch {
        /* ignore */
      }
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      const recorder = mediaRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
      }
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

  function vibrate(pattern: number | number[]) {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* not supported (iOS) */
    }
  }

  /** WhatsApp's tooltip after a too-short press: you must HOLD, and releasing sends. */
  function showVoiceHint() {
    setVoiceHint(true);
    if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(() => setVoiceHint(false), 3000);
  }

  function stopLevelMeter() {
    if (levelTimerRef.current) {
      window.clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
    }
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx) {
      try {
        void ctx.close();
      } catch {
        /* ignore */
      }
    }
  }

  /** Samples the mic level ~11×/s for the live waveform shown once the recording is locked. */
  function startLevelMeter(stream: MediaStream) {
    stopLevelMeter();
    levelsRef.current = [];
    setLevels([]);
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      audioCtxRef.current = ctx;
      levelTimerRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i += 1) {
          const d = (buf[i] - 128) / 128;
          sum += d * d;
        }
        const level = Math.min(1, Math.sqrt(sum / buf.length) * 4.5);
        const next = [...levelsRef.current, level].slice(-60);
        levelsRef.current = next;
        if (voiceLockedRef.current) setLevels(next);
      }, 90);
    } catch {
      stopLevelMeter();
    }
  }

  function clearTimersAndRecognition() {
    stopLevelMeter();
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

  /**
   * Starts mic capture. Shared by the hold gesture (pointerdown) and the keyboard /
   * assistive-tech click path.
   *
   * `startLocked`: begin in hands-free mode (keyboard/AT click, or tap-to-toggle).
   * Even for a hold, we switch to locked mode when the finger already lifted (or
   * slid up) before the recorder became ready — e.g. while the browser mic prompt
   * was showing — so the user never ends up with a dead, un-stoppable recording.
   *
   * Returns false when recording did not begin (error, aborted, unsupported).
   */
  async function startRecording(startLocked = false): Promise<boolean> {
    setVoiceError(null);
    if (disabled || !onSendVoice || voiceDraft) return false;
    if (!window.isSecureContext) {
      setVoiceError('El micrófono requiere HTTPS.');
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceError('Tu navegador no permite grabar audio aquí.');
      return false;
    }
    const token = ++startTokenRef.current;
    unlockChatSounds();
    // Request mic first (same user-gesture turn) so the browser can show the prompt.
    let stream: MediaStream;
    const gumStartedAt = Date.now();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    } catch (err) {
      if (token === startTokenRef.current) {
        gestureRef.current = null;
        setVoiceError(micErrorMessage(err));
      }
      return false;
    }
    if (token !== startTokenRef.current) {
      // Cancelled (slide-left / unmount / newer start) while awaiting permission.
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    // A touch press that ended before we were even ready (mic already allowed, so no
    // permission prompt ate the gesture) is a plain tap: WhatsApp shows the hint, no recording.
    const promptedForPermission = Date.now() - gumStartedAt > 600;
    const wasQuickTouchTap = () => {
      const g = gestureRef.current;
      return Boolean(
        g &&
          g.released &&
          !g.lockIntent &&
          !startLocked &&
          g.pointerType !== 'mouse' &&
          !promptedForPermission,
      );
    };
    if (wasQuickTouchTap()) {
      stream.getTracks().forEach((t) => t.stop());
      gestureRef.current = null;
      showVoiceHint();
      return false;
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
      if (token !== startTokenRef.current || !streamRef.current) {
        // Cancelled during the start cue: release the mic and bail quietly.
        stream.getTracks().forEach((t) => t.stop());
        if (streamRef.current === stream) streamRef.current = null;
        return false;
      }
      if (wasQuickTouchTap()) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        gestureRef.current = null;
        showVoiceHint();
        return false;
      }

      const mime = pickRecorderMime(preferWhatsappVoiceMime);
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
        const sendNow = sendAfterStopRef.current;
        sendAfterStopRef.current = false;
        if (cancelRecordRef.current) {
          cancelRecordRef.current = false;
          return;
        }
        if (blob.size < 200) {
          setVoiceError('No se capturó audio. Inténtalo de nuevo.');
          return;
        }
        const url = URL.createObjectURL(blob);
        const payload: ChatVoicePayload = {
          blob,
          url,
          durationMs,
          transcript: transcriptRef.current || undefined,
        };
        // Locked-mode "Enviar": skip the preview and send straight away.
        // Uses refs because this callback outlives the render that created it.
        if (sendNow && onSendVoiceRef.current && !disabledRef.current) {
          unlockChatSounds();
          playChatSound('voiceSent');
          const deliver = () => {
            const send = onSendVoiceRef.current;
            if (send) send(withLatestTranscript(payload));
          };
          // Give browser STT a beat to flush its final result before sending.
          if (recognitionUsedRef.current) window.setTimeout(deliver, 300);
          else deliver();
          return;
        }
        // Default (hold-release / stop): preview first, user confirms with Send.
        setVoiceDraft(payload);
      };
      mediaRef.current = recorder;
      startedAtRef.current = Date.now();
      setRecordMs(0);
      transcriptRef.current = '';
      recognitionUsedRef.current = false;
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
          recognitionUsedRef.current = true;
        } catch {
          recognitionRef.current = null;
        }
      }
      recorder.start(250);
      // Lock when asked to (tap/keyboard), when the finger already slid up, or when
      // it already lifted before we were ready (see doc comment above).
      const g = gestureRef.current;
      const lockNow = startLocked || !g || g.released || g.lockIntent;
      sendAfterStopRef.current = false;
      voiceLockedRef.current = lockNow;
      setVoiceLocked(lockNow);
      if (lockNow) {
        setSlide({ cancelProgress: 0, lockProgress: 0, dx: 0, dy: 0 });
        if (g) g.done = true;
      }
      setRecording(true);
      setVoiceHint(false);
      setEmojiOpen(false);
      setAttachOpen(false);
      vibrate(14);
      startLevelMeter(stream);
      timerRef.current = window.setInterval(() => {
        setRecordMs(Date.now() - startedAtRef.current);
      }, 200);
      return true;
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      gestureRef.current = null;
      setVoiceError(micErrorMessage(err));
      return false;
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

  function resetVoiceGestureUi() {
    voiceLockedRef.current = false;
    setVoiceLocked(false);
    setSlide({ cancelProgress: 0, lockProgress: 0, dx: 0, dy: 0 });
  }

  /** Stop → existing voiceDraft preview (or, with `sendNow`, send directly). */
  function stopRecording(opts?: { sendNow?: boolean }) {
    clearTimersAndRecognition();
    const recorder = mediaRef.current;
    setRecording(false);
    resetVoiceGestureUi();
    gestureRef.current = null;
    sendAfterStopRef.current = Boolean(opts?.sendNow);
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    mediaRef.current = null;
    // After stop so the cue is not inside the recorded blob. Skipped when sending
    // right away so it doesn't overlap the "voiceSent" cue.
    if (!opts?.sendNow) playChatSound('recordingStop');
  }

  /** Discards the recording (or an in-flight start) and plays the cancel cue. */
  function cancelRecording(opts?: { quiet?: boolean }) {
    // Invalidate a pending startRecording() still awaiting mic permission / start cue.
    startTokenRef.current += 1;
    cancelRecordRef.current = true;
    sendAfterStopRef.current = false;
    gestureRef.current = null;
    clearTimersAndRecognition();
    const recorder = mediaRef.current;
    const wasRecording = Boolean(recorder && recorder.state === 'recording');
    if (wasRecording && !opts?.quiet) {
      // The red mic drops into the trash can, like WhatsApp.
      vibrate([8, 30, 8]);
      setTrashing(true);
      window.setTimeout(() => setTrashing(false), 800);
    }
    setRecording(false);
    resetVoiceGestureUi();
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
    if (!opts?.quiet) playChatSound('recordingCancel');
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
    onSendVoice(withLatestTranscript(payload));
  }

  // --- Mic press-and-hold gesture ----------------------------------------------
  // Pointer Events + pointer capture on the mic button (touch-action: none on that
  // button only, so the rest of the chat still scrolls). Flow:
  //   pointerdown → getUserMedia → recording UI (hold mode)
  //   slide left  ≥ VOICE_CANCEL_THRESHOLD_PX → cancel + discard
  //   slide up    ≥ VOICE_LOCK_THRESHOLD_PX   → locked (Stop / Cancel / Send)
  //   release (no cancel/lock)                → stop → voiceDraft preview
  //   tap < 200ms w/o movement, or release before the recorder is ready (permission
  //   prompt / start cue) → locked "toggle" mode so it can never get stuck.
  // The synthetic click after a pointer press is ignored (detail > 0); keyboard and
  // assistive-tech activation (click with detail === 0) starts locked recording, so
  // a non-gesture path always exists. The mic stays mounted while holding — if it
  // unmounted, pointer capture (and the pointerup) would be lost.

  function releaseMicCapture(pointerId: number) {
    try {
      micButtonRef.current?.releasePointerCapture(pointerId);
    } catch {
      /* ignore */
    }
  }

  function lockActiveRecording() {
    vibrate(20);
    voiceLockedRef.current = true;
    setVoiceLocked(true);
    setSlide({ cancelProgress: 0, lockProgress: 0, dx: 0, dy: 0 });
  }

  function handleMicPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled || !onSendVoice || voiceDraft || recording) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (gestureRef.current && !gestureRef.current.done) return;
    // Keep the textarea/keyboard state untouched and avoid emulated mouse events.
    event.preventDefault();
    lastMicPointerDownRef.current = Date.now();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    const gesture: VoiceGesture = {
      pointerId: event.pointerId,
      pointerType: event.pointerType || 'touch',
      startX: event.clientX,
      startY: event.clientY,
      startedAt: Date.now(),
      maxMovePx: 0,
      lockIntent: false,
      released: false,
      done: false,
    };
    gestureRef.current = gesture;
    setSlide({ cancelProgress: 0, lockProgress: 0, dx: 0, dy: 0 });
    void startRecording(false).then((started) => {
      // Start refused (error / unsupported): drop the gesture so the next press works.
      if (!started && gestureRef.current === gesture) gestureRef.current = null;
    });
  }

  function handleMicPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const g = gestureRef.current;
    if (!g || g.done || g.pointerId !== event.pointerId || g.lockIntent) return;
    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    g.maxMovePx = Math.max(g.maxMovePx, Math.hypot(dx, dy));
    const result = resolveVoiceHoldSlide(dx, dy);
    if (result.intent === 'cancel') {
      g.done = true;
      releaseMicCapture(event.pointerId);
      cancelRecording(); // also aborts a start that is still pending
      return;
    }
    if (result.intent === 'lock') {
      g.lockIntent = true;
      releaseMicCapture(event.pointerId);
      const recorder = mediaRef.current;
      if (recorder && recorder.state === 'recording') {
        // Already recording: lock now; the later pointerup is a no-op.
        gestureRef.current = null;
        lockActiveRecording();
      }
      // else: startRecording() sees lockIntent and starts in locked mode.
      return;
    }
    setSlide({
      cancelProgress: result.cancelProgress,
      lockProgress: result.lockProgress,
      dx,
      dy,
    });
  }

  function handleMicPointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const g = gestureRef.current;
    if (!g || g.pointerId !== event.pointerId) return;
    releaseMicCapture(event.pointerId);
    if (g.done) {
      gestureRef.current = null;
      return;
    }
    const recorder = mediaRef.current;
    if (!recorder || recorder.state !== 'recording') {
      // Released before the recorder is ready → it will start in locked mode.
      g.released = true;
      return;
    }
    gestureRef.current = null;
    // WhatsApp: letting go SENDS the note. Too short on touch → "hold to record" hint;
    // a quick mouse click toggles hands-free mode (WhatsApp Web).
    const action = resolveVoiceRelease({
      recordedMs: Date.now() - startedAtRef.current,
      movedPx: g.maxMovePx,
      pointerType: g.pointerType,
    });
    if (action === 'lock') {
      lockActiveRecording();
      return;
    }
    if (action === 'hint') {
      cancelRecording({ quiet: true });
      showVoiceHint();
      return;
    }
    stopRecording({ sendNow: true });
  }

  function handleMicClick(event: ReactMouseEvent<HTMLButtonElement>) {
    // Mouse/touch presses are fully handled by pointer events above.
    if (event.detail !== 0) return;
    if (Date.now() - lastMicPointerDownRef.current < 400) return;
    if (disabled || recording) return;
    void startRecording(true);
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
  const holdRecording = recording && !voiceLocked;
  const lockedRecording = recording && voiceLocked;
  const cancelTint = Math.round(slide.cancelProgress * 38);
  const micOffsetX = holdRecording ? Math.max(slide.dx, -VOICE_CANCEL_THRESHOLD_PX) : 0;
  const micOffsetY = holdRecording ? Math.max(slide.dy, -VOICE_LOCK_THRESHOLD_PX) : 0;

  return (
    <form
      className="relative z-20 shrink-0 px-1.5 pt-1"
      style={{
        backgroundColor: 'var(--chat-composer)',
        paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))',
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
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileChosen(e, 'image')}
        data-chat-camera-input="1"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        className="hidden"
        onChange={(e) => handleFileChosen(e, 'file')}
      />

      {replyTo ? (
        <div
          className="mx-auto mb-1.5 flex w-full max-w-5xl items-center gap-2 overflow-hidden rounded-xl border-l-[3px] border-[var(--chat-send)] bg-[var(--chat-input)] py-1 pl-2.5 pr-1 shadow-sm"
          data-chat-reply-bar="1"
          data-chat-reply-id={replyTo.messageId}
          data-chat-reply-kind={replyTo.kind || 'text'}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-semibold leading-tight text-[var(--chat-send)]">
              {replyTo.authorLabel?.trim() ||
                replyAuthorFallback ||
                (replyTo.role === 'user' ? 'Tú' : 'Asistente')}
            </p>
            <p className="mt-0.5 flex items-center gap-1 line-clamp-1 break-words text-[12.5px] leading-snug text-[var(--chat-text-muted)]">
              {replyTo.kind === 'audio' ? (
                <Mic className="h-3 w-3 shrink-0" aria-hidden />
              ) : null}
              {replyTo.kind === 'file' ? (
                <FileText className="h-3 w-3 shrink-0" aria-hidden />
              ) : null}
              <span className="min-w-0 truncate">{replyTo.preview}</span>
            </p>
          </div>
          {replyTo.kind === 'image' && replyTo.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={replyTo.thumbUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded object-cover"
            />
          ) : null}
          {onClearReply ? (
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--chat-text-muted)] hover:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)]"
              aria-label="Cancelar respuesta"
              onClick={onClearReply}
              data-chat-reply-clear="1"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}

      {voiceError ? (
        <p className="mb-1 px-1 text-[11px] text-rose-500" role="alert">
          {voiceError}
        </p>
      ) : null}

      {voiceDraft ? (
        <div
          className="mx-auto mb-2 flex max-w-5xl items-center gap-2 rounded-2xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] px-3 py-2"
          data-chat-voice-draft="1"
        >
          {/* Same bubble player the chat uses, so the preview already looks like WhatsApp. */}
          <div className="min-w-0 flex-1">
            <ChatVoiceNote src={voiceDraft.url} durationMs={voiceDraft.durationMs} />
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--chat-text-muted)] hover:bg-rose-500/10 hover:text-rose-600"
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
          className="mx-auto mb-2 max-w-5xl overflow-hidden rounded-2xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] p-2 shadow-lg"
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
          className="mx-auto mb-2 flex max-w-5xl flex-wrap gap-2 rounded-2xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] p-2 shadow-lg"
          data-chat-attach-panel="1"
        >
          {onSendFile ? (
            <>
              <button
                type="button"
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[13px] font-medium text-[var(--chat-text)] hover:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)]"
                onClick={() => {
                  setAttachOpen(false);
                  cameraInputRef.current?.click();
                }}
                data-chat-attach-camera="1"
              >
                <Camera className="h-4 w-4" aria-hidden />
                Cámara
              </button>
              <button
                type="button"
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[13px] font-medium text-[var(--chat-text)] hover:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)]"
                onClick={() => {
                  setAttachOpen(false);
                  imageInputRef.current?.click();
                }}
                data-chat-attach-image="1"
              >
                <ImagePlus className="h-4 w-4" aria-hidden />
                Galería
              </button>
              <button
                type="button"
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[13px] font-medium text-[var(--chat-text)] hover:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)]"
                onClick={() => {
                  setAttachOpen(false);
                  fileInputRef.current?.click();
                }}
                data-chat-attach-file="1"
              >
                <Paperclip className="h-4 w-4" aria-hidden />
                Archivo
              </button>
            </>
          ) : null}
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
          {!onSendFile && !onShareLocation ? (
            <p className="w-full px-2 py-2 text-center text-[12px] text-[var(--chat-text-muted)]">
              Únete al chat para enviar fotos o archivos.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="relative mx-auto flex w-full max-w-5xl items-center gap-1.5">
        {lockedRecording ? (
          // Locked (hands-free), like WhatsApp: trash → discard, live waveform + timer,
          // pause → preview, send → send now.
          <>
            <button
              type="button"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--chat-text-muted)] hover:bg-rose-500/10 hover:text-rose-600"
              aria-label="Cancelar grabación"
              onClick={() => cancelRecording()}
              data-chat-voice-cancel="1"
            >
              <Trash2 className="h-5 w-5" aria-hidden />
            </button>
            <div
              className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 rounded-[24px] px-3.5 text-[14px] shadow-sm"
              style={{ backgroundColor: 'var(--chat-input)' }}
              data-chat-voice-recording="1"
              data-chat-voice-mode="locked"
              role="status"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-600"
                style={{ animation: 'wa-voice-dot 1s ease-in-out infinite' }}
              />
              <span className="shrink-0 tabular-nums text-[var(--chat-text)]">
                <span className="sr-only">Grabando </span>
                {formatDuration(recordMs)}
              </span>
              <div
                className="flex h-6 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden"
                data-chat-voice-live-wave="1"
                aria-hidden
              >
                {resampleVoiceLevels(levels.slice(-40), 40).map((level, i) => (
                  <span
                    key={i}
                    className="w-[3px] shrink-0 rounded-full"
                    style={{
                      height: `${Math.round(14 + level * 86)}%`,
                      backgroundColor: 'color-mix(in srgb, var(--chat-text-muted) 85%, transparent)',
                    }}
                  />
                ))}
              </div>
            </div>
            <button
              type="button"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-rose-600 text-rose-600 hover:bg-rose-500/10"
              aria-label="Pausar grabación y revisar"
              onClick={() => stopRecording()}
              data-chat-voice-stop="1"
            >
              <Pause className="h-4 w-4 fill-current" strokeWidth={0} aria-hidden />
            </button>
            <button
              type="button"
              disabled={disabled}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--chat-send-fg)] shadow-sm disabled:opacity-40"
              style={{ backgroundColor: 'var(--chat-send)' }}
              aria-label="Detener y enviar nota de voz"
              onClick={() => stopRecording({ sendNow: true })}
              data-chat-voice-send-locked="1"
            >
              <SendHorizontal className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
            </button>
          </>
        ) : (
          <>
            {holdRecording ? (
              <div
                key="pane-recording"
                className="flex min-h-[44px] min-w-0 flex-1 select-none items-center gap-2 overflow-hidden rounded-[24px] px-3 text-[14px] text-rose-600 shadow-sm"
                style={{
                  backgroundColor: `color-mix(in srgb, rgb(244 63 94) ${cancelTint}%, var(--chat-input))`,
                }}
                data-chat-voice-recording="1"
                data-chat-voice-mode="hold"
                data-chat-voice-cancel-progress={slide.cancelProgress.toFixed(2)}
                role="status"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-600"
                  style={{ animation: 'wa-voice-dot 1s ease-in-out infinite' }}
                />
                <span className="shrink-0 tabular-nums text-[var(--chat-text)]">
                  <span className="sr-only">Grabando </span>
                  {formatDuration(recordMs)}
                </span>
                {/* "‹ Desliza para cancelar" follows the finger and fades as you near the trash. */}
                <span
                  className="flex min-w-0 flex-1 items-center justify-center gap-0.5 whitespace-nowrap text-[14px]"
                  style={{
                    transform: `translateX(${Math.round(micOffsetX * 0.6)}px)`,
                    opacity: 1 - slide.cancelProgress * 0.85,
                    color: 'var(--chat-text-muted)',
                  }}
                  data-chat-voice-hints="1"
                >
                  <ChevronLeft
                    className="h-4 w-4 shrink-0"
                    aria-hidden
                    style={{ animation: 'wa-voice-shimmer 1.4s ease-in-out infinite' }}
                  />
                  <span className="truncate">Desliza para cancelar</span>
                </span>
              </div>
            ) : trashing ? (
              <div
                key="pane-trash"
                className="flex min-h-[44px] min-w-0 flex-1 select-none items-center gap-3 rounded-[24px] px-3 shadow-sm"
                style={{ backgroundColor: 'var(--chat-input)' }}
                data-chat-voice-trash="1"
                aria-hidden
              >
                <span className="relative grid h-7 w-7 place-items-center text-rose-600">
                  <Mic
                    className="absolute h-5 w-5"
                    style={{ animation: 'wa-voice-mic-drop 0.7s ease-in forwards' }}
                  />
                  <Trash2
                    className="h-6 w-6"
                    style={{ animation: 'wa-voice-trash-open 0.7s ease-in-out' }}
                  />
                </span>
                <span className="tabular-nums text-[14px] text-[var(--chat-text-muted)]">0:00</span>
              </div>
            ) : (
            <div
              key="pane-input"
              className="flex min-h-[40px] flex-1 items-center rounded-full border-0 py-0 pl-0.5 pr-1 outline-none ring-0 focus-within:outline-none focus-within:ring-0"
              style={{ backgroundColor: 'var(--chat-input)' }}
              data-chat-composer-input-shell="1"
            >
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--chat-text-muted)] hover:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)]"
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
                <Smile className="h-[20px] w-[20px]" strokeWidth={1.85} aria-hidden />
              </button>
              <label className="sr-only" htmlFor="chatbot-composer-input">
                Escribe un mensaje
              </label>
              <textarea
                id="chatbot-composer-input"
                data-testid={inputTestId}
                ref={textareaRef}
                rows={1}
                value={value}
                // readOnly (not disabled) while sending keeps focus / mobile keyboard open
                readOnly={disabled || Boolean(voiceDraft)}
                aria-disabled={disabled || Boolean(voiceDraft)}
                onChange={(event) => {
                  onChange(event.target.value);
                  if (event.target.value.trim()) onTypingActivity?.();
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  setEmojiOpen(false);
                  setAttachOpen(false);
                  onComposerFocus?.();
                }}
                placeholder={placeholder}
                className="max-h-[7.5rem] min-h-[36px] w-full resize-none bg-transparent py-1.5 text-[16px] leading-5 text-[var(--chat-text)] caret-[var(--chat-send)] outline-none ring-0 placeholder:text-[var(--chat-text-muted)] read-only:opacity-60 focus:outline-none focus:ring-0 focus-visible:outline-none"
                style={{ outline: 'none', boxShadow: 'none', WebkitTapHighlightColor: 'transparent' }}
                enterKeyHint="send"
                autoComplete="off"
                autoCorrect="off"
                spellCheck
              />
              {/* Attach sits on the right inside the pill, like WhatsApp. */}
              {hideAttach ? null : (
                <button
                  type="button"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--chat-text-muted)] hover:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)]"
                  aria-label="Adjuntar"
                  aria-expanded={attachOpen}
                  disabled={disabled || Boolean(voiceDraft)}
                  onClick={() => {
                    setEmojiOpen(false);
                    setAttachOpen((v) => !v);
                  }}
                  data-chat-attach-toggle="1"
                >
                  <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.85} aria-hidden />
                </button>
              )}
            </div>
            )}

            {showMic ? (
              <>
                {holdRecording ? (
                  // Lock target: the mic slides up into this chip while holding.
                  <span
                    aria-hidden
                    className="pointer-events-none absolute bottom-full right-0 mb-5 flex h-[4.25rem] w-11 flex-col items-center justify-start gap-1 rounded-full pt-2.5 shadow-md"
                    style={{
                      backgroundColor: 'var(--chat-card)',
                      opacity: 0.75 + 0.25 * slide.lockProgress,
                      color:
                        slide.lockProgress > 0.6 ? 'var(--chat-send)' : 'var(--chat-text-muted)',
                    }}
                    data-chat-voice-lock-chip="1"
                  >
                    <Lock className="h-4 w-4" strokeWidth={2.2} />
                    <ChevronUp
                      className="h-4 w-4"
                      strokeWidth={2.4}
                      style={{ animation: 'wa-voice-lock-nudge 1.1s ease-in-out infinite' }}
                    />
                  </span>
                ) : null}
                {voiceHint ? (
                  <div
                    role="status"
                    className="pointer-events-none absolute bottom-full right-0 mb-2 max-w-[17rem] rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug text-white shadow-lg"
                    style={{ backgroundColor: 'rgba(32, 44, 51, 0.96)', animation: 'chat-sheet-in 0.18s ease-out' }}
                    data-chat-voice-tip="1"
                  >
                    Mantén presionado para grabar un mensaje de voz, suelta para enviar
                  </div>
                ) : null}
                <button
                  key="mic"
                  ref={micButtonRef}
                  type="button"
                  disabled={disabled}
                  className={[
                    'relative z-10 inline-flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full text-[var(--chat-send-fg)] shadow-sm transition-transform enabled:hover:brightness-110 disabled:opacity-40',
                    // Only the mic opts out of browser panning, so chat scroll stays native elsewhere.
                    'touch-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]',
                  ].join(' ')}
                  style={{
                    // Like WhatsApp: the mic keeps its colour, grows and pulses while held.
                    backgroundColor: 'var(--chat-send)',
                    transform: holdRecording
                      ? `translate(${micOffsetX}px, ${micOffsetY}px) scale(1.5)`
                      : undefined,
                  }}
                  aria-label={holdRecording ? 'Grabando nota de voz' : 'Grabar nota de voz'}
                  aria-describedby={`${emojiPanelId}-mic-hint`}
                  onPointerDown={handleMicPointerDown}
                  onPointerMove={handleMicPointerMove}
                  onPointerUp={handleMicPointerEnd}
                  onPointerCancel={handleMicPointerEnd}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={handleMicClick}
                  data-chat-voice-start="1"
                >
                  {holdRecording ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-full"
                      style={{
                        backgroundColor: 'var(--chat-send)',
                        animation: 'wa-voice-halo 1.2s ease-out infinite',
                      }}
                    />
                  ) : null}
                  <Mic className="relative h-[20px] w-[20px]" strokeWidth={2.1} aria-hidden />
                </button>
                <span id={`${emojiPanelId}-mic-hint`} className="sr-only">
                  Mantén presionado para grabar y suelta para enviar. Desliza a la izquierda
                  para cancelar o hacia arriba para bloquear. Con teclado, actívalo para grabar
                  y usa los botones Cancelar, Pausar o Enviar.
                </span>
              </>
            ) : (
              <button
                key="send"
                type="submit"
                disabled={!canSend}
                data-testid={sendTestId}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--chat-send-fg)] shadow-sm transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--chat-send)]"
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
