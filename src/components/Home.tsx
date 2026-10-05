import type { CardsData } from '../types'

export function Home({ data, onPick }: { data: CardsData; onPick: (id: string) => void }) {
  return (
    <main className="home">
      <header>
        <h1>Dino<span>Dex</span></h1>
        <p>Chaque post Instagram devient un dinosaure. Ouvre un classeur.</p>
      </header>
      <ul className="covers">
        {data.people.map((p) => {
          const n = data.cards.filter((c) => c.owner === p.id).length
          return (
            <li key={p.id}>
              <button className="mini-binder" style={{ '--c': p.color } as React.CSSProperties} onClick={() => onPick(p.id)}>
                <span className="mb-spine" />
                <span className="mb-body">
                  <span className="mb-label">{p.name}</span>
                  <span className="mb-count">{n} cartes</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
