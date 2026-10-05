export interface Person {
  id: string
  name: string
  color: string
}

export interface PostStats {
  likes: number
  comments: number
  shares: number
  saves: number
  reach: number
  /** Likes cumulés ou quotidiens du post, un point par jour depuis la publication. */
  curve: number[]
}

export interface DinoCard {
  id: string
  owner: string
  dino: string
  postUrl: string
  postedAt: string
  stats: PostStats
}

export interface CardsData {
  people: Person[]
  cards: DinoCard[]
}
