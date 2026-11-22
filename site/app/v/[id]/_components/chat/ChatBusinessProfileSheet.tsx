'use client';

import { MapPin, MessageCircle, X } from 'lucide-react';
import { useEffect } from 'react';

import type { ChatHoursSnapshot } from './chat-hours';
import type { ChatBusinessLocation } from './chat-location';

export type ChatBusinessProfile = {
  name: string;
  logoUrl: string | null;
  initialLetter: string;
  address: string | null;
  whatsappUrl: string | null;
  whatsappDisplay: string | null;
  location: ChatBusinessLocation | null;
  hours: ChatHoursSnapshot | null;
};

type ChatBusinessProfileSheetProps = {
  profile: ChatBusinessProfile | null;
  open: boolean;
  onClose: () => void;
  onOpenAvatar?: (src: string, alt: string) => void;
};

export function ChatBusinessProfileSheet({
  profile,
  open,
  onClose,
  onOpenAvatar,
}: ChatBusinessProfileSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !profile) return null;

  const status = profile.hours?.status.caption.replace(/^[🟢🔴]\s*/, '') || null;

  return (
    <div
      className="absolute inset-0 z-[85] flex flex-col"
      data-chat-profile-sheet="1"
      role="dialog"
      aria-modal="true"
      aria-label={`Perfil de ${profile.name}`}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div
        className="relative z-10 mt-auto max-h-[min(92%,40rem)] overflow-y-auto rounded-t-[1.35rem] shadow-2xl"
        style={{
          backgroundColor: 'var(--chat-card)',
          color: 'var(--chat-text)',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex items-center justify-between px-3 pb-1 pt-3">
          <p className="px-1 text-[13px] font-medium text-[var(--chat-text-muted)]">
            Info del negocio
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--chat-text-muted)] hover:bg-[color-mix(in_srgb,var(--chat-text)_8%,transparent)]"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        <div className="flex flex-col items-center px-4 pb-4 pt-2">
          <button
            type="button"
            className="relative h-28 w-28 overflow-hidden rounded-full bg-[var(--chat-input)] ring-2 ring-[var(--chat-card-border)]"
            disabled={!profile.logoUrl}
            onClick={() => {
              if (profile.logoUrl) onOpenAvatar?.(profile.logoUrl, profile.name);
            }}
            aria-label={
              profile.logoUrl ? 'Ver foto de perfil' : 'Sin foto de perfil'
            }
            data-chat-profile-avatar="1"
          >
            {profile.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.logoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="grid h-full w-full place-items-center text-3xl font-semibold text-[var(--chat-text-muted)]">
                {profile.initialLetter}
              </span>
            )}
          </button>
          <h2 className="mt-3 text-center text-[20px] font-semibold leading-tight tracking-[-0.02em]">
            {profile.name}
          </h2>
          <p className="mt-1 text-[13px] text-[var(--chat-text-muted)]">
            Asistente virtual · Menú digital
          </p>
          {status ? (
            <p
              className={`mt-2 text-[13px] font-medium ${
                profile.hours?.status.isOpen
                  ? 'text-[var(--chat-send)]'
                  : 'text-rose-400'
              }`}
            >
              {status}
            </p>
          ) : null}
        </div>

        <div className="divide-y divide-[var(--chat-card-border)] border-t border-[var(--chat-card-border)]">
          {profile.address || profile.location ? (
            <div className="flex gap-3 px-4 py-3">
              <MapPin
                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--chat-send)]"
                strokeWidth={2}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-[var(--chat-text-muted)]">
                  Dirección
                </p>
                <p className="mt-0.5 text-[14px] leading-snug">
                  {profile.address || profile.location?.label || 'Ubicación'}
                </p>
                {profile.location?.mapsUrl ? (
                  <a
                    href={profile.location.mapsUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-block text-[13px] font-semibold text-[var(--chat-link)] underline-offset-2 hover:underline"
                  >
                    Ver en Maps
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          {profile.hours ? (
            <div className="px-4 py-3">
              <p className="text-[12px] font-medium text-[var(--chat-text-muted)]">
                Horario
              </p>
              <ul className="mt-1.5 space-y-1">
                {profile.hours.days.map((day) => (
                  <li
                    key={day.key}
                    className={`flex justify-between gap-3 text-[13px] ${
                      day.isToday ? 'font-semibold text-[var(--chat-text)]' : 'text-[var(--chat-text-muted)]'
                    }`}
                  >
                    <span>
                      {day.label}
                      {day.isToday ? ' · Hoy' : ''}
                    </span>
                    <span>{day.hoursLabel}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {profile.whatsappUrl ? (
            <div className="px-4 py-3">
              <a
                href={profile.whatsappUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-2 rounded-xl bg-[var(--chat-send)] px-3 py-2.5 text-[14px] font-semibold text-[var(--chat-send-fg)]"
                data-chat-profile-whatsapp="1"
              >
                <MessageCircle className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                {profile.whatsappDisplay
                  ? `WhatsApp ${profile.whatsappDisplay}`
                  : 'Escribir por WhatsApp'}
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
