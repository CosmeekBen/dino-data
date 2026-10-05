import {
  type Dims,
  type M4,
  type Strip,
  PAGE,
  apply,
  cameraOf,
  chain,
  clamp,
  coverPose,
  css,
  lerp,
  makeStrips,
  makeView,
  mul,
  pagePose,
  pointAlong,
  project,
  rotX,
  rotY,
  shade,
  translate,
  unproject,
  viewMatrix,
} from './binderGeometry'

/**
 * Moteur d'animation du classeur : physique des feuillets (glisser, lâcher, ressort, rebond),
 * calcul des poses 3D et écriture directe des transformations dans le DOM (sans re-rendu React).
 *
 * Feuille 0 = couverture avant (rigide, entraîne le dos et les anneaux) ; feuilles 1..S = feuillets de pochettes.
 * Avancement `p` : 0 = posée à droite (ou couverture fermée), 1 = posée à gauche.
 */

type Mode = 'rest' | 'drag' | 'spring' | 'tween'

interface Leaf {
  p: number
  v: number
  bend: number
  vb: number
  target: 0 | 1
  mode: Mode
  /** soulèvement au survol du bord (en avancement) */
  peek: number
  idle: boolean
  tw: { from: number; to: number; t: number; dur: number } | null
}

/** Une face = un quadrilatère projeté à l'écran (matrix3d), avec son calque d'ombrage éventuel. */
export interface FaceEls {
  el: HTMLElement
  shade?: HTMLElement | null
}
export interface StripEls {
  front: FaceEls
  rear: FaceEls
}
export interface SheetHandle {
  flat: StripEls | null
  strips: (StripEls | null)[] | null
}

export interface EngineEvents {
  /** nombre de feuilles tournées (ou en train de l'être) vers la gauche */
  count(n: number): void
  /** feuillets en mouvement, qui doivent être rendus en bandes pliables */
  live(ids: number[]): void
  /** première interaction de l'utilisateur (pour masquer l'aide) */
  touched(): void
}

interface Grab {
  leaf: number
  dir: 1 | -1
  s: number
  y: number
  pointerId: number
  sx: number
  solved: number
  samples: { t: number; p: number }[]
}

interface Pending {
  leaf: number
  dir: 1 | -1
  x0: number
  y0: number
  xl: number
  yl: number
  pointerId: number
  onSlot: boolean
}

/** N'écrit une propriété de style que si sa valeur a changé (le décor fixe n'est pas réinvalidé à chaque image). */
const written = new WeakMap<HTMLElement, Record<string, string>>()
function put(el: HTMLElement, prop: 'transform' | 'zIndex' | 'visibility' | 'background' | 'opacity' | 'height', value: string) {
  let cache = written.get(el)
  if (!cache) written.set(el, (cache = {}))
  if (cache[prop] === value) return
  cache[prop] = value
  el.style[prop] = value
}

const BEND_MAX = 95
const PEEK = 0.035
const RAD = Math.PI / 180
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)

export class BinderEngine {
  d: Dims
  readonly sheets: number
  reducedMotion = false

  private leaves: Leaf[]
  private handles = new Map<number, SheetHandle>()
  private els = new Map<string, HTMLElement>()
  private refCbs = new Map<string, (el: HTMLElement | null) => void>()
  private stage: HTMLElement | null = null
  private shift: number
  private vShift = 0
  private engaged = false
  private grab: Grab | null = null
  private pending: Pending | null = null
  private suppressUntil = 0
  private raf = 0
  private last = 0
  private pose: Strip[] = makeStrips()
  private tmp: Strip[] = makeStrips()
  private liveKey = ''
  private countVal = 0

  constructor(sheets: number, d: Dims, private ev: EngineEvents) {
    this.d = d
    this.sheets = sheets
    this.leaves = Array.from({ length: sheets + 1 }, () => ({
      p: 0, v: 0, bend: 0, vb: 0, target: 0 as 0 | 1, mode: 'rest' as Mode, peek: 0, idle: true, tw: null,
    }))
    this.shift = d.closedShift
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  setDims(d: Dims) {
    const closed = this.shift === this.d.closedShift
    this.d = d
    if (closed) this.shift = d.closedShift
    this.renderAll()
  }

  // ───────── Enregistrement du DOM ─────────

  attachStage(el: HTMLElement | null) {
    this.stage = el
    this.renderAll()
  }

  /** Référence DOM stable pour un élément fixe du décor (plats, dos, anneaux, ombres…). */
  ref(key: string) {
    let cb = this.refCbs.get(key)
    if (!cb) {
      cb = (el) => {
        if (el) this.els.set(key, el)
        else this.els.delete(key)
      }
      this.refCbs.set(key, cb)
    }
    return cb
  }

  attachSheet(i: number, h: SheetHandle) {
    this.handles.set(i, h)
    this.renderAll()
  }
  detachSheet(i: number, h: SheetHandle) {
    if (this.handles.get(i) === h) this.handles.delete(i)
  }

  get count() {
    return this.countVal
  }

  // ───────── Commandes ─────────

  /** Tourne la feuille suivante (dir = 1) ou précédente (dir = -1), avec une main « virtuelle ». */
  turn(dir: 1 | -1) {
    const i = dir > 0 ? this.countVal : this.countVal - 1
    if (i < 0 || i > this.sheets) return
    const L = this.leaves[i]
    if (L.mode === 'drag') return
    L.target = dir > 0 ? 1 : 0
    const dist = Math.abs(L.target - L.p)
    L.mode = 'tween'
    L.peek = 0
    L.idle = false
    L.tw = { from: L.p, to: L.target, t: 0, dur: this.reducedMotion ? 0.001 : (i === 0 ? 1 : 0.85) * Math.max(0.4, dist) }
    if (i === 0) this.engaged = true
    this.ev.touched()
    this.sync()
    this.kick()
  }

  /** À appeler par les cartes : vrai si le clic suit un glisser (et doit être ignoré). */
  swallowClick() {
    return performance.now() < this.suppressUntil
  }

  pointerDown(e: PointerEvent) {
    if (e.button !== 0 || this.grab) return
    const d = this.d
    const [sx, sy] = this.local(e)
    const n = this.countVal
    const [x, y] = unproject(this.view(), sx, sy, n === 0 ? 2 * d.r + d.tc : 0)
    if (Math.abs(y) > d.ch / 2) return
    let leaf: number
    let dir: 1 | -1
    if (n === 0) {
      if (x < d.r - 4 || x > d.r + d.cw + 4) return
      leaf = 0
      dir = 1
    } else if (x >= 0) {
      if (n > this.sheets || x > d.r + d.cw) return
      leaf = n
      dir = 1
    } else {
      if (x < -(d.r + d.cw)) return
      leaf = n - 1
      dir = -1
    }
    const onSlot = !!(e.target instanceof Element && e.target.closest('.slot'))
    this.pending = { leaf, dir, x0: e.clientX, y0: e.clientY, xl: x, yl: y, pointerId: e.pointerId, onSlot }
  }

  pointerMove(e: PointerEvent) {
    const pd = this.pending
    if (pd && e.pointerId === pd.pointerId) {
      if (e.pointerType === 'mouse' && e.buttons === 0) this.pending = null
      else {
        if (Math.hypot(e.clientX - pd.x0, e.clientY - pd.y0) > 7) this.startDrag(e, pd)
        return
      }
    }
    const g = this.grab
    if (g && e.pointerId === g.pointerId) {
      g.sx = this.local(e)[0]
      this.kick()
      return
    }
    if (!g && e.pointerType === 'mouse' && e.buttons === 0) this.hover(e)
  }

  pointerUp(e: PointerEvent) {
    const g = this.grab
    if (g && e.pointerId === g.pointerId) {
      this.release(g)
      return
    }
    const pd = this.pending
    if (pd && e.pointerId === pd.pointerId) {
      this.pending = null
      if (!pd.onSlot) this.turn(pd.dir)
    }
  }

  pointerLeave() {
    if (!this.grab) this.setPeek(-1)
  }

  // ───────── Interaction ─────────

  private local(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.stage?.getBoundingClientRect()
    if (!r) return [0, 0]
    return [e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)]
  }

  private view() {
    return makeView(this.d, this.shift)
  }

  private startDrag(e: PointerEvent, pd: Pending) {
    this.pending = null
    const d = this.d
    const L = this.leaves[pd.leaf]
    let s: number
    if (pd.leaf === 0) {
      s = pd.dir > 0 ? pd.xl - d.r : -d.r - pd.xl
      s = clamp(s, 0.3 * d.cw, d.cw)
      this.engaged = true
    } else {
      const inner = d.r - d.h0
      s = pd.dir > 0 ? pd.xl - inner : -inner - pd.xl
      s = clamp(s, 0.3 * d.pw, d.pw)
    }
    L.mode = 'drag'
    L.tw = null
    L.peek = 0
    L.idle = false
    this.setPeek(-1)
    this.grab = {
      leaf: pd.leaf, dir: pd.dir, s, y: pd.yl, pointerId: pd.pointerId,
      sx: this.local(e)[0], solved: L.p, samples: [{ t: performance.now(), p: L.p }],
    }
    try {
      this.stage?.setPointerCapture(pd.pointerId)
    } catch {
      /* pointeur déjà relâché */
    }
    this.ev.touched()
    this.sync()
    this.kick()
  }

  private release(g: Grab) {
    this.grab = null
    this.suppressUntil = performance.now() + 120
    const L = this.leaves[g.leaf]
    const s = g.samples
    const a = s[0]
    const b = s[s.length - 1]
    const v = b.t - a.t > 8 ? ((b.p - a.p) / (b.t - a.t)) * 1000 : 0
    L.v = clamp(v, -6, 6)
    L.target = L.v > 0.9 ? 1 : L.v < -0.9 ? 0 : L.p > 0.5 ? 1 : 0
    L.mode = 'spring'
    L.idle = false
    this.sync()
    this.kick()
  }

  private dragBend(g: Grab, p: number) {
    return g.dir * BEND_MAX * clamp(g.s / this.d.pw, 0.35, 1) * Math.sin(Math.PI * p)
  }

  /** Position écran (x) du point saisi pour un avancement donné. */
  private grabX(g: Grab, p: number, v: ReturnType<typeof makeView>) {
    const d = this.d
    if (g.leaf === 0) {
      const c = coverPose(d, p)
      const a = c.panel * RAD
      const x = c.ex + g.s * Math.cos(a) - d.tc * Math.sin(a)
      const z = c.ez + g.s * Math.sin(a) + d.tc * Math.cos(a)
      return project(v, x, g.y, z)[0]
    }
    this.posePage(g.leaf, p, this.dragBend(g, p), this.tmp)
    const [x, z] = pointAlong(d, this.tmp, g.s)
    return project(v, x, g.y, z)[0]
  }

  /** Cherche l'avancement qui place le point saisi sous le pointeur (racine la plus proche de la précédente). */
  private solve(g: Grab) {
    const v = this.view()
    const N = 36
    let best = -1
    let bestD = Infinity
    let pa = 0
    let fa = this.grabX(g, 0, v) - g.sx
    const f0 = fa
    for (let k = 1; k <= N; k++) {
      const pb = k / N
      const fb = this.grabX(g, pb, v) - g.sx
      if (fa === 0 || fa < 0 !== fb < 0) {
        let lo = pa
        let hi = pb
        let flo = fa
        for (let it = 0; it < 16; it++) {
          const m = (lo + hi) / 2
          const fm = this.grabX(g, m, v) - g.sx
          if (fm < 0 === flo < 0) {
            lo = m
            flo = fm
          } else hi = m
        }
        const root = (lo + hi) / 2
        const dd = Math.abs(root - g.solved)
        if (dd < bestD) {
          bestD = dd
          best = root
        }
      }
      pa = pb
      fa = fb
    }
    if (best < 0) best = Math.abs(f0) <= Math.abs(fa) ? 0 : 1
    g.solved = best
    return best
  }

  private hover(e: PointerEvent) {
    const d = this.d
    const [sx, sy] = this.local(e)
    const n = this.countVal
    const [x, y] = unproject(this.view(), sx, sy, n === 0 ? 2 * d.r + d.tc : 0)
    let want = -1
    // zone de survol limitée à la marge extérieure, pour ne pas gêner le clic sur les cartes
    const zone = 0.04 * d.pw
    const edge = d.r - d.h0 + d.pw
    if (Math.abs(y) < d.ph / 2) {
      if (n === 0) {
        if (x > d.r + d.cw - 0.12 * d.pw && x < d.r + d.cw + 6) want = 0
      } else if (x > 0) {
        if (n <= this.sheets && x > edge - zone && x < d.r + d.cw + 6) want = n
      } else if (x < -edge + zone && x > -(d.r + d.cw) - 6) want = n - 1
    }
    this.setPeek(want)
  }

  private setPeek(want: number) {
    let changed = false
    this.leaves.forEach((L, i) => {
      const peek = i === want && (L.mode === 'rest' || L.mode === 'spring') ? PEEK : 0
      if (peek !== L.peek && L.mode !== 'drag' && L.mode !== 'tween') {
        L.peek = peek
        L.mode = 'spring'
        L.idle = false
        changed = true
      }
    })
    if (changed) {
      this.sync()
      this.kick()
    }
  }

  // ───────── Boucle d'animation ─────────

  private kick() {
    if (this.raf) return
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  private tick = (now: number) => {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000))
    this.last = now
    let active = false

    const g = this.grab
    if (g) {
      const L = this.leaves[g.leaf]
      const target = this.solve(g)
      // léger lissage : la page « décolle » au lieu de sauter quand on l'attrape
      L.p += (target - L.p) * (1 - Math.exp(-dt * 30))
      L.bend = g.leaf ? this.dragBend(g, L.p) : 0
      g.samples.push({ t: now, p: L.p })
      while (g.samples.length > 2 && now - g.samples[0].t > 90) g.samples.shift()
      active = true
    }

    this.leaves.forEach((L, i) => {
      if (L.mode === 'tween' || L.mode === 'spring') this.step(L, i, dt)
      if (L.mode !== 'rest' && !L.idle) active = true
    })

    const L0 = this.leaves[0]
    if (L0.mode === 'rest' && L0.target === 0) this.engaged = false
    const shiftGoal = this.engaged || L0.target === 1 ? 0 : this.d.closedShift
    const ks = 70
    const cs = 2 * Math.sqrt(ks)
    this.vShift += (ks * (shiftGoal - this.shift) - cs * this.vShift) * dt
    this.shift += this.vShift * dt
    if (Math.abs(shiftGoal - this.shift) < 0.2 && Math.abs(this.vShift) < 0.5) {
      this.shift = shiftGoal
      this.vShift = 0
    } else active = true

    this.renderAll()
    this.sync()
    this.raf = active ? requestAnimationFrame(this.tick) : 0
  }

  private step(L: Leaf, i: number, dt: number) {
    if (L.mode === 'tween' && L.tw) {
      const tw = L.tw
      tw.t += dt
      const u = clamp(tw.t / tw.dur, 0, 1)
      const e = easeInOut(u)
      const prev = L.p
      L.p = lerp(tw.from, tw.to, e)
      L.v = (L.p - prev) / dt
      // le bord libre mène pendant la montée, puis traîne pendant la chute
      L.bend = i ? Math.sign(tw.to - tw.from) * BEND_MAX * 0.75 * Math.sin(2 * Math.PI * e) * Math.min(1, Math.abs(tw.to - tw.from) * 1.5) : 0
      if (u >= 1) {
        L.tw = null
        L.mode = 'spring'
        L.v *= 0.4
      }
      return
    }
    const goal = L.target === 0 ? L.peek : 1 - L.peek
    const K = 60
    const C = 2 * Math.sqrt(K) * 0.62
    const KB = 240
    const CB = 2 * Math.sqrt(KB) * 0.32
    const sub = 4
    const h = dt / sub
    const sideSign = L.target === 0 ? 1 : -1
    for (let k = 0; k < sub; k++) {
      L.v += (K * (goal - L.p) - C * L.v) * h
      L.p += L.v * h
      if (L.p > 1) {
        L.p = 1
        if (L.v > 0) L.v *= -0.22
      } else if (L.p < 0) {
        L.p = 0
        if (L.v < 0) L.v *= -0.22
      }
      if (i) {
        const bt = clamp(-L.v * 26, -BEND_MAX, BEND_MAX) * Math.sin(Math.PI * L.p) + (sideSign * L.peek * 900)
        L.vb += (KB * (bt - L.bend) - CB * L.vb) * h
        L.bend += L.vb * h
      }
    }
    const bendGoal = i ? sideSign * L.peek * 900 : 0
    const settled =
      Math.abs(goal - L.p) < 4e-4 && Math.abs(L.v) < 0.02 && Math.abs(L.bend - bendGoal) < 0.25 && Math.abs(L.vb) < 3
    if (settled) {
      L.p = goal
      L.v = 0
      L.bend = bendGoal
      L.vb = 0
      if (L.peek === 0) {
        L.mode = 'rest'
        L.p = L.target
        L.bend = 0
      }
      L.idle = true
    } else L.idle = false
  }

  /** Notifie React du nombre de feuilles tournées et des feuillets en mouvement. */
  private sync() {
    let n = 0
    while (n < this.leaves.length && this.leaves[n].target === 1) n++
    if (n !== this.countVal) {
      this.countVal = n
      this.ev.count(n)
    }
    const live: number[] = []
    for (let i = 1; i < this.leaves.length; i++) if (this.leaves[i].mode !== 'rest') live.push(i)
    const key = live.join(',')
    if (key !== this.liveKey) {
      this.liveKey = key
      this.ev.live(live)
    }
  }

  // ───────── Rendu ─────────

  private zRight(i: number) {
    return (this.sheets - i + 1) * this.d.t
  }
  private zLeft(i: number) {
    return i * this.d.t
  }

  private posePage(i: number, p: number, bend: number, out: Strip[]) {
    const d = this.d
    const q = clamp(p, 0, 1)
    const c = clamp(this.leaves[0].p, 0, 1)
    pagePose(d, q, bend, lerp(this.zRight(i), this.zLeft(i), q), d.slide * (1 - c) * (1 - q), out)
  }

  renderAll() {
    if (!this.stage) return
    const d = this.d
    const v = makeView(d, this.shift)
    const V = viewMatrix(v, d.tilt)
    const cam = cameraOf(v)
    const c = clamp(this.leaves[0].p, 0, 1)
    const coverMoving = this.leaves[0].mode !== 'rest'
    const coverOpen = !coverMoving && this.leaves[0].target === 1

    // ombres sur le bureau
    // ombres sur le bureau : décalées vers le bas (lampe en haut à gauche), plus loin quand le classeur est fermé (plus épais)
    this.place('shadow-open', V, translate(-(d.r + d.cw) + 0.02 * d.pw, -d.ch / 2 + 0.035 * d.pw, -d.tc - 1), 1)
    this.place('shadow-closed', V, translate(d.r + 0.05 * d.pw, -d.ch / 2 + 0.08 * d.pw, -d.tc - 1), 1)
    this.opacity('shadow-open', c * c)
    this.opacity('shadow-closed', 1 - c * c)

    // plat arrière (fixe)
    // plat arrière : couches empilées sous la face intérieure (l'épaisseur suit les coins arrondis)
    for (let k = 0; k < BOARD_LAYERS; k++)
      this.place(`back-body-${k}`, V, translate(d.r, -d.ch / 2, (-d.tc * (BOARD_LAYERS - k)) / BOARD_LAYERS), 5 + k)
    this.place('back-in', V, translate(d.r, -d.ch / 2, 0), 10)

    // dos + mécanisme + anneaux, entraînés par l'ouverture de la couverture
    const pose = coverPose(d, c)
    const S = chain(translate(d.r, -d.ch / 2, 0), rotY(-pose.spine))
    this.face('spine-out', V, cam, mul(S, translate(0, 0, d.tc)), 2 * d.r, d.ch, 20)
    this.face('spine-in', V, cam, chain(S, translate(2 * d.r, 0, 0), rotY(180)), 2 * d.r, d.ch, 20)
    this.place('spine-edge', V, chain(S, translate(0, d.ch, 0), rotX(90)), 21)
    // tranche basse du dos : utile à plat (elle comble l'épaisseur entre les deux plats), parasite quand le dos est debout
    const se = clamp((c - 0.35) / 0.3, 0, 1)
    this.opacity('spine-edge', se * se * (3 - 2 * se))
    const mw = 2 * (d.r - d.h0) - 4
    const mh = d.ph * 0.82
    this.face('mech', V, cam, chain(S, translate(d.r + mw / 2, d.ch / 2 - mh / 2, -2), rotY(180)), mw, mh, 22)
    const [dSp] = shade(pose.spine, -1, 0, 0, d.r, cam)
    this.bg('spine-shade', fill(dSp * 0.7, 0))

    const wires: { el: HTMLElement; m: M4; depth: number }[] = []
    const rh = d.r + d.wire / 2
    PAGE.rings.forEach((ry, j) => {
      for (let k = -2; k <= 2; k++) {
        const el = this.els.get(`wire-${j}-${k}`)
        if (!el) continue
        const m = chain(S, translate(-d.wire / 2, d.ch / 2 + ry * d.ph, 0), rotX(90), translate(0, -rh, (k * d.wire) / 4.6))
        wires.push({ el, m, depth: this.depth(V, m, d.r, rh / 2) })
      }
    })
    wires.sort((a, b) => a.depth - b.depth)
    wires.forEach((w, i) => this.setQuad(w.el, V, w.m, 400 + i))

    // plat avant
    const F = chain(translate(pose.ex, -d.ch / 2, pose.ez), rotY(-pose.panel))
    const zc = coverOpen ? 30 : 900
    // épaisseur du plat : couches de même silhouette entre les deux faces, peintes de la plus éloignée à la plus proche
    const outside = this.facing(mul(F, translate(0, 0, d.tc)), cam, d.cw, d.ch)
    for (let k = 1; k < BOARD_LAYERS; k++) {
      const m = mul(F, translate(0, 0, (d.tc * k) / BOARD_LAYERS))
      this.place(`cover-body-${k}`, V, m, zc + (outside ? k : BOARD_LAYERS - k))
    }
    this.face('cover-out', V, cam, mul(F, translate(0, 0, d.tc)), d.cw, d.ch, zc + BOARD_LAYERS + 1)
    this.face('cover-in', V, cam, chain(F, translate(d.cw, 0, 0), rotY(180)), d.cw, d.ch, zc + BOARD_LAYERS + 1)
    const [dOut, sOut] = shade(pose.panel, 1, pose.ex + d.cw / 2, 0, pose.ez, cam)
    const [dIn, sIn] = shade(pose.panel, -1, pose.ex - d.cw / 2, 0, pose.ez, cam)
    this.bg('cover-out-shade', fill(dOut * 0.75, sOut * 0.25))
    this.bg('cover-in-shade', fill(dIn * 0.75, sIn * 0.2))

    // tranches des piles de feuillets
    let right = 0
    let left = 0
    for (let i = 1; i < this.leaves.length; i++) {
      if (this.leaves[i].target === 0) right++
      else left++
    }
    const inner = d.r - d.h0
    const xR = inner + d.slide * (1 - c)
    this.size('stack-r', right * d.t)
    this.size('stack-l', left * d.t)
    this.place('stack-r', V, chain(translate(xR, d.ph / 2, 0), rotX(90)), 40)
    this.place('stack-l', V, chain(translate(-inner - d.pw, d.ph / 2, 0), rotX(90)), 40)

    // feuillets
    const moving: { i: number; depth: number }[] = []
    for (const i of this.handles.keys()) {
      const L = this.leaves[i]
      if (L.mode === 'rest') this.renderSheet(i, V, cam, L.target === 1 ? 100 + i : 100 + this.sheets + 1 - i)
      else {
        this.posePage(i, L.p, L.bend, this.pose)
        const mid = this.pose[this.pose.length >> 1]
        moving.push({ i, depth: this.depth(V, translate(mid.x, 0, mid.z), 0, 0) })
      }
    }
    moving.sort((a, b) => a.depth - b.depth)
    moving.forEach((m, j) => this.renderSheet(m.i, V, cam, 500 + 40 * j))

    this.renderCasts(V)
  }

  private place(key: string, V: M4, m: M4, z: number) {
    const el = this.els.get(key)
    if (el) this.setQuad(el, V, m, z)
  }

  private setQuad(el: HTMLElement, V: M4, m: M4, z: number) {
    put(el, 'transform', css(mul(V, m)))
    put(el, 'zIndex', String(z))
  }

  /** Face à sens unique : masquée quand on la voit de dos. */
  private face(key: string, V: M4, cam: [number, number, number], m: M4, w: number, h: number, z: number) {
    const el = this.els.get(key)
    if (el) this.setFace(el, V, cam, m, w, h, z)
  }

  /** Vrai si la caméra voit le recto de la face transformée par `m`. */
  private facing(m: M4, cam: [number, number, number], w: number, h: number) {
    const [cx, cy, cz] = apply(m, w / 2, h / 2)
    return m[8] * (cam[0] - cx) + m[9] * (cam[1] - cy) + m[10] * (cam[2] - cz) > 0
  }

  private setFace(el: HTMLElement, V: M4, cam: [number, number, number], m: M4, w: number, h: number, z: number) {
    const seen = this.facing(m, cam, w, h)
    put(el, 'visibility', seen ? '' : 'hidden')
    if (seen) this.setQuad(el, V, m, z)
  }

  /** Profondeur caméra du point local (x, y) d'une face (plus grand = plus proche). */
  private depth(V: M4, m: M4, x: number, y: number) {
    const [px, py, pz] = apply(m, x, y)
    // V = perspective × rotX × translation : la 3e ligne donne la profondeur avant division
    return V[2] * px + V[6] * py + V[10] * pz + V[14]
  }

  private opacity(key: string, o: number) {
    const el = this.els.get(key)
    if (el) put(el, 'opacity', o.toFixed(3))
  }
  private size(key: string, h: number) {
    const el = this.els.get(key)
    if (el) put(el, 'height', `${h}px`)
  }
  private bg(key: string, b: string) {
    const el = this.els.get(key)
    if (el) put(el, 'background', b)
  }

  private renderSheet(i: number, V: M4, cam: [number, number, number], zBase: number) {
    const h = this.handles.get(i)
    if (!h) return
    const d = this.d
    const L = this.leaves[i]
    const s = this.pose
    this.posePage(i, L.p, L.bend, s)
    if (h.flat) {
      const B = chain(translate(s[0].x, -d.ph / 2, s[0].z), rotY(-s[0].a))
      this.setFace(h.flat.front.el, V, cam, B, d.pw, d.ph, zBase)
      this.setFace(h.flat.rear.el, V, cam, chain(B, translate(d.pw, 0, 0), rotY(180)), d.pw, d.ph, zBase)
    }
    if (!h.strips) return
    const n = s.length
    const w = d.pw / n
    const order: { el: HTMLElement; m: M4; depth: number; seen: boolean; low: boolean }[] = []
    for (let k = 0; k < n; k++) {
      const st = h.strips[k]
      if (!st) continue
      const B = chain(translate(s[k].x, -d.ph / 2, s[k].z), rotY(-s[k].a))
      const wk = k < n - 1 ? w + STRIP_OVERLAP : w
      const R = chain(B, translate(wk, 0, 0), rotY(180))
      const [cx, cy, cz] = apply(B, w / 2, d.ph / 2)
      const front = B[8] * (cam[0] - cx) + B[9] * (cam[1] - cy) + B[10] * (cam[2] - cz) > 0
      const dep = this.depth(V, B, w / 2, d.ph / 2)
      // une bande encore proche des anneaux (en x et en hauteur) passe dessous : ils traversent ses trous
      const zEnd = s[k].z + w * Math.sin(s[k].a * RAD)
      const xEnd = s[k].x + w * Math.cos(s[k].a * RAD)
      const low = Math.max(s[k].z, zEnd) < d.r * 0.8 && Math.min(Math.abs(s[k].x), Math.abs(xEnd)) < d.r * 1.3
      order.push({ el: st.front.el, m: B, depth: dep, seen: front, low })
      order.push({ el: st.rear.el, m: R, depth: dep, seen: !front, low })
      // ombrage évalué aux deux bords de la bande (angle et position partagés avec la voisine : pas de marche)
      const aL = k ? (s[k - 1].a + s[k].a) / 2 : s[k].a
      const aR = k < n - 1 ? (s[k].a + s[k + 1].a) / 2 : s[k].a
      const xR = k < n - 1 ? s[k + 1].x : s[k].x + w * Math.cos(s[k].a * RAD)
      const zR = k < n - 1 ? s[k + 1].z : s[k].z + w * Math.sin(s[k].a * RAD)
      const facing = front ? 1 : -1
      const [dL, gL] = shade(aL, facing, s[k].x, 0, s[k].z, cam)
      const [dR, gR] = shade(aR, facing, xR, 0, zR, cam)
      const sh = front ? st.front.shade : st.rear.shade
      if (sh) put(sh, 'background', ramp(front ? 90 : 270, dL, dR, gL, gR))
    }
    order.sort((a, b) => a.depth - b.depth)
    order.forEach((o, j) => {
      put(o.el, 'visibility', o.seen ? '' : 'hidden')
      if (o.seen) this.setQuad(o.el, V, o.m, o.low && zBase >= 500 ? 350 + j : zBase + j)
    })
  }

  /** Ombres portées des feuilles en mouvement sur les pages du dessous. */
  private renderCasts(V: M4) {
    const d = this.d
    const c = clamp(this.leaves[0].p, 0, 1)
    const inner = d.r - d.h0
    const xR = inner + d.slide * (1 - c)
    let topR = 0
    let topL = 0
    for (let i = this.leaves.length - 1; i >= 1; i--) {
      const L = this.leaves[i]
      if (L.mode === 'rest' && L.target === 0) topR = this.zRight(i)
    }
    for (let i = 1; i < this.leaves.length; i++) {
      const L = this.leaves[i]
      if (L.mode === 'rest' && L.target === 1) topL = this.zLeft(i)
    }
    const zR = topR + d.t * 0.5
    const zL = topL + d.t * 0.5
    const layersR: string[] = []
    const layersL: string[] = []
    const pts: [number, number][] = []
    for (let i = 0; i < this.leaves.length; i++) {
      const L = this.leaves[i]
      if (L.mode === 'rest' || (L.idle && L.peek === 0)) continue
      pts.length = 0
      if (i === 0) {
        const pose = coverPose(d, c)
        const a = pose.panel * RAD
        for (let k = 0; k <= 6; k++) pts.push([pose.ex + (d.cw * k * Math.cos(a)) / 6, pose.ez + (d.cw * k * Math.sin(a)) / 6])
      } else {
        this.posePage(i, L.p, L.bend, this.tmp)
        for (const st of this.tmp) pts.push([st.x, st.z])
        const last = this.tmp[this.tmp.length - 1]
        const w = d.pw / this.tmp.length
        pts.push([last.x + w * Math.cos(last.a * RAD), last.z + w * Math.sin(last.a * RAD)])
      }
      const r = castRamp(pts, xR, zR, 1, d)
      if (r) layersR.push(r)
      const l = castRamp(pts, -inner, zL, -1, d)
      if (l) layersL.push(l)
    }
    this.place('cast-r', V, translate(xR, -d.ph / 2, zR), 300)
    this.place('cast-l', V, translate(-inner - d.pw, -d.ph / 2, zL), 300)
    this.bg('cast-r', layersR.join(',') || 'none')
    this.bg('cast-l', layersL.join(',') || 'none')
  }
}

/** Nombre de couches qui donnent leur épaisseur aux plats de couverture. */
export const BOARD_LAYERS = 5

/** Recouvrement des bandes d'une page pliée, pour éviter les jours entre elles. */
export const STRIP_OVERLAP = 1

const fill = (dark: number, spec: number) =>
  `linear-gradient(rgba(255,255,255,${spec.toFixed(3)}),rgba(255,255,255,${spec.toFixed(3)})),rgba(0,0,0,${dark.toFixed(3)})`

const ramp = (deg: number, d0: number, d1: number, s0: number, s1: number) =>
  `linear-gradient(${deg}deg,rgba(255,255,255,${(s0 * 0.42).toFixed(3)}),rgba(255,255,255,${(s1 * 0.42).toFixed(3)})),` +
  `linear-gradient(${deg}deg,rgba(0,0,0,${(d0 * 0.72).toFixed(3)}),rgba(0,0,0,${(d1 * 0.72).toFixed(3)}))`

/**
 * Dégradé d'ombre projetée sur une page posée (côté +1 = droite, -1 = gauche) :
 * sombre là où la feuille au-dessus est proche, plus doux sous la partie soulevée.
 */
function castRamp(pts: [number, number][], x0: number, z0: number, side: 1 | -1, d: Dims) {
  const stops: [number, number][] = []
  let far = -1
  let farZ = 0
  for (const [x, z] of pts) {
    const u = (x - x0) * side
    if (u < 0 || u > d.pw * 1.05) continue
    const hgt = Math.max(0, z - z0)
    stops.push([u, 0.5 * Math.exp(-hgt / (0.22 * d.pw))])
    if (u > far) {
      far = u
      farZ = hgt
    }
  }
  if (!stops.length) return ''
  stops.sort((a, b) => a[0] - b[0])
  const spread = 0.035 * d.pw + farZ * 0.45
  const last = stops[stops.length - 1]
  const list = stops.map(([u, a]) => `rgba(0,0,0,${a.toFixed(3)}) ${u.toFixed(1)}px`)
  list.push(`rgba(0,0,0,0) ${(last[0] + spread).toFixed(1)}px`)
  return `linear-gradient(${side > 0 ? 90 : 270}deg,${list.join(',')})`
}
