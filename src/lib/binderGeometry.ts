/**
 * Géométrie du classeur ouvert, en pixels, dans le repère du classeur :
 *   x vers la droite (0 = centre des anneaux), y vers le bas (0 = milieu des pages), z vers le haut (0 = intérieur des couvertures).
 *
 * Les feuillets tournent autour des anneaux : chaque feuillet est découpé en bandes verticales
 * dont l'angle varie le long de la page, ce qui la fait se courber comme une vraie pochette plastique.
 */

export interface Dims {
  /** largeur / hauteur d'une page */
  pw: number
  ph: number
  /** rayon des anneaux (= demi-largeur du dos) */
  r: number
  /** distance entre le bord intérieur de la page et ses trous */
  h0: number
  /** largeur / hauteur des plats de couverture */
  cw: number
  ch: number
  /** épaisseur du carton de couverture */
  tc: number
  /** épaisseur d'un feuillet (pas de la pile) */
  t: number
  /** épaisseur du fil des anneaux */
  wire: number
  /** distance de la caméra (perspective CSS) et inclinaison du bureau, en degrés */
  persp: number
  tilt: number
  /** décalage horizontal pour centrer le classeur fermé */
  closedShift: number
  /** glissement des feuillets sur les anneaux quand le classeur se ferme */
  slide: number
}

/** Mise en page d'une face de feuillet (fractions de la largeur de page). */
export const PAGE = {
  ratio: 1.3,
  binding: 0.105,
  outer: 0.03,
  top: 0.03,
  gap: 0.016,
  /** positions verticales des anneaux / trous, en fraction de la hauteur depuis le milieu */
  rings: [-0.32, 0, 0.32],
  cols: 3,
  rows: 3,
}
export const PER_PAGE = PAGE.cols * PAGE.rows
export const COL_W = (1 - PAGE.binding - PAGE.outer - (PAGE.cols - 1) * PAGE.gap) / PAGE.cols

/** Plage horizontale [début, fin] (en fraction de largeur) de la colonne `k` d'une face. */
export function columnSpan(k: number, side: 'front' | 'rear'): [number, number] {
  const start = (side === 'front' ? PAGE.binding : PAGE.outer) + k * (COL_W + PAGE.gap)
  return [start, start + COL_W]
}

export const N_STRIPS = 14

export function computeDims(vw: number, vh: number): Dims {
  const narrow = vw < 720
  const fit = Math.max(120, Math.min((vw - (narrow ? 20 : 64)) / 2.26, (vh - (narrow ? 140 : 168)) / 1.43, 560))
  // largeur multiple du nombre de bandes : des bandes de largeur entière ne laissent pas de jour entre elles
  const pw = Math.floor(fit / N_STRIPS) * N_STRIPS
  const r = 0.075 * pw
  const h0 = 0.04 * pw
  const cw = 1.035 * pw
  return {
    pw,
    ph: Math.round(PAGE.ratio * pw),
    r,
    h0,
    cw,
    ch: Math.round(PAGE.ratio * pw + 0.07 * pw),
    tc: Math.max(3, 0.011 * pw),
    t: Math.max(1.2, 0.0034 * pw),
    wire: Math.max(3, 0.017 * pw),
    persp: 5.6 * pw,
    tilt: 13,
    closedShift: -(r + cw / 2),
    slide: h0 + 0.01 * pw,
  }
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const RAD = Math.PI / 180

export interface Strip {
  /** bord intérieur de la bande */
  x: number
  z: number
  /** angle de la bande (0 = à plat à droite, 180 = à plat à gauche), en degrés */
  a: number
}

export const makeStrips = (n = N_STRIPS): Strip[] => Array.from({ length: n }, () => ({ x: 0, z: 0, a: 0 }))

/**
 * Pose d'un feuillet : `p` = avancement (0 à droite → 1 à gauche), `bend` = écart d'angle entre le bord libre
 * et la charnière (positif : le bord libre est en avance, comme quand on tire la page par le coin).
 */
export function pagePose(d: Dims, p: number, bend: number, zBase: number, dx: number, out: Strip[]) {
  const n = out.length
  const base = 180 * p
  for (let i = 0; i < n; i++) out[i].a = clamp(base + bend * ((i + 0.5) / n - 0.5), 0, 180)
  // Les trous glissent le long de l'anneau : la page rayonne depuis le centre des anneaux.
  const a0 = out[0].a * RAD
  let x = (d.r - d.h0) * Math.cos(a0) + dx
  let z = (d.r - d.h0) * Math.sin(a0) + zBase
  const w = d.pw / n
  for (let i = 0; i < n; i++) {
    out[i].x = x
    out[i].z = z
    const a = out[i].a * RAD
    x += w * Math.cos(a)
    z += w * Math.sin(a)
  }
}

/** Point situé à la distance `s` du bord intérieur, sur une page posée par `pagePose`. */
export function pointAlong(d: Dims, strips: Strip[], s: number): [number, number] {
  const w = d.pw / strips.length
  const k = clamp(Math.floor(s / w), 0, strips.length - 1)
  const f = s - k * w
  const a = strips[k].a * RAD
  return [strips[k].x + f * Math.cos(a), strips[k].z + f * Math.sin(a)]
}

export interface CoverPose {
  /** angle du dos (90 = debout, classeur fermé ; 180 = à plat) */
  spine: number
  /** angle du plat avant (0 = fermé par-dessus, 180 = ouvert à gauche) */
  panel: number
  /** charnière dos ↔ plat */
  ex: number
  ez: number
}

export function coverPose(d: Dims, c: number): CoverPose {
  const spine = 90 + 90 * c
  const panel = 180 * c
  return {
    spine,
    panel,
    ex: d.r + 2 * d.r * Math.cos(spine * RAD),
    ez: 2 * d.r * Math.sin(spine * RAD),
  }
}

// ───────── Projection (perspective CSS + inclinaison du bureau) ─────────

export interface View {
  shift: number
  persp: number
  cos: number
  sin: number
}

export function makeView(d: Dims, shift: number): View {
  return { shift, persp: d.persp, cos: Math.cos(d.tilt * RAD), sin: Math.sin(d.tilt * RAD) }
}

/** Projette un point du classeur à l'écran (relatif à l'origine de la perspective). */
export function project(v: View, x: number, y: number, z: number): [number, number] {
  const x1 = x + v.shift
  const y2 = y * v.cos - z * v.sin
  const z2 = y * v.sin + z * v.cos
  const k = v.persp / (v.persp - z2)
  return [x1 * k, y2 * k]
}

/** Point du classeur à la hauteur `z0` qui se projette en (sx, sy). */
export function unproject(v: View, sx: number, sy: number, z0: number): [number, number] {
  const P = v.persp
  const y = (sy * P - sy * z0 * v.cos + P * z0 * v.sin) / (P * v.cos + sy * v.sin)
  const z2 = y * v.sin + z0 * v.cos
  return [(sx * (P - z2)) / P - v.shift, y]
}

/** Position de la caméra dans le repère du classeur. */
export function cameraOf(v: View): [number, number, number] {
  return [-v.shift, v.persp * v.sin, v.persp * v.cos]
}

// ───────── Éclairage ─────────

const L = (() => {
  const l = [-0.42, -0.55, 1]
  const n = Math.hypot(l[0], l[1], l[2])
  return l.map((c) => c / n) as [number, number, number]
})()

/**
 * Ombrage d'une face inclinée d'un angle `a` autour de l'axe des anneaux, relatif à la même face posée à plat.
 * `facing` = 1 pour le recto (visible à plat à droite), -1 pour le verso.
 * Renvoie [assombrissement 0..1, reflet spéculaire 0..1].
 */
export function shade(a: number, facing: 1 | -1, px: number, py: number, pz: number, cam: [number, number, number]) {
  const r = a * RAD
  const nx = -Math.sin(r) * facing
  const nz = Math.cos(r) * facing
  const diffuse = Math.max(0, nx * L[0] + nz * L[2])
  const flat = L[2]
  let vx = cam[0] - px
  let vy = cam[1] - py
  let vz = cam[2] - pz
  const vn = Math.hypot(vx, vy, vz)
  vx /= vn
  vy /= vn
  vz /= vn
  const hn = Math.hypot(L[0] + vx, L[1] + vy, L[2] + vz)
  const hx = (L[0] + vx) / hn
  const hz = (L[2] + vz) / hn
  // reflet assez large : film plastique brillant mais pas miroir
  const spec = Math.pow(Math.max(0, nx * hx + nz * hz), 28)
  const specFlat = Math.pow(Math.max(0, hz), 28)
  return [clamp(1 - diffuse / flat, 0, 1), clamp(spec - specFlat, 0, 1)] as const
}

// ───────── Matrices 4×4 (ordre colonne, comme matrix3d CSS) ─────────

export type M4 = Float64Array

export function m4(): M4 {
  const m = new Float64Array(16)
  m[0] = m[5] = m[10] = m[15] = 1
  return m
}

/** a × b (b appliqué en premier). */
export function mul(a: M4, b: M4, out: M4 = new Float64Array(16)): M4 {
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
  return out
}

export function translate(x: number, y: number, z: number): M4 {
  const m = m4()
  m[12] = x
  m[13] = y
  m[14] = z
  return m
}

/** Comme rotateY() en CSS. */
export function rotY(deg: number): M4 {
  const r = deg * RAD
  const m = m4()
  m[0] = Math.cos(r)
  m[2] = -Math.sin(r)
  m[8] = Math.sin(r)
  m[10] = Math.cos(r)
  return m
}

/** Comme rotateX() en CSS. */
export function rotX(deg: number): M4 {
  const r = deg * RAD
  const m = m4()
  m[5] = Math.cos(r)
  m[6] = Math.sin(r)
  m[9] = -Math.sin(r)
  m[10] = Math.cos(r)
  return m
}

/** Produit de plusieurs matrices, la dernière appliquée en premier. */
export function chain(...ms: M4[]): M4 {
  let out = ms[0]
  for (let i = 1; i < ms.length; i++) out = mul(out, ms[i])
  return out
}

/** Caméra : perspective × inclinaison du bureau × décalage horizontal. */
export function viewMatrix(v: View, tilt: number): M4 {
  const p = m4()
  p[11] = -1 / v.persp
  return chain(p, rotX(tilt), translate(v.shift, 0, 0))
}

export const css = (m: M4) => {
  let s = 'matrix3d('
  for (let i = 0; i < 16; i++) s += (i ? ',' : '') + (Math.abs(m[i]) < 1e-9 ? 0 : +m[i].toFixed(i === 3 || i === 7 || i === 11 ? 8 : 4))
  return s + ')'
}

/** Point local (x, y, 0) d'une face transformé par `m` (sans la perspective). */
export function apply(m: M4, x: number, y: number): [number, number, number] {
  return [m[0] * x + m[4] * y + m[12], m[1] * x + m[5] * y + m[13], m[2] * x + m[6] * y + m[14]]
}
