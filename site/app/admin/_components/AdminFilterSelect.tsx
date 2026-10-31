'use client';

import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

export type AdminFilterOption = {
  value: string;
  label: string;
};

type AdminFilterSelectProps = {
  label: string;
  value: string;
  options: readonly AdminFilterOption[];
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  /** `dark` for purple/hero backgrounds */
  tone?: 'light' | 'dark';
};

export function AdminFilterSelect({
  label,
  value,
  options,
  onChange,
  className,
  disabled = false,
  tone = 'light',
}: AdminFilterSelectProps) {
  const isDark = tone === 'dark';
  return (
    <label className={`block min-w-[9.5rem] flex-1 sm:flex-none sm:min-w-[11rem] ${className ?? ''}`}>
      <span
        className={`mb-1 block text-[10px] font-black uppercase tracking-[0.14em] ${
          isDark ? 'text-violet-100/70' : 'text-slate-500'
        }`}
      >
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full appearance-none rounded-xl border py-2.5 pl-3 pr-9 text-sm font-semibold outline-none transition focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${
            isDark
              ? 'border-white/20 bg-white/10 text-white ring-white/20'
              : 'border-slate-200 bg-white text-slate-900 ring-violet-200'
          }`}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} className="text-slate-900">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className={`pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 ${
            isDark ? 'text-violet-100/80' : 'text-slate-400'
          }`}
        />
      </div>
    </label>
  );
}

type AdminFilterBarProps = {
  children: ReactNode;
  className?: string;
};

export function AdminFilterBar({ children, className }: AdminFilterBarProps) {
  return (
    <div
      className={`flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end ${className ?? ''}`}
    >
      {children}
    </div>
  );
}
