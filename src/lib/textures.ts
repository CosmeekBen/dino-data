/**
 * Textures procédurales (bruit SVG) : grain du simili-cuir, bois du bureau, toile de l'intérieur, papier.
 * Elles sont exposées en variables CSS sur :root pour être utilisées comme `background-image`.
 */

const svg = (size: number, body: string) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${body}</svg>`,
  )}")`

const noise = (freq: string, octaves: number, seed: number) =>
  `<feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${octaves}' seed='${seed}' stitchTiles='stitch'/>`

export const TEXTURES: Record<string, string> = {
  /** Grain de simili-cuir : bruit éclairé en relief, gris moyen (≈ 50 %) pour un mélange en overlay. */
  '--tex-leather': svg(
    240,
    `<filter id='f' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>
      ${noise('.95', 4, 4)}
      <feColorMatrix type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0'/>
      <feDiffuseLighting surfaceScale='1.25' diffuseConstant='1' lighting-color='#acacac'>
        <feDistantLight azimuth='235' elevation='48'/>
      </feDiffuseLighting>
    </filter><rect width='100%' height='100%' filter='url(#f)'/>`,
  ),
  /** Marbrure basse fréquence pour casser l'uniformité de la couleur. */
  '--tex-mottle': svg(
    420,
    `<filter id='f' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>${noise('.011', 3, 9)}
      <feColorMatrix type='saturate' values='0'/>
      <feComponentTransfer>
        <feFuncR type='linear' slope='.6' intercept='.2'/><feFuncG type='linear' slope='.6' intercept='.2'/>
        <feFuncB type='linear' slope='.6' intercept='.2'/><feFuncA type='linear' slope='0' intercept='1'/>
      </feComponentTransfer>
    </filter><rect width='100%' height='100%' filter='url(#f)'/>`,
  ),
  /** Bois de noyer du bureau : veines étirées horizontalement. */
  '--tex-wood': svg(
    1000,
    `<filter id='f' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>${noise('.0016 .045', 5, 21)}
      <feColorMatrix type='matrix' values='1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1'/>
      <feComponentTransfer>
        <feFuncR type='linear' slope='2.6' intercept='-.8'/>
        <feFuncG type='linear' slope='2.6' intercept='-.8'/>
        <feFuncB type='linear' slope='2.6' intercept='-.8'/>
      </feComponentTransfer>
      <feComponentTransfer>
        <feFuncR type='table' tableValues='.1 .45 .2 .7 .35 .9 .5 1 .6'/>
        <feFuncG type='table' tableValues='.1 .45 .2 .7 .35 .9 .5 1 .6'/>
        <feFuncB type='table' tableValues='.1 .45 .2 .7 .35 .9 .5 1 .6'/>
      </feComponentTransfer>
      <feColorMatrix type='matrix' values='.27 0 0 0 .12  .16 0 0 0 .068  .09 0 0 0 .04  0 0 0 0 1'/>
    </filter>
    <filter id='g' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>${noise('.004 .55', 3, 5)}
      <feColorMatrix type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.4 0 0 0 .85'/>
    </filter>
    <rect width='100%' height='100%' filter='url(#f)'/>
    <rect width='100%' height='100%' filter='url(#g)' opacity='.35'/>`,
  ),
  /** Toile/lin de l'intérieur des couvertures. */
  '--tex-linen': svg(
    160,
    `<filter id='f' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>${noise('.9 .035', 2, 3)}
      <feColorMatrix type='saturate' values='0'/></filter>
    <filter id='g' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>${noise('.035 .9', 2, 7)}
      <feColorMatrix type='saturate' values='0'/></filter>
    <rect width='100%' height='100%' filter='url(#f)'/>
    <rect width='100%' height='100%' filter='url(#g)' opacity='.5'/>`,
  ),
  /** Fibres fines (papier des étiquettes, feutrine noire des pages). */
  '--tex-fiber': svg(
    180,
    `<filter id='f' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>${noise('.65', 4, 12)}
      <feColorMatrix type='saturate' values='0'/></filter>
    <rect width='100%' height='100%' filter='url(#f)'/>`,
  ),
  /** Métal brossé (porte-étiquette, mécanisme). */
  '--tex-brushed': svg(
    200,
    `<filter id='f' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>${noise('.004 .9', 2, 2)}
      <feColorMatrix type='saturate' values='0'/></filter>
    <rect width='100%' height='100%' filter='url(#f)'/>`,
  ),
}

export function installTextures(root: HTMLElement = document.documentElement) {
  for (const [name, value] of Object.entries(TEXTURES)) root.style.setProperty(name, value)
}
