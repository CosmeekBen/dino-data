import { useRef, type PointerEvent } from 'react'

/** Incline un élément vers le pointeur et expose la position de la lumière via des variables CSS. */
export function useTilt<T extends HTMLElement>(max = 12) {
  const ref = useRef<T>(null)

  const onPointerMove = (e: PointerEvent) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    const s = el.style
    s.setProperty('--rx', `${(0.5 - py) * max * 2}deg`)
    s.setProperty('--ry', `${(px - 0.5) * max * 2}deg`)
    s.setProperty('--mx', `${px * 100}%`)
    s.setProperty('--my', `${py * 100}%`)
    s.setProperty('--bx', `${px * 100}%`)
    s.setProperty('--by', `${py * 100}%`)
    s.setProperty('--o', '1')
  }

  const onPointerLeave = () => {
    const s = ref.current?.style
    if (!s) return
    s.setProperty('--rx', '0deg')
    s.setProperty('--ry', '0deg')
    s.setProperty('--o', '0')
  }

  return { ref, onPointerMove, onPointerLeave }
}
