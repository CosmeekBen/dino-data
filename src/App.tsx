import { useCallback, useEffect, useState } from 'react'
import raw from './data/cards.json'
import type { CardsData, DinoCard } from './types'
import { Home } from './components/Home'
import { Binder, type FlyFrom } from './components/Binder'
import { CardViewer } from './components/CardViewer'

const data = raw as CardsData

const readHash = () => window.location.hash.replace(/^#\/?/, '')

export default function App() {
  const [route, setRoute] = useState(readHash)
  const [open, setOpen] = useState<{ card: DinoCard; rect: DOMRect } | null>(null)
  const [fly, setFly] = useState<FlyFrom | null>(null)

  useEffect(() => {
    const onHash = () => setRoute(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const person = data.people.find((p) => p.id === route)
  const openCard = useCallback((card: DinoCard, rect: DOMRect) => setOpen({ card, rect }), [])

  if (!person)
    return (
      <Home
        data={data}
        onPick={(id, from) => {
          setFly(from)
          window.location.hash = `/${id}`
        }}
      />
    )

  return (
    <>
      <Binder
        key={person.id}
        person={person}
        index={data.people.indexOf(person)}
        cards={data.cards.filter((c) => c.owner === person.id)}
        hiddenId={open?.card.id ?? null}
        onOpenCard={openCard}
        onBack={() => {
          setFly(null)
          window.location.hash = ''
        }}
        flyFrom={fly}
      />
      {open && <CardViewer card={open.card} owner={person} from={open.rect} onClose={() => setOpen(null)} />}
    </>
  )
}
