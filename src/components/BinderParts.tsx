import { memo, useLayoutEffect, useRef, type CSSProperties } from 'react'
import type { DinoCard, Person } from '../types'
import { engagementScore, rarityOf, type Rarity } from '../lib/curve'
import { COL_W, N_STRIPS, PAGE, PER_PAGE, columnSpan } from '../lib/binderGeometry'
import { STRIP_OVERLAP, type BinderEngine, type SheetHandle, type StripEls } from '../lib/binderEngine'
import { useTilt } from '../lib/useTilt'
import { CardFace } from './CardFace'

const ROW_H = (PAGE.ratio - 2 * PAGE.top - (PAGE.rows - 1) * PAGE.gap) / PAGE.rows
const pw = (f: number) => `calc(var(--pw) * ${f})`

// ───────── Couverture ─────────

/** La carte la plus engageante d'un classeur : c'est elle qu'on expose dans la fenêtre de la couverture. */
export function featuredCard(cards: DinoCard[]) {
  let best: DinoCard | undefined
  for (const c of cards) if (!best || engagementScore(c.stats) > engagementScore(best.stats)) best = c
  return best
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Plat avant : matière soft-touch mate, nom gaufré ton sur ton, fenêtre qui expose la meilleure carte. */
export function CoverArt({ person, cards, index }: { person: Person; cards: DinoCard[]; index: number }) {
  const star = featuredCard(cards)
  return (
    <div className="cover-art" style={{ '--c': person.color } as CSSProperties}>
      <i className="ca-hinge" />
      <div className="ca-top">
        <span className="ca-mark">DinoDex</span>
        <span className="ca-no">Nº {pad2(index + 1)}</span>
      </div>
      <div className="ca-window">
        {star ? <CardFace card={star} /> : <i className="ca-empty" />}
        <i className="ca-film" />
      </div>
      <div className="ca-foot">
        <strong className="ca-name" style={{ '--len': person.name.length } as CSSProperties}>
          {person.name}
        </strong>
        <span className="ca-meta">
          {cards.length} dino{cards.length > 1 ? 's' : ''} — Saison 01
        </span>
      </div>
    </div>
  )
}

const RARITIES: Rarity[] = ['commune', 'rare', 'épique', 'légendaire']

/** Intérieur du plat avant : fiche de la collection. */
export function InsideFront({ person, cards }: { person: Person; cards: DinoCard[] }) {
  const counts = RARITIES.map((r) => cards.filter((c) => rarityOf(c.stats) === r).length)
  const max = Math.max(1, ...counts)
  return (
    <div className="lining is-front">
      <div className="sheet-card">
        <span className="sc-kicker">Collection</span>
        <strong className="sc-name">{person.name}</strong>
        <span className="sc-count">
          {cards.length}
          <small> dino{cards.length > 1 ? 's' : ''}</small>
        </span>
        <ul className="sc-bars">
          {RARITIES.map((r, i) => (
            <li key={r} className={`rarity-${r}`}>
              <span>{r}</span>
              <i style={{ '--v': counts[i] / max } as CSSProperties} />
              <b>{counts[i]}</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function InsideBack() {
  return (
    <div className="lining is-back">
      <span className="lining-mark">DinoDex</span>
      <span className="lining-note">Place pour les prochains dinos</span>
    </div>
  )
}

/** Anneaux métal : chaque anneau est un empilement d'arcs, pour garder du volume sous tous les angles. */
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
