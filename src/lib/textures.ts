/**
 * Textures procédurales (bruit SVG), exposées en variables CSS sur :root pour être utilisées comme `background-image` :
 * grain fin (matière soft-touch des couvertures, fond studio) et fibres (support noir des pages).
 */

const svg = (size: number, body: string) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${body}</svg>`,
  )}")`

const noise = (freq: string, octaves: number, seed: number) =>
  `<feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${octaves}' seed='${seed}' stitchTiles='stitch'/>`

export const TEXTURES: Record<string, string> = {
  /** Grain très fin et doux, gris moyen (≈ 50 %), à mélanger en overlay / soft-light. */
  '--tex-grain': svg(
    200,
    `<filter id='f' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>${noise('.9', 3, 7)}
      <feColorMatrix type='saturate' values='0'/>
      <feComponentTransfer>
        <feFuncR type='linear' slope='.45' intercept='.275'/><feFuncG type='linear' slope='.45' intercept='.275'/>
        <feFuncB type='linear' slope='.45' intercept='.275'/><feFuncA type='linear' slope='0' intercept='1'/>
      </feComponentTransfer>
    </filter><rect width='100%' height='100%' filter='url(#f)'/>`,
  ),
  /** Fibres fines (support noir des pages). */
  '--tex-fiber': svg(
    180,
    `<filter id='f' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>${noise('.65', 4, 12)}
      <feColorMatrix type='saturate' values='0'/></filter>
    <rect width='100%' height='100%' filter='url(#f)'/>`,
  ),
}

export function installTextures(root: HTMLElement = document.documentElement) {
  for (const [name, value] of Object.entries(TEXTURES)) root.style.setProperty(name, value)
}
