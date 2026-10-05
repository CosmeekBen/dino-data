import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DinoCard, Person } from '../types'
import { ARCHETYPES, analyzeCurve, rarityOf } from '../lib/curve'
import { CardFace } from './CardFace'
import { Sparkline } from './Sparkline'
import { useTilt } from '../lib/useTilt'

interface Props {
  card: DinoCard
  owner: Person
  from: DOMRect
  onClose: () => void
}

const fmt = (n: number) => n.toLocaleString('fr-FR')

export function CardViewer({ card, owner, from, onClose }: Props) {
  const holder = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const tilt = useTilt<HTMLDivElement>(16)
  const rarity = rarityOf(card.stats)
  const a = ARCHETYPES[analyzeCurve(card.stats.curve).archetype]

  // FLIP : la carte part de son emplacement dans le classeur et grandit jusqu'au centre.
  const placeAtOrigin = () => {
    const el = holder.current
    if (!el) return
    const to = el.getBoundingClientRect()
    const dx = from.left + from.width / 2 - (to.left + to.width / 2)
    const dy = from.top + from.height / 2 - (to.top + to.height / 2)
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${from.width / to.width})`
  }

  useLayoutEffect(() => {
    const el = holder.current
    if (!el) return
    el.style.transition = 'none'
    placeAtOrigin()
    el.getBoundingClientRect()
    requestAnimationFrame(() => {
      el.style.transition = ''
      el.style.transform = 'none'
      setOpen(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = () => {
    setOpen(false)
    placeAtOrigin()
    window.setTimeout(onClose, 450)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stat = (label: string, value: number) => (
    <div className="stat">
      <b>{fmt(value)}</b>
      <span>{label}</span>
    </div>
  )

  return (
    <div className={`viewer${open ? ' open' : ''}`} onClick={close}>
      <div className="viewer-inner" onClick={(e) => e.stopPropagation()}>
        <div className="card-holder" ref={holder}>
          <div
            ref={tilt.ref}
            className={`big-card rarity-${rarity}`}
            onPointerMove={tilt.onPointerMove}
            onPointerLeave={tilt.onPointerLeave}
          >
            <CardFace card={card} />
            <i className="holo" />
            <i className="glare" />
          </div>
        </div>

        <aside className="info">
          <p className="eyebrow" style={{ color: owner.color }}>
            Classeur de {owner.name} · <span className="rarity-tag">{rarity}</span>
          </p>
          <h2>{card.dino}</h2>
          <p className="blurb"><b>{a.label}</b> — {a.blurb}</p>

          <div className="stats">
            {stat('J’aime', card.stats.likes)}
            {stat('Commentaires', card.stats.comments)}
            {stat('Partages', card.stats.shares)}
            {stat('Enregistrements', card.stats.saves)}
            {stat('Portée', card.stats.reach)}
          </div>

          <div className="curve">
            <Sparkline data={card.stats.curve} height={70} stroke={owner.color} fill={owner.color} />
            <small>Courbe du post sur {card.stats.curve.length} jours — c’est elle qui dessine le dinosaure.</small>
          </div>

          <a className="post-link" href={card.postUrl} target="_blank" rel="noreferrer noopener">
            <span>Voir le post Instagram</span>
            <span aria-hidden>↗</span>
          </a>
          <small className="date">
            Publié le {new Date(card.postedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </small>
          <button className="close" onClick={close}>Ranger la carte</button>
        </aside>
      </div>
    </div>
  )
}
