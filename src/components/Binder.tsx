import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { DinoCard, Person } from '../types'
import { CardFace } from './CardFace'
import { useTilt } from '../lib/useTilt'

const PER_PAGE = 9

interface Props {
  person: Person
  cards: DinoCard[]
  hiddenId: string | null
  onOpenCard: (card: DinoCard, rect: DOMRect) => void
  onBack: () => void
}

function Slot({ card, hidden, onOpen }: { card?: DinoCard; hidden: boolean; onOpen: Props['onOpenCard'] }) {
  const tilt = useTilt<HTMLButtonElement>(9)
  if (!card) return <div className="slot empty"><div className="sleeve" /></div>
  return (
    <button
      ref={tilt.ref}
      className={`slot${hidden ? ' out' : ''}`}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      onClick={(e) => onOpen(card, e.currentTarget.getBoundingClientRect())}
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

export function Binder({ person, cards, hiddenId, onOpenCard, onBack }: Props) {
  const [flipped, setFlipped] = useState(0)

  // items : [couverture, intérieur, ...pages de cartes, (page vide), dos]
  const items = useMemo<ReactNode[]>(() => {
    const pages: DinoCard[][] = []
    for (let i = 0; i < cards.length; i += PER_PAGE) pages.push(cards.slice(i, i + PER_PAGE))
    if (!pages.length) pages.push([])
    const list: ReactNode[] = [
      <div className="cover-front" key="cover">
        <div className="cover-plate">
          <small>Classeur de</small>
          <strong>{person.name}</strong>
          <span>{cards.length} dinosaures</span>
        </div>
      </div>,
      <div className="inside" key="inside" />,
      ...pages.map((p, pi) => (
        <div className="page" key={`p${pi}`}>
          <div className="grid">
            {Array.from({ length: PER_PAGE }, (_, i) => (
              <Slot key={i} card={p[i]} hidden={p[i]?.id === hiddenId} onOpen={onOpenCard} />
            ))}
          </div>
          <span className="page-no">{pi + 1}</span>
        </div>
      )),
    ]
    if (list.length % 2 === 0) list.push(<div className="inside" key="blank" />)
    list.push(<div className="cover-back" key="back" />)
    return list
  }, [cards, person, hiddenId, onOpenCard])

  const sheets = items.length / 2
  const next = useCallback(() => setFlipped((f) => Math.min(sheets, f + 1)), [sheets])
  const prev = useCallback(() => setFlipped((f) => Math.max(0, f - 1)), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (hiddenId) return
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, hiddenId])

  // fermé : décalé à gauche pour centrer la couverture ; fin : décalé à droite
  const shift = flipped === 0 ? '-25%' : flipped === sheets ? '25%' : '0%'

  return (
    <main className="binder-view" style={{ '--c': person.color } as CSSProperties}>
      <button className="back" onClick={onBack}>← Les classeurs</button>
      <div className="stage">
        <div className="binder" style={{ transform: `translateX(${shift})` }}>
          <div className="spine" />
          {Array.from({ length: sheets }, (_, k) => {
            const isFlipped = k < flipped
            return (
              <div
                key={k}
                className={`sheet${k === 0 ? ' is-cover' : ''}${k === sheets - 1 ? ' is-back' : ''}`}
                style={{ zIndex: isFlipped ? k : sheets - k, transform: `rotateY(${isFlipped ? -180 : 0}deg)` }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('.slot')) return
                  isFlipped ? prev() : next()
                }}
              >
                <div className="face front">{items[2 * k]}</div>
                <div className="face rear">{items[2 * k + 1]}</div>
              </div>
            )
          })}
        </div>
      </div>
      <nav className="pager">
        <button onClick={prev} disabled={flipped === 0} aria-label="Page précédente">◀</button>
        <span>{flipped === 0 ? 'Couverture' : flipped === sheets ? 'Fin' : `Feuillet ${flipped} / ${sheets - 1}`}</span>
        <button onClick={next} disabled={flipped === sheets} aria-label="Page suivante">▶</button>
      </nav>
    </main>
  )
}
