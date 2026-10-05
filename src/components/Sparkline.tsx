interface Props {
  data: number[]
  width?: number
  height?: number
  stroke?: string
  fill?: string
  strokeWidth?: number
}

export function Sparkline({
  data,
  width = 200,
  height = 60,
  stroke = 'currentColor',
  fill = 'currentColor',
  strokeWidth = 2,
}: Props) {
  const max = Math.max(...data, 1)
  const pad = strokeWidth
  const pts = data.map((v, i) => [
    pad + (i / Math.max(1, data.length - 1)) * (width - pad * 2),
    height - pad - (v / max) * (height - pad * 2),
  ])
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" preserveAspectRatio="none" role="img" aria-label="Courbe de stats du post">
      <path d={area} fill={fill} opacity={0.18} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
