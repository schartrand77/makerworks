// src/hooks/useClickAway.ts
import { useEffect, useRef } from 'react'

const useClickAway = (onClickAway: () => void) => {
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !(ref.current as any).contains(e.target)) {
        onClickAway()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClickAway])

  return ref
}

export default useClickAway
