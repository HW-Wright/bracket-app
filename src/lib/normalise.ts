/**
 * Canonical comparison form for entry names: case, diacritics, punctuation, hyphens, whitespace and a
 * leading article are ignored. "The Dark-Knight!" and "dark knight" both become "dark knight".
 * Mirrored in SQL by public.normalise_entry() for duplicate detection; keep the two in step.
 */
export function normaliseEntry(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // diacritics
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '') // apostrophes join: "don't" -> "dont"
    .replace(/[^\p{L}\p{N}]+/gu, ' ') // punctuation, hyphens, whitespace -> single space
    .trim()
    .replace(/^(the|a|an) /, '')
}

/** Groups of indexes (2+) whose entries normalise to the same text. */
export function findOwnDuplicates(items: string[]): number[][] {
  const groups = new Map<string, number[]>()
  items.forEach((item, i) => {
    const key = normaliseEntry(item)
    if (!key) return
    groups.set(key, [...(groups.get(key) ?? []), i])
  })
  return [...groups.values()].filter((g) => g.length > 1)
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export const MAX_NOMINATIONS = 15
