/**
 * The canonical button.
 *
 * This replaces ten hand-written `bg-[#f6f6f6] text-text-inverse rounded-md
 * font-display` class strings that were copy-pasted across nine files. The
 * literal was a leftover off-white from a previous palette, so the app's most
 * important control was the one element that ignored the design tokens.
 *
 * Two contrast bugs are fixed here as well, both of which shipped:
 *
 *   primary was `bg-accent text-text-primary`, i.e. near-white #F2F5F2 on
 *   Omnitrix green #6FE04B, which measures 1.54:1. Unreadable. The accent is a
 *   light hue, so text on it has to be the inverse ink: 11.55:1.
 *
 *   danger was `bg-red text-text-primary` at 3.23:1, and its hover reached for
 *   a `--color-red-hover` token that was never defined, so hovering did
 *   nothing at all. Now 5.50:1 with a real hover.
 *
 * `size` exists because the app genuinely has two: the full-width 52px action
 * that ends every screen, and the compact control used inside sheets and the
 * admin console.
 */

const VARIANTS = {
  // Light green fill, dark ink. The one control that means "do the thing".
  primary: 'bg-accent text-text-inverse hover:bg-accent-hover active:bg-accent-active',
  // Outlined. For a choice that sits beside a primary without competing.
  secondary:
    'bg-transparent border border-border text-text-secondary hover:bg-surface hover:text-text-primary',
  // Destructive, and deliberately outlined rather than filled: a solid red
  // block reads as the primary action on a screen, which is the last thing a
  // destructive control should do.
  danger:
    'bg-transparent border border-red text-red hover:bg-red hover:text-text-inverse',
  ghost: 'bg-transparent text-text-muted hover:bg-surface hover:text-text-primary',
}

const SIZES = {
  // The screen-ending action. 52px is above the 44px touch floor with room to
  // spare, because this is the target a player hits in a hurry, one-handed.
  lg: 'h-[52px] w-full px-6 font-display text-lg',
  md: 'min-h-11 px-5 py-2.5 text-sm font-semibold',
  sm: 'min-h-11 px-3 py-2 text-[13px] font-medium',
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  // Buttons inside a <form> default to submit in HTML, which fires the form on
  // click. Anything not explicitly a submit must say so or it silently
  // submits.
  type = 'button',
  disabled,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-md
        transition-colors duration-(--duration-instant) ease-standard
        disabled:cursor-not-allowed disabled:opacity-60
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
        focus-visible:outline-accent
        ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export default Button
