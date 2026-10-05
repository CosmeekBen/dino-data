import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { DinoCard, Person } from '../types'
import { PER_PAGE, computeDims } from '../lib/binderGeometry'
import { BinderEngine } from '../lib/binderEngine'
import { CoverArt, InsideBack, InsideFront, Rings, Sheet, type SlotActions } from './BinderParts'

/** Position du classeur sur l'accueil, pour l'animer jusqu'au bureau. */
export interface FlyFrom {
  rect: DOMRect
  rot: number
}

interface Props {
  person: Person
  cards: DinoCard[]
  hiddenId: string | null
  onOpenCard: (card: DinoCard, rect: DOMRect) => void
  onBack: () => void
  flyFrom: FlyFrom | null
}

function useViewport() {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return vp
}

export function Binder({ person, cards, hiddenId, onOpenCard, onBack, flyFrom }: Props) {
  const vp = useViewport()
  const dims = useMemo(() => computeDims(vp.w, vp.h), [vp.w, vp.h])
  const pages = useMemo(() => {
    const out: DinoCard[][] = []
    for (let i = 0; i < cards.length; i += PER_PAGE) out.push(cards.slice(i, i + PER_PAGE))
    return out
  }, [cards])
  // au moins une page vide à la fin : de la place pour les prochains dinos
  const sheets = Math.max(3, Math.ceil((pages.length + 1) / 2))

  const [count, setCount] = useState(0)
  const [live, setLive] = useState<number[]>([])
  const [touched, setTouched] = useState(false)
  const [engine] = useState(
    () => new BinderEngine(sheets, dims, { count: setCount, live: setLive, touched: () => setTouched(true) }),
  )

  const stage = useRef<HTMLDivElement>(null)
  const r = (key: string) => engine.ref(key)

  useEffect(() => () => engine.destroy(), [engine])
  useEffect(() => {
    engine.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [engine])

  useLayoutEffect(() => {
    engine.attachStage(stage.current)
    return () => engine.attachStage(null)
  }, [engine])

  useLayoutEffect(() => engine.setDims(dims), [engine, dims])

  // Arrivée depuis l'accueil : le classeur glisse de sa place sur le bureau jusqu'au centre.
  useLayoutEffect(() => {
    const st = stage.current
    const cover = st?.querySelector('.cover-out')
    if (!st || !cover || !flyFrom) return
    const to = cover.getBoundingClientRect()
    const box = st.getBoundingClientRect()
    const s = flyFrom.rect.width / to.width
    const dx = flyFrom.rect.left + flyFrom.rect.width / 2 - (to.left + to.width / 2)
    const dy = flyFrom.rect.top + flyFrom.rect.height / 2 - (to.top + to.height / 2)
    const ox = to.left + to.width / 2 - box.left
    const oy = to.top + to.height / 2 - box.top
    st.style.transformOrigin = `${ox}px ${oy}px`
    st.style.transition = 'none'
    st.style.transform = `translate(${dx}px, ${dy}px) rotate(${flyFrom.rot}deg) scale(${s})`
    st.getBoundingClientRect()
    const id = requestAnimationFrame(() => {
      st.style.transition = ''
      st.style.transform = ''
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (hiddenId) return
      if (e.key === 'ArrowRight') engine.turn(1)
      if (e.key === 'ArrowLeft') engine.turn(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine, hiddenId])

  const actions = useMemo<SlotActions>(
    () => ({ hiddenId, onOpen: onOpenCard, swallow: () => engine.swallowClick() }),
    [hiddenId, onOpenCard, engine],
  )

  const shown = new Set<number>(live)
  for (let i = count - 2; i <= count + 1; i++) if (i >= 1 && i <= sheets) shown.add(i)

  const vars = {
    '--c': person.color,
    '--pw': `${dims.pw}px`,
    '--ph': `${dims.ph}px`,
    '--r': `${dims.r}px`,
    '--h0': `${dims.h0}px`,
    '--cw': `${dims.cw}px`,
    '--ch': `${dims.ch}px`,
    '--tc': `${dims.tc}px`,
    '--t': `${dims.t}px`,
    '--wire': `${dims.wire}px`,
    '--persp': `${dims.persp}px`,
  } as CSSProperties

  const totalPages = sheets * 2
  const label =
    count === 0
      ? 'Couverture'
      : count === 1
        ? 'Page 1'
        : count > sheets
          ? `Page ${totalPages} · fin`
          : `Pages ${2 * count - 2}–${2 * count - 1}`

  return (
    <main className="binder-view" style={vars}>
      <header className="bv-top">
        <button className="back-btn" onClick={onBack}>
          ← Les classeurs
        </button>
      </header>

      <div
        className="stage"
        ref={stage}
        onPointerDown={(e) => engine.pointerDown(e.nativeEvent)}
        onPointerMove={(e) => engine.pointerMove(e.nativeEvent)}
        onPointerUp={(e) => engine.pointerUp(e.nativeEvent)}
        onPointerCancel={(e) => engine.pointerUp(e.nativeEvent)}
        onPointerLeave={() => engine.pointerLeave()}
      >
        <div className="binder">
          <div className="q desk-shadow open" ref={r('shadow-open')} />
          <div className="q desk-shadow closed" ref={r('shadow-closed')} />

          <div className="q back-in" ref={r('back-in')}>
            <InsideBack />
          </div>
          <div className="q edge back-edge" ref={r('back-edge')} />

          <div className="q stack" ref={r('stack-r')} />
          <div className="q stack" ref={r('stack-l')} />
          <div className="q cast" ref={r('cast-r')} />
          <div className="q cast" ref={r('cast-l')} />

          <div className="q spine-out" ref={r('spine-out')} />
          <div className="q spine-in" ref={r('spine-in')}>
            <i className="shade" ref={r('spine-shade')} />
          </div>
          <div className="q edge spine-edge" ref={r('spine-edge')} />
          <div className="q mech" ref={r('mech')} />
          <Rings refFor={r} />

          {[...shown]
            .sort((a, b) => a - b)
            .map((i) => (
              <Sheet
                key={i}
                i={i}
                engine={engine}
                live={live.includes(i)}
                front={pages[2 * (i - 1)]}
                rear={pages[2 * (i - 1) + 1]}
                actions={actions}
              />
            ))}

          <div className="q cover-out" ref={r('cover-out')}>
            <CoverArt person={person} count={cards.length} />
            <i className="shade" ref={r('cover-out-shade')} />
          </div>
          <div className="q cover-in" ref={r('cover-in')}>
            <InsideFront person={person} count={cards.length} />
            <i className="shade" ref={r('cover-in-shade')} />
          </div>
          <div className="q edge cover-edge-r" ref={r('cover-edge-r')} />
          <div className="q edge cover-edge-t" ref={r('cover-edge-t')} />
          <div className="q edge cover-edge-b" ref={r('cover-edge-b')} />
        </div>
      </div>

      <nav className="pager">
        <button onClick={() => engine.turn(-1)} disabled={count === 0} aria-label="Page précédente">
          ◀
        </button>
        <span>{label}</span>
        <button onClick={() => engine.turn(1)} disabled={count > sheets} aria-label="Page suivante">
          ▶
        </button>
      </nav>
      <p className={`hint${touched ? ' gone' : ''}`}>
        {count === 0 ? 'Attrape le bord de la couverture pour ouvrir' : 'Attrape le bord d’une page et fais-la glisser'}
      </p>
    </main>
  )
}
