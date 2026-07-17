import { Quote, Star, UserRound } from 'lucide-react';
import type { Testimonial } from './audience-data';

type TestimonialCardProps = {
  testimonial: Testimonial;
};

function StarRating() {
  return (
    <div className="flex items-center gap-1" role="img" aria-label="5 de 5 estrellas">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} className="h-4 w-4 fill-[#FACC15] text-[#FACC15]" aria-hidden="true" />
      ))}
    </div>
  );
}

export function TestimonialCard({ testimonial }: TestimonialCardProps) {
  const { quote, name, business, category, featured } = testimonial;

  return (
    <article
      className={
        featured
          ? 'order-first flex flex-col rounded-[24px] border border-violet-400/70 bg-gradient-to-br from-violet-500/[0.10] via-white/[0.025] to-transparent p-8 shadow-[0_0_45px_rgba(124,58,237,0.13)] transition-transform duration-300 motion-safe:hover:-translate-y-1 sm:p-9 lg:order-none lg:-translate-y-3 lg:motion-safe:hover:-translate-y-4'
          : 'flex flex-col rounded-[24px] border border-white/10 bg-white/[0.02] p-7 opacity-95 transition-transform duration-300 motion-safe:hover:-translate-y-1 sm:p-8'
      }
    >
      <Quote
        className={featured ? 'h-9 w-9 text-violet-300/70' : 'h-8 w-8 text-violet-400/50'}
        aria-hidden="true"
      />

      <blockquote
        className={
          featured
            ? 'mt-4 flex-1 text-[1.35rem] italic leading-[1.55] text-white sm:text-[1.45rem]'
            : 'mt-4 flex-1 text-[1.05rem] italic leading-[1.65] text-slate-300'
        }
      >
        &ldquo;{quote}&rdquo;
      </blockquote>

      <div className="mt-6">
        <StarRating />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={
              featured
                ? 'inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-violet-400/40 bg-violet-500/15 text-violet-200'
                : 'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/5 text-slate-300'
            }
            aria-hidden="true"
          >
            <UserRound className={featured ? 'h-6 w-6' : 'h-5 w-5'} />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">{name}</p>
            <p className="text-xs text-slate-400">{business}</p>
          </div>
        </div>

        <span className="inline-flex rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold text-violet-200">
          {category}
        </span>
      </div>
    </article>
  );
}
