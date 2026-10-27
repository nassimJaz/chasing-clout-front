import * as THREE from "three"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"
import { FORMATS, PurchaseFormat } from "models/game.model"
import { canvas2d, Kit } from "./card-art"
import { BoosterArt, boosterGeometry, PACK_H, PACK_W } from "./booster-art"

// What a purchase looks like in 3D: one booster, a tri-pack under a blister, or a printed cardboard display
// growing with the format, sealed in cellophane, its lid on a hinge, its boosters standing inside.

// Same gradients as the .booster-* classes of styles.scss.
export const BOOSTER_COLORS: Record<string, string[]> = {
  BASIC: ["#1e88e5", "#0d47a1"],
  SPECIAL: ["#ab47bc", "#4a0a67"],
  COLLECTION: ["#f9e27d", "#c9a227", "#8d6e00"],
}

export const BOOSTER_W = PACK_W
export const BOOSTER_H = PACK_H
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
  hinge?: THREE.Group // displays: the lid turns around the back edge of the box
  body?: THREE.Mesh // displays: the bottom, the walls are its children
  inner?: { w: number; d: number; floor: number } // displays: the room inside, for the boosters standing in it
  band?: THREE.Mesh // tri-pack: the cardboard backing
  wrap?: THREE.Mesh // the cellophane of a display, the plastic bubble of a tri-pack
  tab?: THREE.Mesh // displays: the tear strip of the cellophane
  telescopic?: boolean // the big display: its lid lifts before it turns
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

// clear film: cellophane or blister plastic. A thin, glossy transparent layer that mostly shows the studio
// reflections (transmission would not see the cardboard, which is transparent so it can fade).
function film(geometry: THREE.BufferGeometry): THREE.Mesh {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      roughness: 0.04,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 2.2,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
  )
  mesh.renderOrder = 1 // over the pack it wraps
  mesh.userData["film"] = true // casts no shadow
  return mesh
}

// title: the booster name, or both names for a mixed display. boosters: the ones left (a tri-pack can be half opened).
export function buildPack(kit: Kit, format: PurchaseFormat, boosters: PackBooster[], title: string): Pack {
  const group = new THREE.Group()
  const colors = packColors(boosters.map((b) => b.code))
  const box = BOX_SIZES[format]

  if (!box) {
    // single or tri-pack: real boosters, stacked with a small offset
    const art = new BoosterArt(kit)
    const meshes = boosters.slice(0, format === "TRI_PACK" ? 3 : 1).map((b, i) => {
      const mesh = new THREE.Mesh(boosterGeometry(), art.material(b.code, b.name, boosterColors(b.code)))
      mesh.position.set((i - 1) * 0.3, -i * 0.12, -i * 0.15)
      mesh.rotation.z = (i - 1) * -0.04
      group.add(mesh)
      return mesh
    })
    const pack: Pack = { group, boosters: meshes, size: { w: BOOSTER_W + 0.6, h: BOOSTER_H, d: 0.5 } }
    if (format === "TRI_PACK") {
      // a blister: a printed cardboard backing behind the boosters, a clear plastic bubble over them
      const print = new THREE.MeshStandardMaterial({ map: kit.texture(drawBoxFace(format, title, colors, "band")), roughness: 0.6, transparent: true })
      const edge = new THREE.MeshStandardMaterial({ color: "#c7a77a", roughness: 0.8, transparent: true })
      pack.band = new THREE.Mesh(new RoundedBoxGeometry(BOOSTER_W + 1.3, BOOSTER_H + 1.1, 0.06, 2, 0.03), [edge, edge, edge, edge, print, edge])
      pack.band.position.set(0, 0.15, -0.5)
      pack.wrap = film(new RoundedBoxGeometry(BOOSTER_W + 0.9, BOOSTER_H + 0.5, 0.75, 4, 0.18))
      pack.wrap.position.set(0, -0.05, -0.1)
      group.add(pack.band, pack.wrap)
    }
    return pack
  }

  const w = BOX.w * box.scale
  const h = BOX.h * box.scale
  const d = BOX.d * box.scale * box.depth
  const t = 0.06 * box.scale // cardboard thickness
  const r = 0.04 * box.scale
  const print = (face: BoxFace, foil = false) =>
    new THREE.MeshStandardMaterial({
      map: kit.texture(drawBoxFace(format, title, colors, face)),
      roughness: 0.55,
      // the logo and the names are foil stamped
      ...(foil ? { metalness: 1, metalnessMap: metalMap(kit, drawBoxFace(format, title, colors, face, true)) } : {}),
      transparent: true,
    })
  const inside = new THREE.MeshStandardMaterial({ color: "#1d1626", roughness: 0.9, transparent: true })
  const edge = new THREE.MeshStandardMaterial({ color: "#c7a77a", roughness: 0.85, transparent: true }) // cut cardboard
  const front = print("front", true)
  const side = print("side")
  const back = print("back")
  // RoundedBoxGeometry faces, like BoxGeometry: +x, -x, +y, -y, +z, -z
  const slab = (sw: number, sh: number, sd: number, materials: THREE.Material[]) =>
    new THREE.Mesh(new RoundedBoxGeometry(sw, sh, sd, 2, Math.min(r, sw / 2, sh / 2, sd / 2) * 0.99), materials)

  // an open box: the bottom (a plain box between the walls), and the four walls as its children
  const body = new THREE.Mesh(new THREE.BoxGeometry(w - 2 * t, t, d - 2 * t), [edge, edge, inside, edge, edge, edge])
  body.position.y = -h / 2 + t / 2
  const wallY = h / 2 - t / 2 // from the bottom's center to the walls' center
  const frontWall = slab(w, h, t, [edge, edge, edge, edge, front, inside])
  frontWall.position.set(0, wallY, d / 2 - t / 2)
  const backWall = slab(w, h, t, [edge, edge, edge, edge, inside, back])
  backWall.position.set(0, wallY, -d / 2 + t / 2)
  const right = slab(t, h, d - 2 * t, [side, inside, edge, edge, edge, edge])
  right.position.set(w / 2 - t / 2, wallY, 0)
  const left = slab(t, h, d - 2 * t, [inside, side, edge, edge, edge, edge])
  left.position.set(-w / 2 + t / 2, wallY, 0)
  body.add(frontWall, backWall, right, left)

  // the lid covers the top of the walls and turns around the back edge
  const lidH = h * 0.14
  const lidSide = print("lid-side")
  const lid = slab(w * 1.03, lidH, d * 1.03, [lidSide, lidSide, print("lid", true), inside, lidSide, lidSide])
  const hinge = new THREE.Group()
  hinge.position.set(0, h / 2, (-d * 1.03) / 2)
  lid.position.set(0, -lidH / 2 + 0.02, (d * 1.03) / 2)
  hinge.add(lid)

  // sealed in cellophane, a tear strip across the front
  const wrap = film(new RoundedBoxGeometry(w * 1.05, h * 1.03, d * 1.06, 3, 0.05 * box.scale))
  wrap.position.y = 0.01
  const tab = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 1.06, 0.07 * box.scale),
    new THREE.MeshStandardMaterial({ color: "#e9e6f0", metalness: 0.4, roughness: 0.3, transparent: true }),
  )
  tab.position.set(0, h / 2 - lidH * 0.5, (d * 1.06) / 2 + 0.004)

  group.add(body, hinge, wrap, tab)
  return {
    group,
    boosters: [],
    body,
    lid,
    hinge,
    wrap,
    tab,
    inner: { w: w - 2 * t, d: d - 2 * t, floor: -h / 2 + t },
    telescopic: format === "DISPLAY_MEGA",
    size: { w, h, d },
  }
}

function metalMap(kit: Kit, canvas: HTMLCanvasElement): THREE.Texture {
  const texture = kit.texture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  return texture
}

type BoxFace = "front" | "side" | "back" | "lid" | "lid-side" | "band"

// The canvas of one face of a display (or of the tri-pack backing): the type's gradient, a diamond motif,
// name and count. metal: the metalness map instead, white where the foil shows.
export function drawBoxFace(format: PurchaseFormat, name: string, colors: string[], face: BoxFace, metal = false): HTMLCanvasElement {
  const f = FORMATS.find((x) => x.format === format)!
  const size: Record<BoxFace, [number, number]> = {
    front: [840, 640],
    side: [480, 640],
    back: [840, 640],
    lid: [840, 480],
    "lid-side": [840, 90],
    band: [600, 820],
  }
  const [W, H] = size[face]
  const [canvas, ctx] = canvas2d(W, H)

  if (metal) {
    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, W, H)
  } else {
    const gradient = ctx.createLinearGradient(0, 0, W * 0.5, H)
    colors.forEach((c, i) => gradient.addColorStop(i / Math.max(1, colors.length - 1), c))
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, W, H)
    if (face === "back") {
      ctx.fillStyle = "#00000059"
      ctx.fillRect(0, 0, W, H)
    }

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
  }
  if (face === "lid-side") return canvas

  ctx.fillStyle = "#fff"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  if (!metal) {
    ctx.shadowColor = "#0007"
    ctx.shadowBlur = 14
  }
  const fit = (text: string, max: number, size: number, y: number) => {
    ctx.font = `700 ${size}px Caveat, sans-serif`
    while (ctx.measureText(text).width > max && size > 20) ctx.font = `700 ${(size -= 4)}px Caveat, sans-serif`
    ctx.fillText(text, W / 2, y)
  }

  if (face === "band") {
    fit("Chasing Clout", W - 60, 90, H * 0.07)
    fit(f.label, W - 60, 70, H * 0.93)
  } else if (face === "side") {
    ctx.save()
    ctx.translate(W / 2, H / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.font = "700 110px Caveat, sans-serif"
    ctx.fillText("Chasing Clout", 0, 0)
    ctx.restore()
  } else if (face === "lid") {
    fit("Chasing Clout", W - 60, 120, H * 0.38)
    if (!metal) fit(f.label, W - 60, 80, H * 0.68)
  } else if (face === "back") {
    fit(name, W - 60, 90, H * 0.18)
    ctx.shadowBlur = 0
    ctx.textAlign = "left"
    ctx.font = "500 24px 'Zen Kaku Gothic New', sans-serif"
    ;[
      `${f.label} : ${f.count} boosters scellés.`,
      "Chaque booster contient des cartes à collectionner.",
      "Les cartes Secrètes sont rares : bonne chasse.",
      "Ne convient pas aux moins de 3 ans.",
    ].forEach((l, i) => ctx.fillText(l, 60, H * 0.38 + i * 38))
    ctx.fillStyle = "#fff"
    ctx.fillRect(W - 230, H - 140, 170, 80)
    ctx.fillStyle = "#111"
    for (let x = 0, k = 7; x < 150; k = (k * 9301 + 49297) % 233280) {
      const bar = 1 + (k % 4)
      if ((k >> 3) % 2) ctx.fillRect(W - 220 + x, H - 130, bar, 60)
      x += bar + 2
    }
  } else {
    fit(name, W - 60, 110, H * 0.3)
    if (!metal) {
      ctx.font = "700 220px Caveat, sans-serif"
      ctx.fillText(`×${f.count}`, W / 2, H * 0.62)
      fit(f.label, W - 60, 64, H * 0.88)
    }
  }
  return canvas
}
