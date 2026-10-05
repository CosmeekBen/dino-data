import type { CSSProperties } from 'react'
import type { CardsData } from '../types'
import type { FlyFrom } from './Binder'
import { CoverArt } from './BinderParts'

/** Légère rotation de chaque classeur posé sur le bureau, pour un rangement naturel. */
const ROT = [-4, 2.5, -1.5, 3.5, -3, 1.5]

export function Home({ data, onPick }: { data: CardsData; onPick: (id: string, from: FlyFrom) => void }) {
  return (
    <main className="home">
      <header>
        <h1>
          Dino<span>Dex</span>
        </h1>
        <p>Chaque post Instagram devient un dinosaure. Prends un classeur sur le bureau.</p>
      </header>
      <ul className="desk-row">
        {data.people.map((p, i) => {
          const n = data.cards.filter((c) => c.owner === p.id).length
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
                  <span className="hb-face hb-back" />
                  <span className="hb-face hb-gap" />
                  <span className="hb-face hb-side" />
                  <span className="hb-face hb-spine">
                    <span className="hb-spine-label">{p.name}</span>
                  </span>
                  <span className="hb-face hb-edge" />
                  <span className="hb-top">
                    <CoverArt person={p} count={n} />
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
