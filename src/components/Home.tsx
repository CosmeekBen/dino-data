import type { CSSProperties } from 'react'
import type { CardsData } from '../types'
import type { FlyFrom } from './Binder'
import { CoverArt } from './BinderParts'

/** Légère rotation de chaque classeur posé sur le plateau, pour un rangement naturel. */
const ROT = [-3, 2, -1.5, 2.5, -2.5, 1.5]

/** Couches de l'épaisseur d'un classeur fermé, de bas en haut. */
const LAYERS = ['board', 'board', ...Array.from({ length: 18 }, (_, k) => (k % 2 ? 'page' : 'page alt')), 'board', 'board']

export function Home({ data, onPick }: { data: CardsData; onPick: (id: string, from: FlyFrom) => void }) {
  return (
    <main className="home">
      <header className="home-top">
        <span>DinoDex — Saison 01</span>
        <span>
          {data.cards.length} dinos · {data.people.length} classeurs
        </span>
      </header>

      <section className="home-hero">
        <h1 className="wordmark">
          Dino<span>Dex</span>
        </h1>
        <p className="lede">
          Chaque post Instagram devient un dinosaure. La courbe de ses stats dessine l’espèce, l’engagement fixe la
          rareté.
        </p>
      </section>

      <ul className="desk-row">
        {data.people.map((p, i) => {
          const cards = data.cards.filter((c) => c.owner === p.id)
          const rot = ROT[i % ROT.length]
          return (
            <li key={p.id} style={{ '--c': p.color, '--rot': `${rot}deg`, '--i': i } as CSSProperties}>
              <button
                className="hb"
                onClick={(e) => {
                  const top = e.currentTarget.querySelector('.hb-top')
                  if (top) onPick(p.id, { rect: top.getBoundingClientRect(), rot })
                }}
                aria-label={`Ouvrir le classeur de ${p.name}`}
              >
                <span className="hb-shadow" />
                <span className="hb-body">
                  {/* épaisseur : couches de même silhouette (plat arrière, bloc de pages, plat avant) */}
                  {LAYERS.map((l, k) => (
                    <span key={k} className={`hb-layer ${l}`} style={{ '--k': k } as CSSProperties} />
                  ))}
                  <span className="hb-face hb-spine">
                    <span className="hb-spine-label">{p.name}</span>
                  </span>
                  <span className="hb-top">
                    <CoverArt person={p} count={cards.length} index={i} />
                  </span>
                </span>
              </button>
              <p className="hb-caption">
                <span>Nº {String(i + 1).padStart(2, '0')}</span>
                <span>
                  {cards.length} dino{cards.length > 1 ? 's' : ''}
                </span>
              </p>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
