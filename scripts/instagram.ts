/**
 * Lit les stats Instagram d'un compte professionnel (Créateur ou Entreprise) via l'API Instagram (connexion Instagram).
 *
 *   npx tsx scripts/instagram.ts check --owner ben      # vérifie la clé : compte + 10 derniers posts avec leurs stats
 *   npx tsx scripts/instagram.ts snapshot --owner ben   # ajoute le relevé du jour des posts récents à data/instagram/ben.json
 *
 * La clé d'accès est lue dans la variable d'environnement IG_TOKEN_<OWNER> (ex. IG_TOKEN_BEN). Elle n'est jamais affichée.
 * L'API ne donne que des totaux : la courbe jour par jour se construit en relevant les stats une fois par jour.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const mode = args[0]
const opt = (name: string, fallback: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback)
const owner = opt('owner', 'ben')
/** fenêtre de suivi d'un post, en jours depuis sa publication */
const days = Number(opt('days', '14'))

const tokenVar = `IG_TOKEN_${owner.toUpperCase()}`
const token = process.env[tokenVar]
const base = (process.env.IG_API_BASE ?? 'https://graph.instagram.com').replace(/\/$/, '') +
  (process.env.IG_API_VERSION ? `/${process.env.IG_API_VERSION}` : '')

/** Métriques demandées pour chaque post ; celles que l'API refuse pour un type de post sont ignorées. */
const METRICS = ['reach', 'likes', 'comments', 'shares', 'saved', 'views', 'total_interactions'] as const
type Metric = (typeof METRICS)[number]

interface ApiError {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number }
}

class IgError extends Error {
  constructor(
    public path: string,
    public status: number,
    public body: ApiError,
  ) {
    super(`${path} → HTTP ${status} : ${body.error?.message ?? 'réponse inattendue'} (code ${body.error?.code ?? '?'})`)
  }
}

/** Appel GET à l'API ; l'URL complète (qui contient la clé) n'est jamais journalisée. */
async function api<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(base + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('access_token', token!)
  let res: Response
  try {
    res = await fetch(url)
  } catch (e) {
    throw new Error(`${path} → réseau injoignable (${(e as Error).message})`)
  }
  const body = (await res.json().catch(() => ({}))) as T & ApiError
  if (!res.ok || body.error) throw new IgError(path, res.status, body)
  return body
}

interface Me {
  user_id?: string
  id?: string
  username: string
  account_type?: string
  media_count?: number
}
interface Media {
  id: string
  caption?: string
  media_type: string
  media_product_type?: string
  permalink: string
  timestamp: string
  like_count?: number
  comments_count?: number
}

async function insights(id: string): Promise<{ values: Partial<Record<Metric, number>>; refused: string[] }> {
  const read = (data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[]) => {
    const out: Partial<Record<Metric, number>> = {}
    for (const d of data) out[d.name as Metric] = d.total_value?.value ?? d.values?.[0]?.value ?? 0
    return out
  }
  try {
    const r = await api<{ data: Parameters<typeof read>[0] }>(`/${id}/insights`, { metric: METRICS.join(',') })
    return { values: read(r.data), refused: [] }
  } catch (e) {
    if (!(e instanceof IgError) || e.status >= 500) throw e
    // une métrique non prise en charge fait échouer toute la requête : on les reprend une par une
    const values: Partial<Record<Metric, number>> = {}
    const refused: string[] = []
    for (const m of METRICS) {
      try {
        Object.assign(values, read((await api<{ data: Parameters<typeof read>[0] }>(`/${id}/insights`, { metric: m })).data))
      } catch (err) {
        if (err instanceof IgError && err.status < 500) refused.push(m)
        else throw err
      }
    }
    return { values, refused }
  }
}

async function me() {
  return api<Me>('/me', { fields: 'user_id,username,account_type,media_count' })
}

async function recentMedia(limit: number) {
  const r = await api<{ data: Media[] }>('/me/media', {
    fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count',
    limit: String(limit),
  })
  return r.data
}

const n = (v: number | undefined) => (v === undefined ? '—' : v.toLocaleString('fr-FR'))
const short = (s = '', len = 38) => (s.replace(/\s+/g, ' ').length > len ? s.replace(/\s+/g, ' ').slice(0, len - 1) + '…' : s.replace(/\s+/g, ' '))

async function check() {
  const account = await me()
  console.log(`✓ Clé valide pour @${account.username} (${account.account_type ?? 'type inconnu'}, ${n(account.media_count)} publications)\n`)
  if (account.account_type && !['BUSINESS', 'MEDIA_CREATOR', 'CREATOR'].includes(account.account_type))
    console.log('  ⚠ Le compte doit être professionnel (Créateur ou Entreprise) pour lire les statistiques.\n')

  const posts = await recentMedia(10)
  if (!posts.length) {
    console.log('Aucune publication trouvée.')
    return
  }
  const refusedAll = new Set<string>()
  const rows = []
  for (const p of posts) {
    const { values, refused } = await insights(p.id)
    refused.forEach((m) => refusedAll.add(`${m} (${p.media_product_type ?? p.media_type})`))
    rows.push({
      date: p.timestamp.slice(0, 10),
      type: p.media_product_type ?? p.media_type,
      légende: short(p.caption),
      likes: n(values.likes ?? p.like_count),
      comm: n(values.comments ?? p.comments_count),
      partages: n(values.shares),
      enreg: n(values.saved),
      portée: n(values.reach),
      vues: n(values.views),
    })
  }
  console.table(rows)
  if (refusedAll.size) console.log(`Métriques non disponibles pour certains types de posts : ${[...refusedAll].join(', ')}`)
  console.log('\nTout est prêt pour le relevé quotidien (mode snapshot).')
}

interface Snapshot {
  at: string
  likes: number
  comments: number
  shares: number
  saves: number
  reach: number
  views: number
}
interface Store {
  owner: string
  username: string
  posts: Record<string, { permalink: string; timestamp: string; caption: string; type: string; series: Snapshot[] }>
}

async function snapshot() {
  const account = await me()
  const file = join('data', 'instagram', `${owner}.json`)
  mkdirSync(join('data', 'instagram'), { recursive: true })
  const store: Store = existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf8'))
    : { owner, username: account.username, posts: {} }
  store.username = account.username

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const posts = (await recentMedia(30)).filter((p) => (now.getTime() - Date.parse(p.timestamp)) / 864e5 <= days + 0.5)
  for (const p of posts) {
    const { values } = await insights(p.id)
    const entry = (store.posts[p.id] ??= {
      permalink: p.permalink,
      timestamp: p.timestamp,
      caption: p.caption ?? '',
      type: p.media_product_type ?? p.media_type,
      series: [],
    })
    const snap: Snapshot = {
      at: now.toISOString(),
      likes: values.likes ?? p.like_count ?? 0,
      comments: values.comments ?? p.comments_count ?? 0,
      shares: values.shares ?? 0,
      saves: values.saved ?? 0,
      reach: values.reach ?? 0,
      views: values.views ?? 0,
    }
    // un seul relevé par jour : celui de la dernière exécution
    if (entry.series.length && entry.series[entry.series.length - 1].at.slice(0, 10) === today) entry.series.pop()
    entry.series.push(snap)
    console.log(`• ${p.timestamp.slice(0, 10)} ${short(p.caption, 30)} — ${snap.likes} likes, ${snap.reach} portée (${entry.series.length} relevés)`)
  }
  writeFileSync(file, JSON.stringify(store, null, 2) + '\n')
  console.log(`\n✓ ${posts.length} posts suivis → ${file}`)
}

async function main() {
  if (!token) {
    console.error(`✗ Variable ${tokenVar} absente : ajoute la clé d'accès Instagram de « ${owner} » dans les secrets.`)
    process.exit(1)
  }
  if (mode === 'check') await check()
  else if (mode === 'snapshot') await snapshot()
  else {
    console.error('Usage : tsx scripts/instagram.ts <check|snapshot> [--owner ben] [--days 14]')
    process.exit(1)
  }
}

main().catch((e: Error) => {
  console.error(`✗ ${e.message}`)
  if (e instanceof IgError && e.body.error?.code === 190)
    console.error("  La clé est invalide ou expirée : régénère-la dans le tableau de bord Meta et mets à jour le secret.")
  process.exit(1)
})
