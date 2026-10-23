import { useEffect } from 'react'

const isField = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit'].includes(el.type))

/** Scrolls the focused field into the part of the screen the keyboard isn't covering. */
export function revealFocusedField() {
  const vv = window.visualViewport
  const el = document.activeElement
  if (!vv || !isField(el)) return
  const rect = el.getBoundingClientRect()
  const top = rect.top - vv.offsetTop // position within the visible area
  if (top < 64 || rect.bottom - vv.offsetTop > vv.height - 16) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollBy({ top: top - vv.height * 0.3, behavior: reduceMotion ? 'auto' : 'smooth' })
  }
}

/**
 * Keeps the focused field visible above the on-screen keyboard. Sets `data-keyboard` on <html> while the
 * keyboard is up so CSS can hide the bottom nav and un-stick bottom bars (see index.css).
 * Works off visualViewport: iOS shrinks only the visual viewport; Android may shrink both, so we compare
 * against the tallest height seen for this orientation.
 */
export function useKeyboardAware() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let tallest = vv.height
    const root = document.documentElement

    const reveal = () => revealFocusedField()

    const onResize = () => {
      tallest = Math.max(tallest, vv.height)
      const open = tallest - vv.height > 150 && isField(document.activeElement)
      root.toggleAttribute('data-keyboard', open)
      if (open) requestAnimationFrame(reveal)
    }
    const onFocusIn = () => setTimeout(reveal, 350) // after the keyboard animation
    const onFocusOut = () =>
      setTimeout(() => {
        if (!isField(document.activeElement)) root.removeAttribute('data-keyboard')
      }, 50)
    const onRotate = () => {
      tallest = 0
      setTimeout(() => (tallest = vv.height), 500)
    }

    vv.addEventListener('resize', onResize)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    window.addEventListener('orientationchange', onRotate)
    return () => {
      vv.removeEventListener('resize', onResize)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('orientationchange', onRotate)
      root.removeAttribute('data-keyboard')
    }
  }, [])
}
