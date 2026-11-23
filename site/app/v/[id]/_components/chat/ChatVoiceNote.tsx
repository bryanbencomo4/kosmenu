'use client';

import { Mic, Pause, Play } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type ChatVoiceNoteProps = {
  src: string | null | undefined;
  durationMs?: number;
  pending?: boolean;
  /** Incoming = left bubble avatar; outgoing = no avatar. */
  incoming?: boolean;
  avatarUrl?: string | null;
  avatarLetter?: string;
};

const BAR_COUNT = 28;

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Deterministic fake waveform heights (0.2–1) from a seed. */
function waveformBars(seed: string, count: number): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const n = (h % 1000) / 1000;
    out.push(0.22 + n * 0.78);
  }
  return out;
}

export function ChatVoiceNote({
  src,
  durationMs = 0,
  pending = false,
  incoming = false,
  avatarUrl = null,
  avatarLetter = '?',
}: ChatVoiceNoteProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [knownDurationMs, setKnownDurationMs] = useState(durationMs);

  const bars = useMemo(
    () => waveformBars(src || String(durationMs), BAR_COUNT),
    [src, durationMs],
  );

  useEffect(() => {
    setKnownDurationMs(durationMs > 0 ? durationMs : 0);
  }, [durationMs, src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentMs(audio.currentTime * 1000);
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setKnownDurationMs(audio.duration * 1000);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setCurrentMs(0);
      audio.currentTime = 0;
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
    };
  }, [src]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (audio.paused) {
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [src]);

  const totalMs = knownDurationMs > 0 ? knownDurationMs : durationMs;
  const progress = totalMs > 0 ? Math.min(1, currentMs / totalMs) : 0;
  const displayMs = playing || currentMs > 0 ? currentMs : totalMs;

  if (pending) {
    return (
      <div
        className="flex min-h-10 w-full min-w-[14rem] max-w-[17.5rem] items-center gap-2.5"
        data-chat-voice="1"
        data-chat-voice-pending="1"
        role="status"
        aria-live="polite"
        aria-label="Procesando nota de voz"
      >
        <span
          className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[var(--chat-text-muted)] border-t-[var(--chat-send)]"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-tight text-[var(--chat-text)]">
            Nota de voz
          </p>
          <p className="truncate text-[11px] leading-tight text-[var(--chat-text-muted)]">
            Procesando…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex w-full min-w-[14rem] max-w-[17.5rem] items-center gap-2"
      data-chat-voice="1"
      data-chat-voice-incoming={incoming ? '1' : '0'}
    >
      <audio ref={audioRef} src={src || undefined} preload="metadata" className="hidden" />

      <button
        type="button"
        onClick={toggle}
        disabled={!src}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--chat-text-muted)] transition enabled:hover:bg-[color-mix(in_srgb,var(--chat-text)_10%,transparent)] disabled:opacity-40"
        aria-label={playing ? 'Pausar nota de voz' : 'Reproducir nota de voz'}
        data-chat-voice-play="1"
      >
        {playing ? (
          <Pause className="h-5 w-5 fill-current" strokeWidth={0} />
        ) : (
          <Play className="h-5 w-5 fill-current" strokeWidth={0} />
        )}
      </button>

      <div className="min-w-0 flex-1 py-0.5">
        <div
          className="relative flex h-7 items-end gap-[2px]"
          data-chat-voice-wave="1"
          role="img"
          aria-label="Forma de onda de audio"
        >
          {bars.map((h, i) => {
            const filled = i / bars.length <= progress;
            return (
              <span
                key={i}
                className="w-[3px] flex-1 rounded-full"
                style={{
                  height: `${Math.round(h * 100)}%`,
                  backgroundColor: filled
                    ? 'var(--chat-link)'
                    : 'color-mix(in srgb, var(--chat-text-muted) 70%, transparent)',
                }}
              />
            );
          })}
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[var(--chat-link)] shadow-sm"
            style={{
              left: `calc(${progress * 100}% - 5px)`,
            }}
            data-chat-voice-scrubber="1"
          />
        </div>
        <p className="mt-0.5 text-[11px] tabular-nums leading-none text-[var(--chat-text-muted)]">
          {formatDuration(displayMs)}
        </p>
      </div>

      {incoming ? (
        <div
          className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[var(--chat-input)]"
          data-chat-voice-avatar="1"
          aria-hidden
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-[12px] font-semibold text-[var(--chat-text-muted)]">
              {(avatarLetter || '?').slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="absolute -bottom-0.5 -left-0.5 grid h-4 w-4 place-items-center rounded-full bg-[var(--chat-link)] text-white ring-2 ring-[var(--chat-bubble-in)]">
            <Mic className="h-2.5 w-2.5" strokeWidth={2.5} />
          </span>
        </div>
      ) : null}
    </div>
  );
}
