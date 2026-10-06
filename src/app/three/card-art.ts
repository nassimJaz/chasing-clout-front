import * as THREE from "three"
import { gsap } from "gsap"
import { Card, Finish, RARITIES, RARITY_COLORS, RARITY_LABELS } from "models/game.model"

export { RARITY_COLORS }

// A card in 3D: its canvas textures (same look as <meme-card>), its holo and fire finishes.

// Card size: 63×88 mm, 1 unit = 25 mm. Textures are drawn at 3.2 px per CSS px of a 160px meme-card.
export const CARD_W = 2.52
export const CARD_H = 3.52
const TEX_W = 512
const TEX_H = 716
const PX = TEX_W / 160

// What a scene lends to the builders below (see Stage).
export interface Kit {
  texture(canvas: HTMLCanvasElement): THREE.CanvasTexture
  uTime: { value: number }
  spark: THREE.Texture
}

export interface CardObject {
  card: Card
  finish: Finish
  level: number // index in RARITIES: 0 = common, 5 = secret
  root: THREE.Group // position, scale, tilt
  flip: THREE.Group // rotation.y: π = back to the camera, 0 = face up
  front: THREE.Mesh
  fire?: Fire
}

export interface Fire {
  points: THREE.Points
  speeds: number[]
  light: THREE.PointLight
  on: boolean
}

// Two planes back to back: the back is a mesh of its own, so it shows whatever the GPU culls. Starts face down.
export function createCardObject(
  kit: Kit,
  item: { card: Card; finish: Finish },
  back: THREE.Texture,
  image: HTMLImageElement | null,
): CardObject {
  const geometry = new THREE.PlaneGeometry(CARD_W, CARD_H)
  const front = new THREE.Mesh(geometry, frontMaterial(kit, kit.texture(drawCardFront(item.card, image)), item.finish))
  const backMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: back, alphaTest: 0.5, roughness: 0.5 }))
  backMesh.rotation.y = Math.PI

  const flip = new THREE.Group()
  flip.add(front, backMesh)
  flip.rotation.y = Math.PI
  const root = new THREE.Group()
  root.add(flip)

  const card: CardObject = { ...item, level: RARITIES.indexOf(item.card.rarity), root, flip, front }
  if (item.finish === "FIRE") card.fire = buildFire(kit, root)
  return card
}

export function frontMaterial(kit: Kit, map: THREE.Texture, finish: Finish): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.5 })
  if (finish === "HOLO") holo(material, kit.uTime)
  return material
}

// Holo: a rainbow sheen added to the lit card, its hue depends on the view angle (the normal) and time.
export function holo(material: THREE.MeshStandardMaterial, uTime: { value: number }): void {
  material.customProgramCacheKey = () => "holo"
  material.onBeforeCompile = (shader) => {
    shader.uniforms["uTime"] = uTime
    shader.fragmentShader =
      "uniform float uTime;\n" +
      shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          vec3 n = normalize(normal);
          float h = vMapUv.x * 0.9 + vMapUv.y * 1.1 + n.x * 1.8 + n.y * 1.2 + uTime * 0.15;
          vec3 rainbow = 0.5 + 0.5 * cos(6.28318 * (h + vec3(0.0, 0.33, 0.67)));
          float band = 0.5 + 0.5 * sin((vMapUv.x + vMapUv.y) * 8.0 - uTime * 1.5 + n.x * 6.0);
          totalEmissiveRadiance += rainbow * (0.08 + 0.4 * band * band * band);
        }`,
      )
  }
}

// Fire: sparks rising around the card and a flickering orange light. Hidden until fire.on.
export function buildFire(kit: Kit, root: THREE.Group): Fire {
  const count = 90
  const positions = new Float32Array(count * 3)
  const speeds: number[] = []
  for (let i = 0; i < count; i++) {
    positions.set([gsap.utils.random(-1.4, 1.4), gsap.utils.random(-2, 1.9), gsap.utils.random(-0.1, 0.3)], i * 3)
    speeds.push(gsap.utils.random(0.8, 1.8))
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  const points = new THREE.Points(geometry, sparkMaterial(kit, 0.22, true))
  points.visible = false
  const light = new THREE.PointLight("#ff6a00", 0, 6)
  light.position.z = 1
  root.add(points, light)
  return { points, speeds, light, on: false }
}

export function setFire(fire: Fire, on: boolean): void {
  fire.on = on
  fire.points.visible = on
  if (!on) fire.light.intensity = 0
}

const HOT = new THREE.Color("#ffd23c")
const COLD = new THREE.Color("#ff2a00")
const tmp = new THREE.Color()

// One frame of fire: the sparks rise, turn red then black (invisible, additive) at the top.
export function burn(fire: Fire, dt: number, t: number): void {
  const pos = fire.points.geometry.getAttribute("position") as THREE.BufferAttribute
  const col = fire.points.geometry.getAttribute("color") as THREE.BufferAttribute
  fire.speeds.forEach((speed, i) => {
    let y = pos.getY(i) + speed * dt
    let x = pos.getX(i) + Math.sin(t * 4 + i) * 0.004
    if (y > 2) {
      y = -2 - Math.random() * 0.3
      x = gsap.utils.random(-1.4, 1.4)
    }
    pos.setXY(i, x, y)
    const life = (y + 2) / 4
    tmp.copy(HOT).lerp(COLD, Math.min(1, life * 1.5)).multiplyScalar(1 - life)
    col.setXYZ(i, tmp.r, tmp.g, tmp.b)
  })
  pos.needsUpdate = true
  col.needsUpdate = true
  fire.light.intensity = 3 + Math.sin(t * 12) + Math.random() * 0.8
}

export function sparkMaterial(kit: Kit, size: number, vertexColors: boolean): THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    size,
    map: kit.spark,
    vertexColors,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
}

// The canvas textures need these fonts.
export async function loadFonts(): Promise<void> {
  await Promise.all([
    document.fonts.load("700 120px Caveat"),
    document.fonts.load("500 40px Roboto"),
    document.fonts.load("700 36px Roboto"),
  ]).catch(() => undefined)
  await document.fonts.ready
}

// Relative URL: the dev server proxies /memes to the API, so the image is same-origin and usable as a WebGL texture.
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  return [canvas, canvas.getContext("2d")!]
}

// The meme-card back: purple stripes, white border, "CC".
export function drawCardBack(): HTMLCanvasElement {
  const [canvas, ctx] = canvas2d(TEX_W, TEX_H)
  ctx.beginPath()
  ctx.roundRect(0, 0, TEX_W, TEX_H, 10 * PX)
  ctx.clip()
  ctx.save()
  ctx.translate(TEX_W / 2, TEX_H / 2)
  ctx.rotate(Math.PI / 4)
  const stripe = 10 * PX
  for (let x = -TEX_H, i = 0; x < TEX_H; x += stripe, i++) {
    ctx.fillStyle = i % 2 ? "#5d0d82" : "#4a0a67"
    ctx.fillRect(x, -TEX_H, stripe, TEX_H * 2)
  }
  ctx.restore()
  const border = 4 * PX
  ctx.lineWidth = border * 2 // half of it is clipped
  ctx.strokeStyle = "#fff"
  ctx.beginPath()
  ctx.roundRect(0, 0, TEX_W, TEX_H, 10 * PX)
  ctx.stroke()
  ctx.fillStyle = "#fff"
  ctx.font = `700 ${40 * PX}px Caveat, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("CC", TEX_W / 2, TEX_H / 2)
  return canvas
}

// The meme-card front: image, name and rarity, border in the rarity color (gold gradient for secrets).
export function drawCardFront(card: Card, image: HTMLImageElement | null): HTMLCanvasElement {
  const [canvas, ctx] = canvas2d(TEX_W, TEX_H)
  const border = 5 * PX
  const textH = 37 * PX
  ctx.beginPath()
  ctx.roundRect(0, 0, TEX_W, TEX_H, 10 * PX)
  ctx.clip()
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, TEX_W, TEX_H)

  const x = border
  const w = TEX_W - border * 2
  const h = TEX_H - border * 2 - textH
  if (image) {
    // object-fit: cover
    const scale = Math.max(w / image.width, h / image.height)
    const sw = w / scale
    const sh = h / scale
    ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, border, w, h)
  } else {
    ctx.fillStyle = "#ddd"
    ctx.fillRect(x, border, w, h)
  }

  const color = RARITY_COLORS[card.rarity]
  ctx.fillStyle = "#212121"
  ctx.font = `500 ${12.8 * PX}px Roboto, sans-serif`
  ctx.textBaseline = "top"
  ctx.fillText(ellipsis(ctx, card.name, w - 12 * PX), x + 6 * PX, border + h + 3 * PX)
  ctx.fillStyle = color
  ctx.font = `700 ${11.2 * PX}px Roboto, sans-serif`
  ctx.fillText(RARITY_LABELS[card.rarity], x + 6 * PX, border + h + 20 * PX)

  if (card.rarity === "SECRET") {
    const gold = ctx.createLinearGradient(0, 0, TEX_W, TEX_H)
    ;["#f9e27d", "#c9a227", "#fff6c8", "#c9a227"].forEach((c, i) => gold.addColorStop(i / 3, c))
    ctx.strokeStyle = gold
  } else {
    ctx.strokeStyle = color
  }
  ctx.lineWidth = border * 2
  ctx.beginPath()
  ctx.roundRect(0, 0, TEX_W, TEX_H, 10 * PX)
  ctx.stroke()
  return canvas
}

// A soft round dot for the particles.
export function drawSpark(): HTMLCanvasElement {
  const [canvas, ctx] = canvas2d(64, 64)
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, "#ffffffff")
  gradient.addColorStop(0.4, "#ffffff88")
  gradient.addColorStop(1, "#ffffff00")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)
  return canvas
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  while (text && ctx.measureText(text + "…").width > max) text = text.slice(0, -1)
  return text + "…"
}
