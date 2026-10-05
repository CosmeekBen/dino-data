import { useCallback, useEffect, useState } from 'react'
import raw from './data/cards.json'
import type { CardsData, DinoCard } from './types'
import { Home } from './components/Home'
import { Binder } from './components/Binder'
import { CardViewer } from './components/CardViewer'

const data = raw as CardsData

const readHash = () => window.location.hash.replace(/^#\/?/, '')

export default function App() {
  const [route, setRoute] = useState(readHash)
  const [open, setOpen] = useState<{ card: DinoCard; rect: DOMRect } | null>(null)

  useEffect(() => {
    const onHash = () => setRoute(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const person = data.people.find((p) => p.id === route)
  const openCard = useCallback((card: DinoCard, rect: DOMRect) => setOpen({ card, rect }), [])

  if (!person) return <Home data={data} onPick={(id) => (window.location.hash = `/${id}`)} />

  return (
    <>
      <Binder
        person={person}
        cards={data.cards.filter((c) => c.owner === person.id)}
        hiddenId={open?.card.id ?? null}
        onOpenCard={openCard}
        onBack={() => (window.location.hash = '')}
      />
      {open && <CardViewer card={open.card} owner={person} from={open.rect} onClose={() => setOpen(null)} />}
    </>
  )
}
