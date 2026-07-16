'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink, Play } from 'lucide-react';

type DemoTableTentProps = {
  demoUrl: string;
  demoPath: string;
  className?: string;
};

/**
 * QR placeholder position inside `/branding/table-tent.png` (447x558px),
 * measured directly from the artwork so the real QR lines up with the
 * printed acrylic frame's yellow-bordered white square.
 */
const QR_BOX = {
  left: '34.7%',
  top: '39.9%',
  width: '26%',
  height: '21%',
};

export function DemoTableTent({ demoUrl, demoPath, className = '' }: DemoTableTentProps) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=0&data=${encodeURIComponent(demoUrl)}`;

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="relative w-full max-w-[19.5rem] sm:max-w-[21rem] lg:max-w-[23.5rem]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[18%] h-[70%] w-[92%] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(116,70,255,0.4)_0%,rgba(116,70,255,0.1)_45%,transparent_75%)] blur-2xl"
        />

        <div className="relative mx-auto aspect-[447/558] w-full">
          <Image
            src="/branding/table-tent.png"
            alt="Table Tent acrílico de ElMenúXFA con código QR para escanear y pedir"
            fill
            sizes="(min-width: 1024px) 23.5rem, (min-width: 640px) 21rem, 19.5rem"
            className="object-contain drop-shadow-[0_35px_70px_rgba(0,0,0,0.55)]"
            priority
          />

          <div
            className="absolute flex items-center justify-center overflow-hidden rounded-[0.6rem] bg-white"
            style={QR_BOX}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt="Código QR real que abre el demo del menú en /v/demo"
              className="h-[88%] w-[88%] object-contain"
              width={320}
              height={320}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto mt-7 flex w-full max-w-[26rem] flex-col items-center gap-3.5">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href={demoPath}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2.5 rounded-[0.9rem] bg-[#FACC15] px-6 text-[0.95rem] font-bold text-[#0B0F1A] shadow-[0_20px_45px_-22px_rgba(250,204,21,0.85)] transition hover:-translate-y-0.5 hover:bg-[#fde047] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FACC15] sm:w-auto sm:min-w-[12.5rem]"
            style={{ height: '3.4rem' }}
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0B0F1A]/12">
              <Play className="h-3 w-3 fill-current" />
            </span>
            Probar demo
          </Link>
          <Link
            href={demoPath}
            target="_blank"
            rel="noopener noreferrer"
            style={{ height: '3.4rem' }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[0.9rem] border border-white/16 bg-white/[0.03] px-6 text-[0.92rem] font-semibold text-white transition hover:-translate-y-0.5 hover:border-violet-300/35 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 sm:w-auto sm:min-w-[12.5rem]"
          >
            Abrir enlace
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[0.75rem] text-slate-400">
          <span>✓ Sin app</span>
          <span className="text-white/25">·</span>
          <span>◉ Listo para escanear</span>
          <span className="text-white/25">·</span>
          <span>✓ Demo en segundos</span>
        </p>
      </div>
    </div>
  );
}
