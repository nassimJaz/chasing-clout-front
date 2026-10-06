import * as THREE from "three"
import { FORMATS, PurchaseFormat } from "models/game.model"
import { canvas2d, Kit } from "./card-art"

// What a purchase looks like in 3D: one booster, a tri-pack, or a display box growing with the format.

// Same gradients as the .booster-* classes of styles.scss.
export const BOOSTER_COLORS: Record<string, string[]> = {
  BASIC: ["#1e88e5", "#0d47a1"],
  SPECIAL: ["#ab47bc", "#4a0a67"],
  COLLECTION: ["#f9e27d", "#c9a227", "#8d6e00"],
}

export const BOOSTER_W = 3.2
export const BOOSTER_H = 4.8
export const STRIP = 0.15 // share of the booster torn off at the top

// Base display size (Display Mini), then the scale and the extra depth of each display.
const BOX = { w: 4.2, h: 3.2, d: 2.4 }
const BOX_SIZES: Partial<Record<PurchaseFormat, { scale: number; depth: number }>> = {
  DISPLAY_MINI: { scale: 1, depth: 1 },
  DISPLAY_MEDIUM: { scale: 1.5, depth: 1.2 },
  DISPLAY_MEGA: { scale: 2.2, depth: 1.5 },
}

export interface PackBooster {
  code: string
  name: string
}

export interface Pack {
  group: THREE.Group
  boosters: THREE.Mesh[] // single and tri-pack: the boosters themselves
  lid?: THREE.Mesh // displays
  body?: THREE.Mesh // displays
  band?: THREE.Mesh // tri-pack
  size: { w: number; h: number; d: number } // to frame the camera
}

export function boosterColors(code: string): string[] {
  return BOOSTER_COLORS[code] ?? BOOSTER_COLORS["SPECIAL"]
}

// Both gradients for a mixed display, the type's one otherwise.
export function packColors(codes: string[]): string[] {
  const distinct = [...new Set(codes)]
  return distinct.length > 1 ? distinct.flatMap((c) => boosterColors(c).slice(0, 2)) : boosterColors(distinct[0])
}

export function boosterMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.35, metalness: 0.25, side: THREE.DoubleSide, transparent: true })
}

// title: the booster name, or both names for a mixed display. boosters: the ones left (a tri-pack can be half opened).
export function buildPack(kit: Kit, format: PurchaseFormat, boosters: PackBooster[], title: string): Pack {
  const group = new THREE.Group()
  const colors = packColors(boosters.map((b) => b.code))
  const box = BOX_SIZES[format]

  if (!box) {
    // single or tri-pack: real boosters, stacked with a small offset
    const textures = new Map<string, THREE.Texture>()
    const meshes = boosters.slice(0, format === "TRI_PACK" ? 3 : 1).map((b, i) => {
      if (!textures.has(b.code)) textures.set(b.code, kit.texture(drawBooster(b.name, boosterColors(b.code))))
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(BOOSTER_W, BOOSTER_H), boosterMaterial(textures.get(b.code)!))
      mesh.position.set((i - 1) * 0.3, -i * 0.12, -i * 0.15)
      mesh.rotation.z = (i - 1) * -0.04
      group.add(mesh)
      return mesh
    })
    const pack: Pack = { group, boosters: meshes, size: { w: BOOSTER_W + 0.6, h: BOOSTER_H, d: 0.5 } }
    if (format === "TRI_PACK") {
      const band = kit.texture(drawBoxFace(format, title, colors, "band"))
      const side = new THREE.MeshStandardMaterial({ color: colors[colors.length - 1], transparent: true })
      const front = new THREE.MeshStandardMaterial({ map: band, roughness: 0.4, transparent: true })
      pack.band = new THREE.Mesh(new THREE.BoxGeometry(BOOSTER_W + 0.8, 1.1, 0.6), [side, side, side, side, front, front])
      pack.band.position.set(0, -0.6, -0.15)
      group.add(pack.band)
    }
    return pack
  }

  const w = BOX.w * box.scale
  const h = BOX.h * box.scale
  const d = BOX.d * box.scale * box.depth
  const material = (face: BoxFace) =>
    new THREE.MeshStandardMaterial({ map: kit.texture(drawBoxFace(format, title, colors, face)), roughness: 0.55, transparent: true })
  const front = material("front")
  const side = material("side")
  const plain = new THREE.MeshStandardMaterial({ color: colors[colors.length - 1], roughness: 0.6, transparent: true })
  // BoxGeometry faces: +x, -x, +y, -y, +z, -z
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, material("inside"), plain, front, front])
  const lidH = h * 0.14
  const lidSide = material("lid-side")
  const lid = new THREE.Mesh(new THREE.BoxGeometry(w * 1.03, lidH, d * 1.03), [lidSide, lidSide, material("lid"), plain, lidSide, lidSide])
  lid.position.y = h / 2 - lidH / 2 + 0.02
  group.add(body, lid)
  return { group, boosters: [], body, lid, size: { w, h, d } }
}

type BoxFace = "front" | "side" | "inside" | "lid" | "lid-side" | "band"

// The canvas of one face of a display (or of the tri-pack band): the type's gradient, a diamond motif, name and count.
export function drawBoxFace(format: PurchaseFormat, name: string, colors: string[], face: BoxFace): HTMLCanvasElement {
  const f = FORMATS.find((x) => x.format === format)!
  const size: Record<BoxFace, [number, number]> = {
    front: [840, 640],
    side: [480, 640],
    inside: [840, 480],
    lid: [840, 480],
    "lid-side": [840, 90],
    band: [800, 220],
  }
  const [W, H] = size[face]
  const [canvas, ctx] = canvas2d(W, H)

  if (face === "inside") {
    // the tops of the boosters standing in the box
    ctx.fillStyle = "#1a0826"
    ctx.fillRect(0, 0, W, H)
    const cols = Math.min(15, Math.ceil(f.count / 2))
    const rows = Math.ceil(f.count / cols)
    const cw = W / cols
    const rh = H / rows
    for (let i = 0; i < f.count; i++) {
      const g = ctx.createLinearGradient(0, 0, cw, 0)
      colors.forEach((c, j) => g.addColorStop(j / Math.max(1, colors.length - 1), c))
      ctx.fillStyle = g
      ctx.fillRect((i % cols) * cw + cw * 0.1, Math.floor(i / cols) * rh + rh * 0.12, cw * 0.8, rh * 0.76)
    }
    return canvas
  }

  const gradient = ctx.createLinearGradient(0, 0, W * 0.5, H)
  colors.forEach((c, i) => gradient.addColorStop(i / Math.max(1, colors.length - 1), c))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, W, H)

  // diamonds, like the card backs' stripes
  ctx.fillStyle = "#ffffff14"
  const step = 46
  for (let y = 0; y < H + step; y += step) {
    for (let x = (y / step) % 2 ? step / 2 : 0; x < W + step; x += step) {
      ctx.beginPath()
      ctx.moveTo(x, y - 12)
      ctx.lineTo(x + 12, y)
      ctx.lineTo(x, y + 12)
      ctx.lineTo(x - 12, y)
      ctx.fill()
    }
  }
  if (face === "lid-side") return canvas

  ctx.fillStyle = "#fff"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.shadowColor = "#0007"
  ctx.shadowBlur = 14
  const fit = (text: string, max: number, size: number, y: number) => {
    ctx.font = `700 ${size}px Caveat, sans-serif`
    while (ctx.measureText(text).width > max && size > 20) ctx.font = `700 ${(size -= 4)}px Caveat, sans-serif`
    ctx.fillText(text, W / 2, y)
  }

  if (face === "band") {
    fit(f.label, W - 40, 130, H / 2)
  } else if (face === "side") {
    ctx.save()
    ctx.translate(W / 2, H / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.font = "700 110px Caveat, sans-serif"
    ctx.fillText("Chasing Clout", 0, 0)
    ctx.restore()
  } else if (face === "lid") {
    fit("Chasing Clout", W - 60, 120, H * 0.38)
    fit(f.label, W - 60, 80, H * 0.68)
  } else {
    fit(name, W - 60, 110, H * 0.3)
    ctx.font = "700 220px Caveat, sans-serif"
    ctx.fillText(`×${f.count}`, W / 2, H * 0.62)
    fit(f.label, W - 60, 64, H * 0.88)
  }
  return canvas
}

// The pack wrapper: colored like the inventory boosters, with a dashed tear line under the top strip.
export function drawBooster(name: string, colors: string[]): HTMLCanvasElement {
  const W = 400
  const H = 600
  const [canvas, ctx] = canvas2d(W, H)
  const gradient = ctx.createLinearGradient(0, 0, W * 0.4, H)
  colors.forEach((c, i) => gradient.addColorStop(i / (colors.length - 1), c))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, W, H)

  // crimped edges at the top and the bottom
  ctx.fillStyle = "#ffffff33"
  for (let x = 0; x < W; x += 16) {
    ctx.fillRect(x, 0, 8, 24)
    ctx.fillRect(x, H - 24, 8, 24)
  }
  // tear line
  ctx.strokeStyle = "#ffffffcc"
  ctx.lineWidth = 4
  ctx.setLineDash([14, 10])
  ctx.beginPath()
  ctx.moveTo(0, H * STRIP)
  ctx.lineTo(W, H * STRIP)
  ctx.stroke()
  ctx.setLineDash([])

  // sheen
  const sheen = ctx.createLinearGradient(0, 0, W, H)
  sheen.addColorStop(0.3, "#ffffff00")
  sheen.addColorStop(0.45, "#ffffff40")
  sheen.addColorStop(0.6, "#ffffff00")
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = "#fff"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.shadowColor = "#0006"
  ctx.shadowBlur = 12
  ctx.font = "700 40px Caveat, sans-serif"
  ctx.fillText("Chasing Clout", W / 2, H * 0.3)
  let size = 90
  ctx.font = `700 ${size}px Caveat, sans-serif`
  while (ctx.measureText(name).width > W - 40 && size > 30) ctx.font = `700 ${(size -= 4)}px Caveat, sans-serif`
  ctx.fillText(name, W / 2, H * 0.58)
  return canvas
}
