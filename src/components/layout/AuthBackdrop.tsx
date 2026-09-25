/**
 * The signed-out shell: a dawn sky behind the sign-in card.
 *
 * Why this exists: the same three-stop teal gradient was hardcoded as
 * `from-[#001824] via-[#003344] to-[#0A5E7E]` in nine separate files (login,
 * forgot/reset password, enrol layout, parent signup/confirm/login,
 * notification preferences, not-found). It now lives in one place, reading
 * from the `--color-auth-*` tokens in globals.css.
 *
 * Design note — why there is no giant sun graphic here. The obvious move was
 * to float the brand's ray mark behind the card. It was tried at several
 * sizes and opacities and it never reads: the fan is wide and low-contrast, so
 * at any size big enough to see, the rays poke out either side of the card and
 * look like foliage, and screen-blending yellow over a blue-teal sky lands on
 * pale olive rather than gold. Light in the sky does the job the shape
 * couldn't. The mark itself appears once, small and crisp and fully saturated,
 * as `<SunMark />` in the page header — one confident use beats a big faint one.
 */

/**
 * The ray geometry from the brand mark — the same path that sits above the "A"
 * in `public/logo-icon.svg`. Inline rather than pointed at an SVG file through
 * `next/image` on purpose: an external SVG in an `<img>` gets its own document,
 * so `currentColor` never inherits and the rays render black. Inline,
 * `text-accent` on the element drives the fill.
 */
export function SunMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 118 65" className={className} fill="none" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M80.3139 53.2903H112.291C115.445 53.2903 118 55.8452 118 58.9989C118 62.1527 115.445 64.7075 112.291 64.7075H80.3139H37.6861H5.7087C2.55491 64.7075 0 62.1527 0 58.9989C0 55.8452 2.55491 53.2903 5.7087 53.2903H37.6861L9.99131 37.3019C7.25975 35.7251 6.32481 32.231 7.90171 29.4995C9.4786 26.768 12.9728 25.833 15.7043 27.4099L43.3991 43.4026L27.4104 15.7083C25.8335 12.9768 26.7684 9.48274 29.5 7.90587C32.2316 6.32901 35.7257 7.26392 37.3026 9.99544L53.2913 37.6854V5.7086C53.2913 2.55487 55.8462 0 59 0C62.1538 0 64.7087 2.55487 64.7087 5.7086V37.6854L80.6974 9.99113C82.2743 7.25962 85.7684 6.3247 88.5 7.90156C91.2316 9.47843 92.1665 12.9725 90.5896 15.704L74.6009 43.3983L102.296 27.4099C105.027 25.833 108.521 26.768 110.098 29.4995C111.675 32.231 110.74 35.7251 108.009 37.3019L80.3139 53.2903Z"
      />
    </svg>
  );
}

export function AuthBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{
        backgroundImage: `
          radial-gradient(120% 60% at 50% 104%, var(--color-auth-glow) 0%, transparent 58%),
          radial-gradient(70% 34% at 50% 100%, var(--color-auth-glow-soft) 0%, transparent 66%),
          linear-gradient(168deg,
            var(--color-auth-sky-top) 0%,
            var(--color-auth-sky-mid) 58%,
            var(--color-auth-sky-low) 100%)
        `,
      }}
    >
      {children}
    </div>
  );
}
