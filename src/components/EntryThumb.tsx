import { imageUrl } from '../lib/image'

function initials(name: string): string {
  const words = name.replace(/^(the|a|an)\s+/i, '').split(/[\s-]+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase()
}

/** Entry image, or an LED panel with initials when there's none. */
export default function EntryThumb({ name, path, size = 44 }: { name: string; path: string | null; size?: number }) {
  const url = imageUrl(path)
  const style = { width: size, height: size }
  return url ? (
    <img src={url} alt="" loading="lazy" style={style} className="shrink-0 border border-line object-cover" />
  ) : (
    <span
      aria-hidden
      style={{ ...style, fontSize: size * 0.38 }}
      className="led flex shrink-0 items-center justify-center border border-line font-led text-amber"
    >
      {initials(name)}
    </span>
  )
}
