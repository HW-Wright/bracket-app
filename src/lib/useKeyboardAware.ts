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
 *
 * iOS Safari sometimes leaves the layout viewport out of step with the screen after the keyboard closes,
 * so `position: fixed; bottom: 0` bars float above the bottom until a reload. We nudge it on close, and
 * publish the remaining gap as `--vv-shift` so the bottom nav can stay pinned to what's actually visible.
 */
export function useKeyboardAware() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let tallest = vv.height
    const root = document.documentElement

    const reveal = () => revealFocusedField()

    // Distance between the layout viewport's bottom (where fixed bars sit) and the visible bottom.
    // 0 normally; ignored while pinch-zoomed.
    const syncShift = () => {
      const gap = vv.scale > 1.01 ? 0 : Math.round(vv.offsetTop + vv.height - window.innerHeight)
      root.style.setProperty('--vv-shift', `${Math.max(0, gap)}px`)
    }
    // Re-assert the scroll position so Safari re-lays-out fixed elements after the keyboard goes away.
    const settle = () =>
      setTimeout(() => {
        window.scrollTo(window.scrollX, window.scrollY)
        syncShift()
      }, 120)

    let wasOpen = false
    const onResize = () => {
      tallest = Math.max(tallest, vv.height)
      const open = tallest - vv.height > 150 && isField(document.activeElement)
      root.toggleAttribute('data-keyboard', open)
      if (open) requestAnimationFrame(reveal)
      if (wasOpen && !open) settle()
      wasOpen = open
      syncShift()
    }
    const onFocusIn = () => setTimeout(reveal, 350) // after the keyboard animation
    const onFocusOut = () =>
      setTimeout(() => {
        if (!isField(document.activeElement)) {
          root.removeAttribute('data-keyboard')
          settle()
        }
      }, 50)
    const onVisible = () => document.visibilityState === 'visible' && syncShift()
    const onRotate = () => {
      tallest = 0
      setTimeout(() => (tallest = vv.height), 500)
    }

    syncShift()
    vv.addEventListener('resize', onResize)
    vv.addEventListener('scroll', syncShift)
    document.addEventListener('visibilitychange', onVisible)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    window.addEventListener('orientationchange', onRotate)
    return () => {
      vv.removeEventListener('resize', onResize)
      vv.removeEventListener('scroll', syncShift)
      document.removeEventListener('visibilitychange', onVisible)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('orientationchange', onRotate)
      root.removeAttribute('data-keyboard')
      root.style.removeProperty('--vv-shift')
    }
  }, [])
}
