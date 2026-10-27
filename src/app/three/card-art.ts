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
  sheet: THREE.Mesh // the flames, a shader plane hugging the card
  back: THREE.Mesh // the fiery rim and embers on the back
  points: THREE.Points // the embers
  embers: Embers
  intensity: { value: number } // flames, 0..1
  reach: { value: number } // how high the flames have climbed, 0..1
  glow: { value: number } // embers and back, 0..1
  on: boolean // true while burning or dying out
}

interface Embers {
  baseX: Float32Array
  baseY: Float32Array
  baseZ: Float32Array
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
  const backMesh = new THREE.Mesh(geometry, cardMaterial(back))
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

// A card face. Out of the studio lighting of the pack scenes (no tone mapping, no environment), so the
// cards and their holo look the same everywhere.
function cardMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.5, toneMapped: false, envMapIntensity: 0 })
}

export function frontMaterial(kit: Kit, map: THREE.Texture, finish: Finish): THREE.MeshStandardMaterial {
  const material = cardMaterial(map)
  // fire cards get the holo sheen too, inside their flames
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

// Fire finish: flame tongues licking the card edges (a noise shader on a plane behind the card, seen
// from both sides), big glowing embers swirling up, and on the back a pulsing fiery rim with embers
// smouldering in its stripes. The face gets the embossed holo (see frontMaterial). Hidden until setFire(on):
// the scenes only light it once the card is face up, so the back never gives the finish away.
const SHEET_W = CARD_W * 1.5
const SHEET_H = CARD_H * 1.6
const SHEET_Y = (SHEET_H - CARD_H) / 2 - 0.25 // anchored a little under the card, the flames rise above it
const EMBERS = 100

const PLANE_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const FLAME_FRAGMENT = `
uniform float uTime;
uniform float uIntensity;
uniform float uReach; // 0..1: how high the fire has climbed from the bottom of the card
uniform vec2 uCard;
uniform vec2 uSheet;
uniform float uOffset;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}
// distance to the card (a rounded box), negative inside
float card(vec2 p) {
  vec2 q = abs(p) - uCard * 0.5 + 0.12;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.12;
}

void main() {
  vec2 p = (vUv - 0.5) * uSheet + vec2(0.0, uOffset); // in card units, card centered on 0
  float d = card(p);
  float top = uCard.y * 0.5;
  float up = clamp((p.y + top) / (2.0 * top), 0.0, 1.0);

  // scrolling noise stretched upward, warped by a second one so the tongues swirl
  vec2 q = p * vec2(3.2, 1.1);
  q.y -= uTime * 1.8;
  vec2 warp = vec2(fbm(q * 0.8 + vec2(0.0, uTime * 0.6)), fbm(q + vec2(5.2, 1.3)));
  float n = fbm(q + warp * 1.8);

  // close to the card it always burns; further out only the noise peaks do, which cuts the tongues.
  // The flames reach further above the card, a little at the bottom, the least on the sides.
  float reach = 0.3 + 0.22 * (1.0 - up) + 1.1 * smoothstep(top - 0.4, top + 0.5, p.y);
  float near = clamp(1.0 - max(d, 0.0) / reach, 0.0, 1.0);
  float heat = near * near * (2.4 * n - 0.45);
  heat *= smoothstep(-0.2, 0.02, d); // nothing in the middle (seen when the card turns)
  heat *= smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x) * smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
  // it catches from the bottom up (and dies out top down)
  float line = mix(-top - 0.4, top + 1.8, uReach);
  heat *= 1.0 - smoothstep(line - 0.5, line, p.y);
  heat *= uIntensity;

  // red -> orange -> yellow -> hot white, cut sharp into tongues
  vec3 c = mix(vec3(0.78, 0.12, 0.0), vec3(1.0, 0.42, 0.0), smoothstep(0.2, 0.5, heat));
  c = mix(c, vec3(1.0, 0.82, 0.24), smoothstep(0.55, 0.85, heat));
  c = mix(c, vec3(1.0, 0.97, 0.85), smoothstep(1.0, 1.3, heat));
  float alpha = smoothstep(0.12, 0.25, heat) * (0.55 + 0.45 * smoothstep(0.25, 0.6, heat));
  gl_FragColor = vec4(c * alpha, alpha);
}`

// The back of a fire card: a rim of fire pulsing on its edge, embers glowing in the stripes.
const BACK_FRAGMENT = `
uniform float uTime;
uniform float uIntensity;
uniform vec2 uCard;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), u.x), u.y);
}
float card(vec2 p) {
  vec2 q = abs(p) - uCard * 0.5 + 0.12;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.12;
}

void main() {
  vec2 p = (vUv - 0.5) * uCard;
  float d = card(p);
  if (d > 0.0) discard;
  float pulse = 0.75 + 0.25 * sin(uTime * 3.0 + p.y * 2.0);
  float rim = exp(d * 40.0) * pulse * 0.8;
  // the diagonal stripes of the back, a few embers smouldering in them
  float stripe = smoothstep(0.35, 0.5, abs(fract((p.x + p.y) * 2.2) - 0.5));
  float ember = smoothstep(0.72, 0.9, noise(p * 11.0 + vec2(0.0, -uTime * 0.5))) * stripe;
  vec3 c = vec3(1.0, 0.38, 0.0) * rim + vec3(0.9, 0.35, 0.02) * ember * (0.55 + 0.45 * sin(uTime * 4.0 + p.x * 7.0));
  gl_FragColor = vec4(c * uIntensity, 1.0);
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

// a white-yellow core in an orange glow; the color brightness carries the ember's life
const EMBER_FRAGMENT = `
varying vec3 vColor;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float glow = pow(max(0.0, 1.0 - r), 2.0);
  float core = smoothstep(0.35, 0.0, r);
  float life = max(vColor.r, max(vColor.g, vColor.b));
  gl_FragColor = vec4(vColor * glow + vec3(1.0, 0.95, 0.75) * core * life, 1.0);
}`

export function buildFire(kit: Kit, root: THREE.Group): Fire {
  const intensity = { value: 0 } // flames
  const reach = { value: 0 }
  const glow = { value: 0 } // embers and the back
  const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }
  const card = { value: new THREE.Vector2(CARD_W, CARD_H) }

  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(SHEET_W, SHEET_H),
    new THREE.ShaderMaterial({
      vertexShader: PLANE_VERTEX,
      fragmentShader: FLAME_FRAGMENT,
      uniforms: {
        uTime: kit.uTime,
        uIntensity: intensity,
        uReach: reach,
        uCard: card,
        uSheet: { value: new THREE.Vector2(SHEET_W, SHEET_H) },
        uOffset: { value: SHEET_Y },
      },
      ...additive,
      side: THREE.DoubleSide,
    }),
  )
  sheet.position.set(0, SHEET_Y, -0.02)
  // just off the back face, seen only from behind
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_W, CARD_H),
    new THREE.ShaderMaterial({
      vertexShader: PLANE_VERTEX,
      fragmentShader: BACK_FRAGMENT,
      uniforms: { uTime: kit.uTime, uIntensity: glow, uCard: card },
      ...additive,
    }),
  )
  back.rotation.y = Math.PI
  back.position.z = -0.004
  // in the flipping group, so they turn with the card
  const flip = root.children[0] ?? root
  flip.add(sheet, back)

  const embers: Embers = {
    baseX: new Float32Array(EMBERS),
    baseY: new Float32Array(EMBERS),
    baseZ: new Float32Array(EMBERS),
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
    sizes[i] = gsap.utils.random(0.14, 0.38)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(EMBERS * 3), 3))
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(EMBERS * 3), 3))
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1))
  const material = new THREE.ShaderMaterial({
    vertexShader: EMBER_VERTEX,
    fragmentShader: EMBER_FRAGMENT,
    uniforms: { uScale: { value: 400 } },
    ...additive,
  })
  const points = new THREE.Points(geometry, material)
  // sizeAttenuation like PointsMaterial: half the drawing buffer height
  points.onBeforeRender = (renderer) => (material.uniforms["uScale"].value = renderer.domElement.height / 2)
  points.frustumCulled = false
  root.add(points)

  const fire: Fire = { sheet, back, points, embers, intensity, reach, glow, on: false }
  show(fire, false)
  return fire
}

function show(fire: Fire, visible: boolean): void {
  fire.sheet.visible = visible
  fire.back.visible = visible
  fire.points.visible = visible
}

// Embers start beside or under the card; some drift a little in front of it, never over the middle.
function spawn(e: Embers, i: number): void {
  const w = CARD_W / 2
  const h = CARD_H / 2
  if (Math.random() < 0.65) {
    // the sides: these may pass a little in front, over the frame only
    const side = Math.random() < 0.5 ? -1 : 1
    e.baseX[i] = side * (w + gsap.utils.random(-0.1, 0.2))
    e.baseY[i] = gsap.utils.random(-h, h * 0.5)
    e.baseZ[i] = gsap.utils.random(-0.05, 0.25)
  } else {
    // under the card: behind it, seen below it and above it
    e.baseX[i] = gsap.utils.random(-w, w)
    e.baseY[i] = -h - gsap.utils.random(0, 0.2)
    e.baseZ[i] = -0.06
  }
  e.rise[i] = gsap.utils.random(1.2, 2.6)
  e.speed[i] = gsap.utils.random(0.3, 0.7)
  e.phase[i] = Math.random() * Math.PI * 2
  e.freq[i] = gsap.utils.random(1.5, 3.5)
  e.age[i] = 0
}

// Catches from the bottom (embers, then flames climbing) or dies out the other way.
// fast: cut in 0.25 s, e.g. when the card leaves for the row.
export function setFire(fire: Fire, on: boolean, fast = false): void {
  gsap.killTweensOf([fire.intensity, fire.reach, fire.glow])
  if (on) {
    fire.on = true
    show(fire, true)
    fire.intensity.value = 1
    gsap.to(fire.glow, { value: 1, duration: 0.3, ease: "power1.out" })
    gsap.fromTo(fire.reach, { value: 0 }, { value: 1, duration: 0.8, delay: 0.15, ease: "power2.out" })
    return
  }
  const out = () => {
    fire.on = false
    show(fire, false)
  }
  if (fast) {
    gsap.to([fire.intensity, fire.glow], { value: 0, duration: 0.25, onComplete: out })
    return
  }
  gsap.to(fire.reach, { value: 0, duration: 0.6, ease: "power1.in" })
  gsap.to(fire.glow, { value: 0, duration: 0.3, delay: 0.5, onComplete: out })
}

const HOT = new THREE.Color("#ffb020")
const COLD = new THREE.Color("#ff4a00")
const tmp = new THREE.Color()

// One frame of embers (the flames and the back move in their shaders): they swirl up, twinkle and fade.
export function burn(fire: Fire, dt: number, t: number): void {
  const e = fire.embers
  const k = fire.glow.value
  const pos = fire.points.geometry.getAttribute("position") as THREE.BufferAttribute
  const col = fire.points.geometry.getAttribute("color") as THREE.BufferAttribute
  for (let i = 0; i < EMBERS; i++) {
    e.age[i] += (dt * e.speed[i]) / e.rise[i]
    if (e.age[i] >= 1) spawn(e, i)
    const life = e.age[i]
    const swirl = t * e.freq[i] + e.phase[i]
    const x = e.baseX[i] + Math.sin(swirl) * 0.14 * (0.3 + life)
    const z = e.baseZ[i] > 0 ? e.baseZ[i] + Math.cos(swirl) * 0.08 : e.baseZ[i]
    pos.setXYZ(i, x, e.baseY[i] + life * e.rise[i], z)
    const twinkle = 0.7 + 0.3 * Math.sin(t * 18 + e.phase[i] * 7)
    const fade = Math.min(1, life * 5) * (1 - life)
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
