import { useCallback, useEffect, useState } from 'react'
import { fetchProgress, type Progress } from './BracketProvider'

export function useProgress(bracketId: string | undefined) {
  const [progress, setProgress] = useState<Progress | null>(null)
  const reload = useCallback(async () => {
    if (bracketId) setProgress(await fetchProgress(bracketId))
  }, [bracketId])
  useEffect(() => {
    reload()
    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])
  return { progress, reload }
}
