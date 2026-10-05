import { memo, useLayoutEffect, useRef, type CSSProperties } from 'react'
import type { DinoCard, Person } from '../types'
import { COL_W, N_STRIPS, PAGE, PER_PAGE, columnSpan } from '../lib/binderGeometry'
import { STRIP_OVERLAP, type BinderEngine, type SheetHandle, type StripEls } from '../lib/binderEngine'
import { useTilt } from '../lib/useTilt'
import { CardFace } from './CardFace'

const ROW_H = (PAGE.ratio - 2 * PAGE.top - (PAGE.rows - 1) * PAGE.gap) / PAGE.rows
const pw = (f: number) => `calc(var(--pw) * ${f})`

// ───────── Couverture ─────────

/** Empreinte de dinosaure dorée à chaud sur le plat. */
function Footprint() {
  return (
    <svg className="ca-print" viewBox="0 0 100 110" aria-hidden>
      <defs>
        <linearGradient id="foil" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a6420" />
          <stop offset=".3" stopColor="#f6dc86" />
          <stop offset=".5" stopColor="#b48a2e" />
          <stop offset=".68" stopColor="#fff1b0" />
          <stop offset="1" stopColor="#8f6a22" />
        </linearGradient>
      </defs>
      <g fill="url(#foil)">
        <path d="M50 108c-13 0-21-9-20-21 1-12 9-19 20-19s19 7 20 19c1 12-7 21-20 21z" />
        <path d="M41 70C31 62 21 45 15 28L10 11l13 12c8 13 17 29 24 40z" />
        <path d="M45 64c-1-18 0-36 2-52L50 0l3 12c2 16 3 34 2 52z" />
        <path d="M59 70c10-8 20-25 26-42l5-17-13 12c-8 13-17 29-24 40z" />
      </g>
    </svg>
  )
}

/** Plat avant : simili-cuir grainé, surpiqûres, dorure, porte-étiquette métal avec le prénom écrit à la main. */
export function CoverArt({ person, count }: { person: Person; count: number }) {
  return (
    <div className="cover-art" style={{ '--c': person.color } as CSSProperties}>
      <i className="ca-stitch" />
      <div className="ca-brand">
        <Footprint />
        <span>DinoDex</span>
      </div>
      <div className="ca-label">
        <i className="ca-rivet l" />
        <i className="ca-rivet r" />
        <div className="ca-card">
          <span className="ca-name">{person.name}</span>
          <span className="ca-count">{count} dinosaure{count > 1 ? 's' : ''}</span>
        </div>
      </div>
      <i className="ca-corner top" />
      <i className="ca-corner bottom" />
    </div>
  )
}

/** Intérieur du plat avant : toile + ex-libris. */
export function InsideFront({ person, count }: { person: Person; count: number }) {
  return (
    <div className="lining is-front">
      <div className="ex-libris">
        <small>Ce classeur appartient à</small>
        <strong>{person.name}</strong>
        <span>
          {count} dino{count > 1 ? 's' : ''} capturé{count > 1 ? 's' : ''} sur Instagram
        </span>
        <em>DinoDex · collection officielle</em>
      </div>
    </div>
  )
}

export function InsideBack() {
  return (
    <div className="lining is-back">
      <span className="lining-mark">DinoDex</span>
    </div>
  )
}

/** Anneaux chromés : chaque anneau est un empilement d'arcs, pour garder du volume sous tous les angles. */
export function Rings({ refFor }: { refFor: (key: string) => (el: HTMLElement | null) => void }) {
  return (
    <>
      {PAGE.rings.map((_, j) =>
        [-2, -1, 0, 1, 2].map((k) => (
          <i className="q wire" key={`${j}${k}`} ref={refFor(`wire-${j}-${k}`)} style={{ '--k': k } as CSSProperties} />
        )),
      )}
    </>
  )
}

// ───────── Pages à pochettes ─────────

export interface SlotActions {
  hiddenId: string | null
  onOpen: (card: DinoCard, rect: DOMRect) => void
  swallow: () => boolean
}

function Slot({ card, actions }: { card: DinoCard; actions: SlotActions }) {
  const tilt = useTilt<HTMLButtonElement>(5)
  return (
    <button
      ref={tilt.ref}
      className={`slot${card.id === actions.hiddenId ? ' out' : ''}`}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      onClick={(e) => {
        if (actions.swallow()) return
        actions.onOpen(card, e.currentTarget.getBoundingClientRect())
      }}
      aria-label={`Voir la carte ${card.dino}`}
    >
      <div className="sleeve">
        <CardFace card={card} />
        <i className="holo" />
        <i className="glare" />
      </div>
    </button>
  )
}

interface PageFaceProps {
  cards: DinoCard[] | undefined
  pageNo: number
  side: 'front' | 'rear'
  /** colonnes à dessiner (copies découpées des pages en mouvement) */
  cols?: number[]
  actions?: SlotActions
}

export function PageFace({ cards = [], pageNo, side, cols, actions }: PageFaceProps) {
  const pockets = []
  for (let i = 0; i < PER_PAGE; i++) {
    const col = i % PAGE.cols
    if (cols && !cols.includes(col)) continue
    const row = Math.floor(i / PAGE.cols)
    const card = cards[i]
    pockets.push(
      <div
        className="pocket"
        key={i}
        style={{
          left: pw(columnSpan(col, side)[0]),
          top: pw(PAGE.top + row * (ROW_H + PAGE.gap)),
          width: pw(COL_W),
          height: pw(ROW_H),
        }}
      >
        {card &&
          (actions ? (
            <Slot card={card} actions={actions} />
          ) : (
            <div className="slot static">
              <div className="sleeve">
                <CardFace card={card} />
              </div>
            </div>
          ))}
        <i className="film" />
      </div>,
    )
  }
  return (
    <div className={`pf ${side}`}>
      <i className="pf-binding" />
      {PAGE.rings.map((ry) => (
        <i className="pf-hole" key={ry} style={{ top: `${50 + ry * 100}%` }} />
      ))}
      {pockets}
      <span className="pf-no">{pageNo}</span>
      <i className="pf-gloss" />
    </div>
  )
}

/** Colonnes de cartes visibles dans la bande `k` d'une face. */
function columnsIn(k: number, side: 'front' | 'rear') {
  const a = side === 'front' ? k / N_STRIPS : 1 - (k + 1) / N_STRIPS
  const b = a + 1 / N_STRIPS
  const out: number[] = []
  for (let c = 0; c < PAGE.cols; c++) {
    const [s, e] = columnSpan(c, side)
    if (s < b + 0.01 && e > a - 0.01) out.push(c)
  }
  return out
}

interface SheetProps {
  i: number
  engine: BinderEngine
  live: boolean
  front: DinoCard[] | undefined
  rear: DinoCard[] | undefined
  actions: SlotActions
}

/** Un feuillet : à plat (interactif) au repos, découpé en bandes pliables quand il tourne. */
export const Sheet = memo(function Sheet({ i, engine, live, front, rear, actions }: SheetProps) {
  const ff = useRef<HTMLDivElement>(null)
  const fr = useRef<HTMLDivElement>(null)
  const strips = useRef<(StripEls | null)[]>([])

  useLayoutEffect(() => {
    const h: SheetHandle = live
      ? { flat: null, strips: strips.current }
      : { flat: { front: { el: ff.current! }, rear: { el: fr.current! } }, strips: null }
    engine.attachSheet(i, h)
    return () => engine.detachSheet(i, h)
  }, [engine, i, live])

  const frontNo = 2 * i - 1
  const rearNo = 2 * i

  if (!live) {
    return (
      <>
        <div className="q face" ref={ff}>
          <PageFace cards={front} pageNo={frontNo} side="front" actions={actions} />
        </div>
        <div className="q face" ref={fr}>
          <PageFace cards={rear} pageNo={rearNo} side="rear" actions={actions} />
        </div>
      </>
    )
  }

  return (
    <>
      {Array.from({ length: N_STRIPS }, (_, k) => (
        <StripView
          key={k}
          k={k}
          front={front}
          rear={rear}
          frontNo={frontNo}
          rearNo={rearNo}
          onRef={(els) => (strips.current[k] = els)}
        />
      ))}
    </>
  )
})

const StripView = memo(function StripView(props: {
  k: number
  front: DinoCard[] | undefined
  rear: DinoCard[] | undefined
  frontNo: number
  rearNo: number
  onRef: (els: StripEls | null) => void
}) {
  const { k, onRef } = props
  const f = useRef<HTMLDivElement>(null)
  const r = useRef<HTMLDivElement>(null)
  const fs = useRef<HTMLElement>(null)
  const rs = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    onRef({ front: { el: f.current!, shade: fs.current }, rear: { el: r.current!, shade: rs.current } })
    return () => onRef(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const ov = k < N_STRIPS - 1 ? STRIP_OVERLAP : 0
  const width = `calc(var(--pw) / ${N_STRIPS} + ${ov}px)`
  return (
    <>
      <div className="q sface" ref={f} style={{ width }}>
        <div className="sclip" style={{ left: `calc(var(--pw) * ${-k / N_STRIPS})` }}>
          <PageFace cards={props.front} pageNo={props.frontNo} side="front" cols={columnsIn(k, 'front')} />
        </div>
        <i className="shade" ref={fs} />
      </div>
      <div className="q sface" ref={r} style={{ width }}>
        <div className="sclip" style={{ left: `calc(var(--pw) * ${-(1 - (k + 1) / N_STRIPS)} + ${ov}px)` }}>
          <PageFace cards={props.rear} pageNo={props.rearNo} side="rear" cols={columnsIn(k, 'rear')} />
        </div>
        <i className="shade" ref={rs} />
      </div>
    </>
  )
})
