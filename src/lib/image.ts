import { supabase } from './supabase'

export const IMAGE_BUCKET = 'entry-images'
const MAX_SIDE = 800
const TARGET_BYTES = 200 * 1024

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Resize to max 800px on the longest side and compress to ~200KB. WebP where the browser can encode it;
 * Safari can't, so it falls back to JPEG.
 */
export async function prepareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  let best: Blob | null = null
  for (const quality of [0.85, 0.75, 0.65, 0.5, 0.4]) {
    let blob = await toBlob(canvas, 'image/webp', quality)
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality)
    if (!blob) continue
    best = blob
    if (blob.size <= TARGET_BYTES) break
  }
  if (!best) throw new Error("Couldn't process that image")
  return best
}

export function imageUrl(path: string | null): string | null {
  return path ? supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl : null
}

/** Upload a new image for an entry, point the entry at it, and delete the previous file. */
export async function uploadEntryImage(
  bracketId: string,
  entryId: string,
  file: File,
  previousPath: string | null,
): Promise<string | null> {
  const blob = await prepareImage(file)
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${bracketId}/${entryId}-${Date.now()}.${ext}`
  const { error: upErr } = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, { contentType: blob.type })
  if (upErr) return upErr.message
  const { error } = await supabase.rpc('set_entry_image', { p_entry_id: entryId, p_path: path })
  if (error) return error.message
  if (previousPath) await supabase.storage.from(IMAGE_BUCKET).remove([previousPath])
  return null
}

export async function clearEntryImage(entryId: string, previousPath: string | null): Promise<string | null> {
  const { error } = await supabase.rpc('set_entry_image', { p_entry_id: entryId, p_path: null })
  if (error) return error.message
  if (previousPath) await supabase.storage.from(IMAGE_BUCKET).remove([previousPath])
  return null
}
