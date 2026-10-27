import * as THREE from "three"
import { canvas2d, Kit } from "./card-art"

// A booster pack as a real object: a foil pillow (puffed in the middle, flat crimped seals at the top
// and the bottom), printed on both sides, with a foil logo and a crinkled surface. Front and back are
// one mesh and one material (an atlas: front on the top half, back on the bottom half), so the pack
// can still be faded, lit on hover and torn like the flat one it replaces.

export const PACK_W = 3.2
export const PACK_H = 4.8
const THICKNESS = 0.14 // at the middle of the pillow
const CRIMP = 0.07 // share of the height flattened by each seal
const SEG_X = 24
const SEG_Y = 36
const TEETH = 0.035 // height of the zigzag of a torn edge

// --------------------------------------------------------------------------------------- geometry
const geometries = new Map<string, THREE.BufferGeometry>()

// The slice [v0, v1] of the pack (0 = bottom, 1 = top), centered on itself. tornAt: the v of an edge
// cut in zigzag (the tear line), so the strip and the body of a torn pack fit together.
export function boosterGeometry(v0 = 0, v1 = 1, tornAt?: number): THREE.BufferGeometry {
  const key = `${v0}:${v1}:${tornAt}`
  const cached = geometries.get(key)
  if (cached) return cached

  const rows = Math.max(2, Math.round(SEG_Y * (v1 - v0)))
  const cols = SEG_X
  const mid = (v0 + v1) / 2
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (const side of [1, -1]) {
    const start = positions.length / 3
    for (let r = 0; r <= rows; r++) {
      const v = v0 + ((v1 - v0) * r) / rows
      for (let c = 0; c <= cols; c++) {
        const u = c / cols
        let y = (v - mid) * PACK_H
        // the torn edge: every other column a little lower
        if (tornAt !== undefined && Math.abs(v - tornAt) < 1e-6) y += (c % 2 ? -1 : 1) * TEETH
        const x = (u - 0.5) * PACK_W
        positions.push(x, y, (side * THICKNESS * puff(u, v)) / 2)
        // front on the top half of the atlas, back (mirrored, as seen from behind) on the bottom half
        uvs.push(side > 0 ? u : 1 - u, side > 0 ? 0.5 + v / 2 : v / 2)
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = start + r * (cols + 1) + c
        const b = a + 1
        const d = a + cols + 1
        const e = d + 1
        if (side > 0) indices.push(a, b, d, b, e, d)
        else indices.push(a, d, b, b, d, e)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometries.set(key, geometry)
  return geometry
}

// 0 on the edges and the crimped seals, 1 in the middle: a pillow
function puff(u: number, v: number): number {
  const across = Math.pow(Math.sin(Math.PI * u), 0.55)
  const along = smooth(CRIMP, CRIMP + 0.1, v) * smooth(1 - CRIMP, 1 - CRIMP - 0.1, v)
  return across * along
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// --------------------------------------------------------------------------------------- material
// Textures shared by every pack of a type in a scene: one BoosterArt per scene.
export class BoosterArt {
  private maps = new Map<string, { map: THREE.Texture; metal: THREE.Texture }>()
  private crinkle?: THREE.Texture

  constructor(private kit: Kit) {}

  // A material of its own (the scenes fade and light each pack), the textures shared.
  material(code: string, name: string, colors: string[]): THREE.MeshPhysicalMaterial {
    let art = this.maps.get(code)
    if (!art) {
      const metal = this.kit.texture(drawAtlas(name, colors, true))
      metal.colorSpace = THREE.NoColorSpace
      art = { map: this.kit.texture(drawAtlas(name, colors, false)), metal }
      this.maps.set(code, art)
    }
    if (!this.crinkle) {
      this.crinkle = this.kit.texture(drawCrinkle())
      this.crinkle.colorSpace = THREE.NoColorSpace
      this.crinkle.wrapS = this.crinkle.wrapT = THREE.RepeatWrapping
      this.crinkle.repeat.set(2, 6)
    }
    return new THREE.MeshPhysicalMaterial({
      map: art.map,
      metalness: 1,
      metalnessMap: art.metal, // printed film over aluminium; the logo is bare foil
      roughness: 0.34,
      clearcoat: 1,
      clearcoatRoughness: 0.22,
      normalMap: this.crinkle,
      normalScale: new THREE.Vector2(0.22, 0.22),
      side: THREE.DoubleSide,
      transparent: true,
    })
  }
}

// --------------------------------------------------------------------------------------- printing
const W = 512
const H = 768 // each side; the atlas is W × 2H

// The print of both sides (metal: the metalness map instead, white where the foil shows).
function drawAtlas(name: string, colors: string[], metal: boolean): HTMLCanvasElement {
  const [canvas, ctx] = canvas2d(W, H * 2)
  ctx.save()
  drawFront(ctx, name, colors, metal)
  ctx.restore()
  ctx.save()
  ctx.translate(0, H)
  drawBack(ctx, name, colors, metal)
  ctx.restore()
  return canvas
}

function gradient(ctx: CanvasRenderingContext2D, colors: string[], dark = 0): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, W * 0.45, H)
  colors.forEach((c, i) => g.addColorStop(i / Math.max(1, colors.length - 1), c))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  if (dark) {
    ctx.fillStyle = `rgba(0, 0, 0, ${dark})`
    ctx.fillRect(0, 0, W, H)
  }
  return g
}

// the crimped seals: fine vertical ridges
function crimps(ctx: CanvasRenderingContext2D, metal: boolean): void {
  const h = H * CRIMP
  for (const y of [0, H - h]) {
    ctx.fillStyle = metal ? "#202020" : "#00000040"
    ctx.fillRect(0, y, W, h)
    ctx.fillStyle = metal ? "#5a5a5a" : "#ffffff3a"
    for (let x = 0; x < W; x += 7) ctx.fillRect(x, y, 3, h)
  }
}

function drawFront(ctx: CanvasRenderingContext2D, name: string, colors: string[], metal: boolean): void {
  if (metal) {
    ctx.fillStyle = "#5c5c5c" // the printed film lets a little metal through
    ctx.fillRect(0, 0, W, H)
  } else {
    gradient(ctx, colors)
    // a diagonal sheen and a soft vignette
    const sheen = ctx.createLinearGradient(0, 0, W, H)
    sheen.addColorStop(0.28, "#ffffff00")
    sheen.addColorStop(0.42, "#ffffff2e")
    sheen.addColorStop(0.56, "#ffffff00")
    ctx.fillStyle = sheen
    ctx.fillRect(0, 0, W, H)
  }
  crimps(ctx, metal)

  // tear line under the top strip
  ctx.strokeStyle = metal ? "#8a8a8a" : "#ffffffcc"
  ctx.lineWidth = 4
  ctx.setLineDash([14, 10])
  ctx.beginPath()
  ctx.moveTo(0, H * 0.15)
  ctx.lineTo(W, H * 0.15)
  ctx.stroke()
  ctx.setLineDash([])

  // the foil emblem: a star in a ring
  const cx = W / 2
  const cy = H * 0.36
  ctx.save()
  ctx.translate(cx, cy)
  ctx.fillStyle = metal ? "#ffffff" : "#ffffffd9"
  ctx.strokeStyle = metal ? "#ffffff" : "#ffffffd9"
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(0, 0, 58, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 20 : 44
    const a = (i * Math.PI) / 5 - Math.PI / 2
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  ctx.fill()
  ctx.restore()

  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = metal ? "#ffffff" : "#fff"
  if (!metal) {
    ctx.shadowColor = "#0007"
    ctx.shadowBlur = 12
  }
  ctx.font = "700 44px Caveat, sans-serif"
  ctx.fillText("Chasing Clout", cx, H * 0.24)
  // the set name: printed, not foil
  if (!metal) {
    let size = 104
    ctx.font = `700 ${size}px Caveat, sans-serif`
    while (ctx.measureText(name).width > W - 50 && size > 30) ctx.font = `700 ${(size -= 4)}px Caveat, sans-serif`
    ctx.fillText(name, cx, H * 0.58)
    ctx.shadowBlur = 0
    ctx.font = "700 22px Unbounded, sans-serif"
    ctx.fillText("BOOSTER", cx, H * 0.69)
  }

  // a small barcode
  if (!metal) barcode(ctx, W - 118, H * 0.79, 84, 34)
}

function drawBack(ctx: CanvasRenderingContext2D, name: string, colors: string[], metal: boolean): void {
  if (metal) {
    ctx.fillStyle = "#4a4a4a"
    ctx.fillRect(0, 0, W, H)
  } else {
    gradient(ctx, colors, 0.35)
  }
  crimps(ctx, metal)
  // the vertical heat seal in the middle
  const x = W / 2 - 18
  ctx.fillStyle = metal ? "#2a2a2a" : "#00000059"
  ctx.fillRect(x, H * CRIMP, 36, H * (1 - 2 * CRIMP))
  ctx.fillStyle = metal ? "#8a8a8a" : "#ffffff26"
  for (let y = H * CRIMP; y < H * (1 - CRIMP); y += 6) ctx.fillRect(x + 4, y, 28, 2)
  if (metal) return

  // fictitious small print
  ctx.fillStyle = "#ffffffb3"
  ctx.textAlign = "left"
  ctx.textBaseline = "top"
  ctx.font = "700 26px Caveat, sans-serif"
  ctx.fillText(name, 40, H * 0.14)
  ctx.font = "500 13px 'Zen Kaku Gothic New', sans-serif"
  const lines = [
    "Contient des cartes à collectionner.",
    "Une carte Secrète peut se cacher dans",
    "n'importe quel booster.",
    "Ne convient pas aux moins de 3 ans.",
    "Chasing Clout, jeu de cartes de mèmes.",
  ]
  lines.forEach((l, i) => ctx.fillText(l, 40, H * 0.24 + i * 20))
  barcode(ctx, 40, H * 0.78, 120, 46)
}

function barcode(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = "#fff"
  ctx.fillRect(x - 6, y - 6, w + 12, h + 12)
  ctx.fillStyle = "#111"
  let seed = 7
  for (let i = 0; i < w; ) {
    seed = (seed * 9301 + 49297) % 233280
    const bar = 1 + (seed % 3)
    if ((seed >> 3) % 2) ctx.fillRect(x + i, y, bar, h)
    i += bar + 1
  }
}

// A tile of crinkled foil as a normal map: fine diagonal creases and a few broad folds.
let crinkle: HTMLCanvasElement | undefined
function drawCrinkle(): HTMLCanvasElement {
  if (crinkle) return crinkle
  const S = 256
  const height = new Float32Array(S * S)
  let seed = 3
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const folds = Array.from({ length: 5 }, () => ({ a: rand() * Math.PI, o: rand() * S, w: 6 + rand() * 18 }))
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let h = 0.04 * Math.sin((x + y) * 0.7 + Math.sin(y * 0.05) * 3) + 0.03 * Math.sin((x - y) * 1.3)
      for (const f of folds) {
        const d = Math.abs((x * Math.cos(f.a) + y * Math.sin(f.a) - f.o + S) % S - S / 2)
        h += Math.max(0, 1 - d / f.w) * 0.6
      }
      height[y * S + x] = h
    }
  }
  const [canvas, ctx] = canvas2d(S, S)
  const img = ctx.createImageData(S, S)
  const at = (x: number, y: number) => height[((y + S) % S) * S + ((x + S) % S)]
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = at(x - 1, y) - at(x + 1, y)
      const dy = at(x, y + 1) - at(x, y - 1)
      const len = Math.hypot(dx, dy, 1)
      const i = (y * S + x) * 4
      img.data[i] = ((dx / len) * 0.5 + 0.5) * 255
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return (crinkle = canvas)
}
