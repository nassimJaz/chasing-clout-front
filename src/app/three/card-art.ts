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
  halo: THREE.Mesh // rainbow glow around the card edge
  points: THREE.Points // the embers
  embers: Embers
  intensity: { value: number } // 0..1, tweened by setFire
  on: boolean // true while burning or fading out
}

interface Embers {
  baseX: Float32Array
  baseY: Float32Array
  rise: Float32Array // how high it goes before dying
  speed: Float32Array
  phase: Float32Array
  freq: Float32Array
  age: Float32Array // 0..1
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
  // fire cards get the holo sheen too, under their halo
  if (finish === "HOLO" || finish === "FIRE") holo(material, kit.uTime)
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

// Fire finish: a soft rainbow halo turning around the card edge, a few embers rising beside it,
// and the holo sheen on the card (see frontMaterial). Hidden until setFire(on).
const HALO_W = CARD_W * 1.25
const HALO_H = CARD_H * 1.2
const EMBERS = 56

const HALO_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const HALO_FRAGMENT = `
uniform float uTime;
uniform float uIntensity;
uniform vec2 uCard;
uniform vec2 uSize;
varying vec2 vUv;

// distance to the card (a rounded box), negative inside
float card(vec2 p) {
  vec2 q = abs(p) - uCard * 0.5 + 0.12;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.12;
}

void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float d = card(p);
  // glows from the edge outward, nothing in the middle (seen when the card turns)
  float outside = max(d, 0.0);
  float glow = (0.6 * exp(-outside * 8.0) + 0.5 * exp(-outside * 30.0)) * smoothstep(-0.06, 0.0, d);
  // the hue turns slowly around the card
  float hue = atan(p.y, p.x) / 6.28318 + uTime * 0.06;
  vec3 rainbow = 0.5 + 0.5 * cos(6.28318 * (hue + vec3(0.0, 0.33, 0.67)));
  float pulse = 0.8 + 0.2 * sin(uTime * 1.4);
  float edge = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x) * smoothstep(0.0, 0.04, vUv.y) * smoothstep(1.0, 0.96, vUv.y);
  gl_FragColor = vec4(rainbow * glow * pulse * edge * uIntensity * 0.85, 1.0);
}`

const EMBER_VERTEX = `
attribute float size;
attribute vec3 color;
uniform float uScale;
varying vec3 vColor;
void main() {
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`

const EMBER_FRAGMENT = `
uniform sampler2D uMap;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0) * texture2D(uMap, gl_PointCoord);
}`

export function buildFire(kit: Kit, root: THREE.Group): Fire {
  const intensity = { value: 0 }
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(HALO_W, HALO_H),
    new THREE.ShaderMaterial({
      vertexShader: HALO_VERTEX,
      fragmentShader: HALO_FRAGMENT,
      uniforms: {
        uTime: kit.uTime,
        uIntensity: intensity,
        uCard: { value: new THREE.Vector2(CARD_W, CARD_H) },
        uSize: { value: new THREE.Vector2(HALO_W, HALO_H) },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  halo.position.z = -0.03
  halo.visible = false
  // in the flipping group, so the halo turns with the card
  const flip = root.children[0] ?? root
  flip.add(halo)

  const embers: Embers = {
    baseX: new Float32Array(EMBERS),
    baseY: new Float32Array(EMBERS),
    rise: new Float32Array(EMBERS),
    speed: new Float32Array(EMBERS),
    phase: new Float32Array(EMBERS),
    freq: new Float32Array(EMBERS),
    age: new Float32Array(EMBERS),
  }
  const sizes = new Float32Array(EMBERS)
  for (let i = 0; i < EMBERS; i++) {
    spawn(embers, i)
    embers.age[i] = Math.random() // spread over their life from the start
    sizes[i] = gsap.utils.random(0.03, 0.08)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(EMBERS * 3), 3))
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(EMBERS * 3), 3))
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1))
  const material = new THREE.ShaderMaterial({
    vertexShader: EMBER_VERTEX,
    fragmentShader: EMBER_FRAGMENT,
    uniforms: { uMap: { value: kit.spark }, uScale: { value: 400 } },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const points = new THREE.Points(geometry, material)
  // sizeAttenuation like PointsMaterial: half the drawing buffer height
  points.onBeforeRender = (renderer) => (material.uniforms["uScale"].value = renderer.domElement.height / 2)
  points.frustumCulled = false
  points.visible = false
  root.add(points)
  return { halo, points, embers, intensity, on: false }
}

// An ember starts beside the card (mostly the sides, a few under it), never in front of its face.
function spawn(e: Embers, i: number): void {
  const w = CARD_W / 2
  const h = CARD_H / 2
  if (Math.random() < 0.8) {
    e.baseX[i] = (Math.random() < 0.5 ? -1 : 1) * (w + gsap.utils.random(0.02, 0.14))
    e.baseY[i] = gsap.utils.random(-h, h * 0.4)
  } else {
    e.baseX[i] = gsap.utils.random(-w, w)
    e.baseY[i] = -h - gsap.utils.random(0.05, 0.2)
  }
  e.rise[i] = gsap.utils.random(0.8, 1.8)
  e.speed[i] = gsap.utils.random(0.2, 0.45)
  e.phase[i] = Math.random() * Math.PI * 2
  e.freq[i] = gsap.utils.random(1.2, 3)
  e.age[i] = 0
}

// Fades the halo and the embers in (on) or out (off).
export function setFire(fire: Fire, on: boolean): void {
  gsap.killTweensOf(fire.intensity)
  if (on) {
    fire.on = true
    fire.halo.visible = true
    fire.points.visible = true
  }
  gsap.to(fire.intensity, {
    value: on ? 1 : 0,
    duration: on ? 0.6 : 0.5,
    ease: on ? "power2.out" : "power1.in",
    onComplete: () => {
      if (on) return
      fire.on = false
      fire.halo.visible = false
      fire.points.visible = false
    },
  })
}

const HOT = new THREE.Color("#ffd23c")
const COLD = new THREE.Color("#ff6a00")
const tmp = new THREE.Color()

// One frame of embers (the halo turns in its shader): they rise slowly, swirl, twinkle and fade out at the top.
export function burn(fire: Fire, dt: number, t: number): void {
  const e = fire.embers
  const k = fire.intensity.value
  const pos = fire.points.geometry.getAttribute("position") as THREE.BufferAttribute
  const col = fire.points.geometry.getAttribute("color") as THREE.BufferAttribute
  for (let i = 0; i < EMBERS; i++) {
    e.age[i] += (dt * e.speed[i]) / e.rise[i]
    if (e.age[i] >= 1) spawn(e, i)
    const life = e.age[i]
    const x = e.baseX[i] + Math.sin(t * e.freq[i] + e.phase[i]) * 0.06 * (0.3 + life)
    pos.setXYZ(i, x, e.baseY[i] + life * e.rise[i], -0.05)
    const twinkle = 0.65 + 0.35 * Math.sin(t * 14 + e.phase[i] * 7)
    // fades in quickly, out slowly toward the top
    const fade = Math.min(1, life * 6) * (1 - life)
    tmp.copy(HOT).lerp(COLD, life).multiplyScalar(fade * twinkle * k)
    col.setXYZ(i, tmp.r, tmp.g, tmp.b)
  }
  pos.needsUpdate = true
  col.needsUpdate = true
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
