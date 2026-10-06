import * as THREE from "three"
import { gsap } from "gsap"
import { Card, PulledCard, Rarity, RARITIES, RARITY_LABELS } from "models/game.model"

// The 3D booster opening: a pack that floats, gets torn open, then a stack of cards revealed one by one.
// Plain TypeScript, no Angular: the component lazy-loads this file, so three and gsap stay out of the main bundle.

// Same colors as meme-card.component.scss.
const RARITY_COLORS: Record<Rarity, string> = {
  COMMON: "#9e9e9e",
  UNCOMMON: "#43a047",
  RARE: "#1e88e5",
  VERY_RARE: "#8e24aa",
  ULTRA_RARE: "#fb8c00",
  SECRET: "#c9a227",
}

// Same gradients as the .booster-* classes of styles.scss.
const BOOSTER_COLORS: Record<string, string[]> = {
  BASIC: ["#1e88e5", "#0d47a1"],
  SPECIAL: ["#ab47bc", "#4a0a67"],
  COLLECTION: ["#f9e27d", "#c9a227", "#8d6e00"],
}

// Card size: 63×88 mm, 1 unit = 25 mm. Textures are drawn at 3.2 px per CSS px of a 160px meme-card.
const CARD_W = 2.52
const CARD_H = 3.52
const TEX_W = 512
const TEX_H = 716
const PX = TEX_W / 160

const BOOSTER_W = 3.2
const BOOSTER_H = 4.8
const STRIP = 0.15 // share of the booster torn off at the top

const STACK_Y = 0.3
const PRESENT = { x: 0, y: 0.45, z: 2.6 }
const ROW_SCALE = 0.34

interface CardObject {
  pulled: PulledCard
  level: number // index in RARITIES: 0 = common, 5 = secret
  root: THREE.Group // position, scale, mouse tilt
  flip: THREE.Group // rotation.y: π = back to the camera, 0 = face up
  fire?: Fire
}

interface Fire {
  points: THREE.Points
  speeds: number[]
  light: THREE.PointLight
  on: boolean
}

interface Burst {
  points: THREE.Points
  speeds: THREE.Vector3[]
}

export class BoosterScene {
  busy = false
  revealed = 0

  private renderer!: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
  private flash = new THREE.PointLight("#ffffff", 0, 30)
  private booster = new THREE.Group()
  private strip?: THREE.Mesh
  private body?: THREE.Mesh
  private cards: CardObject[] = []
  private presented?: CardObject
  private bursts: Burst[] = []
  private textures: THREE.Texture[] = []
  private timelines = new Set<gsap.core.Timeline>()
  private uTime = { value: 0 }
  private mouse = new THREE.Vector2()
  private shake = { amount: 0 }
  private cameraZ = 10
  private tearing = false
  private disposed = false
  private raf = 0
  private last = 0
  private observer?: ResizeObserver

  constructor(private container: HTMLElement, private pulled: PulledCard[], private boosterName: string, private boosterCode: string) {}

  get done(): boolean {
    return this.revealed === this.cards.length && !this.presented
  }

  // Throws when WebGL is not available.
  async init(): Promise<void> {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.container.appendChild(this.renderer.domElement)

    this.camera.position.set(0, 0, this.cameraZ)
    this.scene.add(new THREE.AmbientLight("#ffffff", 1.6))
    const sun = new THREE.DirectionalLight("#ffffff", 1.8)
    sun.position.set(2, 3, 6)
    this.scene.add(sun)
    this.flash.position.set(0, 0.5, 5)
    this.scene.add(this.flash)

    // the canvas textures need the fonts and the card images
    await Promise.all([
      document.fonts.load("700 120px Caveat"),
      document.fonts.load("500 40px Roboto"),
      document.fonts.load("700 36px Roboto"),
    ]).catch(() => undefined)
    await document.fonts.ready
    const images = await Promise.all(this.pulled.map((p) => loadImage(p.card.imageUrl)))
    if (this.disposed) return

    this.buildBooster()
    const back = this.texture(drawCardBack())
    this.pulled.forEach((p, i) => this.buildCard(p, i, back, images[i]))

    this.resize()
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(this.container)
    this.renderer.domElement.addEventListener("pointermove", this.onPointerMove)
    this.renderer.domElement.addEventListener("pointerleave", this.onPointerLeave)
    this.raf = requestAnimationFrame(this.tick)
  }

  // The pack shakes, its top flies off, the cards come out and land in a face-down stack.
  async tearOpen(): Promise<void> {
    if (this.busy || this.disposed || !this.strip || !this.body) return
    this.busy = true
    this.tearing = true
    const tl = this.timeline()
    tl.to(this.booster.rotation, { z: 0.04, duration: 0.05, repeat: 9, yoyo: true, ease: "sine.inOut" })
      .set(this.booster.rotation, { z: 0 })
      .to(this.strip.position, { x: 2.5, y: "+=3.5", duration: 0.8, ease: "power2.out" }, 0.5)
      .to(this.strip.rotation, { z: -1.6, x: 0.8, duration: 0.8, ease: "power2.out" }, 0.5)
      .to(this.strip.material as THREE.Material, { opacity: 0, duration: 0.4 }, 0.9)
      .call(() => this.cards.forEach((c) => (c.root.visible = true)), [], 0.6)
      .to(
        this.cards.map((c) => c.root.position),
        { y: 2.3, duration: 0.6, ease: "power2.out", stagger: 0.05 },
        0.65,
      )
      .to(this.body.position, { y: "-=6", duration: 0.7, ease: "power2.in" }, 1.3)
      .to(this.body.material as THREE.Material, { opacity: 0, duration: 0.5 }, 1.5)
      .to(
        this.cards.map((c) => c.root.position),
        {
          y: STACK_Y,
          z: (i: number) => (this.cards.length - 1 - i) * 0.02,
          duration: 0.6,
          ease: "back.out(1.4)",
          stagger: 0.06,
        },
        1.5,
      )
      .to(
        this.cards.map((c) => c.root.rotation),
        { z: () => gsap.utils.random(-0.06, 0.06), duration: 0.6, stagger: 0.06 },
        1.5,
      )
      .call(() => (this.booster.visible = false))
    await tl
    this.busy = false
  }

  // Sends the card on display to the bottom row, then brings the next one forward and flips it.
  async revealNext(): Promise<void> {
    if (this.busy || this.disposed) return
    this.busy = true
    const tl = this.timeline()
    if (this.presented) {
      this.toRow(tl, this.presented)
      this.presented = undefined
    }
    const card = this.cards[this.revealed]
    if (card) {
      this.revealed++
      this.presented = card
      const big = card.level >= 4
      tl.to(card.root.position, { ...PRESENT, duration: 0.55, ease: "power3.out" }, 0.1)
        .to(card.root.rotation, { z: 0, duration: 0.55 }, 0.1)
      // suspense: the big ones tremble before turning
      const flipAt = big ? 1.2 : 0.5
      if (big) tl.to(card.root.position, { x: 0.04, duration: 0.05, repeat: 9, yoyo: true }, 0.65).set(card.root.position, { x: 0 })
      tl.to(card.flip.rotation, { y: 0, duration: 0.8, ease: "back.out(1.6)" }, flipAt)
        .call(() => this.revealEffects(card), [], flipAt + 0.2)
      if (big) tl.to({}, { duration: 0.8 }) // longer pause on the big pulls
    }
    await tl
    this.busy = false
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.timelines.forEach((tl) => tl.kill())
    gsap.killTweensOf([this.shake, this.flash])
    this.observer?.disconnect()
    if (!this.renderer) return
    const canvas = this.renderer.domElement
    canvas.removeEventListener("pointermove", this.onPointerMove)
    canvas.removeEventListener("pointerleave", this.onPointerLeave)
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      const materials = mesh.material ? ([] as THREE.Material[]).concat(mesh.material) : []
      materials.forEach((m) => m.dispose())
    })
    this.textures.forEach((t) => t.dispose())
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    canvas.remove()
  }

  private tick = (now: number): void => {
    this.raf = requestAnimationFrame(this.tick)
    const t = now / 1000
    const dt = Math.min(0.05, t - this.last)
    this.last = t
    this.uTime.value = t

    // the pack floats and follows the mouse
    if (this.booster.visible) {
      const rx = this.tearing ? 0 : -this.mouse.y * 0.25 + Math.sin(t * 1.3) * 0.04
      const ry = this.tearing ? 0 : this.mouse.x * 0.35 + Math.sin(t * 0.9) * 0.08
      this.booster.rotation.x += (rx - this.booster.rotation.x) * 0.08
      this.booster.rotation.y += (ry - this.booster.rotation.y) * 0.08
      if (!this.tearing) this.booster.position.y = STACK_Y + Math.sin(t * 1.6) * 0.06
    }

    // the card on display follows the mouse too (makes the holo sheen move)
    for (const card of this.cards) {
      const on = card === this.presented
      card.root.rotation.x += ((on ? -this.mouse.y * 0.3 : 0) - card.root.rotation.x) * 0.1
      card.root.rotation.y += ((on ? this.mouse.x * 0.4 : 0) - card.root.rotation.y) * 0.1
      if (card.fire?.on) this.burn(card.fire, dt, t)
    }

    this.bursts.forEach((b) => {
      const pos = b.points.geometry.getAttribute("position") as THREE.BufferAttribute
      b.speeds.forEach((v, i) => {
        pos.setXYZ(i, pos.getX(i) + v.x * dt, pos.getY(i) + v.y * dt, pos.getZ(i) + v.z * dt)
        v.multiplyScalar(0.95)
      })
      pos.needsUpdate = true
    })

    this.camera.position.x = (Math.random() - 0.5) * this.shake.amount
    this.camera.position.y = (Math.random() - 0.5) * this.shake.amount
    this.renderer.render(this.scene, this.camera)
  }

  private buildBooster(): void {
    const canvas = drawBooster(this.boosterName, BOOSTER_COLORS[this.boosterCode] ?? BOOSTER_COLORS["SPECIAL"])
    const stripTexture = this.texture(canvas)
    stripTexture.repeat.set(1, STRIP)
    stripTexture.offset.set(0, 1 - STRIP)
    const bodyTexture = this.texture(canvas)
    bodyTexture.repeat.set(1, 1 - STRIP)

    const material = (map: THREE.Texture) =>
      new THREE.MeshStandardMaterial({ map, roughness: 0.35, metalness: 0.25, side: THREE.DoubleSide, transparent: true })
    this.strip = new THREE.Mesh(new THREE.PlaneGeometry(BOOSTER_W, BOOSTER_H * STRIP), material(stripTexture))
    this.strip.position.y = (BOOSTER_H * (1 - STRIP)) / 2
    this.body = new THREE.Mesh(new THREE.PlaneGeometry(BOOSTER_W, BOOSTER_H * (1 - STRIP)), material(bodyTexture))
    this.body.position.y = (-BOOSTER_H * STRIP) / 2
    this.booster.add(this.strip, this.body)
    this.booster.position.y = STACK_Y
    this.scene.add(this.booster)
  }

  // Two planes back to back: the back is a mesh of its own, so it shows whatever the GPU culls.
  private buildCard(pulled: PulledCard, i: number, back: THREE.Texture, image: HTMLImageElement | null): void {
    const geometry = new THREE.PlaneGeometry(CARD_W, CARD_H)
    const front = new THREE.MeshStandardMaterial({ map: this.texture(drawCardFront(pulled.card, image)), alphaTest: 0.5, roughness: 0.5 })
    if (pulled.finish === "HOLO") this.holo(front)
    const backMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: back, alphaTest: 0.5, roughness: 0.5 }))
    backMesh.rotation.y = Math.PI

    const flip = new THREE.Group()
    flip.add(new THREE.Mesh(geometry, front), backMesh)
    flip.rotation.y = Math.PI
    const root = new THREE.Group()
    root.add(flip)
    // hidden inside the pack until it is torn
    root.position.set(0, STACK_Y - 0.4, -0.15 - i * 0.01)
    root.scale.setScalar(0.95)
    root.visible = false
    this.scene.add(root)

    const card: CardObject = { pulled, level: RARITIES.indexOf(pulled.card.rarity), root, flip }
    if (pulled.finish === "FIRE") card.fire = this.buildFire(root)
    this.cards.push(card)
  }

  // Holo: a rainbow sheen added to the lit card, its hue depends on the view angle (the normal) and time.
  private holo(material: THREE.MeshStandardMaterial): void {
    material.customProgramCacheKey = () => "holo"
    material.onBeforeCompile = (shader) => {
      shader.uniforms["uTime"] = this.uTime
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

  // Fire: sparks rising around the card and a flickering orange light.
  private buildFire(root: THREE.Group): Fire {
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
    const points = new THREE.Points(geometry, this.sparkMaterial(0.22, true))
    points.visible = false
    const light = new THREE.PointLight("#ff6a00", 0, 6)
    light.position.z = 1
    root.add(points, light)
    return { points, speeds, light, on: false }
  }

  private burn(fire: Fire, dt: number, t: number): void {
    const pos = fire.points.geometry.getAttribute("position") as THREE.BufferAttribute
    const col = fire.points.geometry.getAttribute("color") as THREE.BufferAttribute
    const hot = new THREE.Color("#ffd23c")
    const cold = new THREE.Color("#ff2a00")
    fire.speeds.forEach((speed, i) => {
      let y = pos.getY(i) + speed * dt
      let x = pos.getX(i) + Math.sin(t * 4 + i) * 0.004
      if (y > 2) {
        y = -2 - Math.random() * 0.3
        x = gsap.utils.random(-1.4, 1.4)
      }
      pos.setXY(i, x, y)
      // yellow at the bottom, red then black (invisible, additive) at the top
      const life = (y + 2) / 4
      const c = hot.clone().lerp(cold, Math.min(1, life * 1.5)).multiplyScalar(1 - life)
      col.setXYZ(i, c.r, c.g, c.b)
    })
    pos.needsUpdate = true
    col.needsUpdate = true
    fire.light.intensity = 3 + Math.sin(t * 12) + Math.random() * 0.8
  }

  // What happens when a card turns face up: stronger with the rarity.
  private revealEffects(card: CardObject): void {
    const color = RARITY_COLORS[card.pulled.card.rarity]
    const tl = this.timeline()
    this.flash.color.set(color)
    tl.fromTo(this.flash, { intensity: 10 + card.level * 25 }, { intensity: 0, duration: 1 + card.level * 0.2, ease: "power2.out" }, 0)

    if (card.fire) {
      card.fire.on = true
      card.fire.points.visible = true
    }
    if (card.level >= 2) {
      this.ring(tl, color, card.level, 0)
      this.burst(tl, color, 40 + card.level * 30)
    }
    if (card.level >= 4) {
      this.ring(tl, color, card.level, 0.25)
      tl.fromTo(this.shake, { amount: 0.25 }, { amount: 0, duration: 0.8, ease: "power2.out" }, 0)
    }
  }

  private ring(tl: gsap.core.Timeline, color: string, level: number, at: number): void {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.75, 64), material)
    ring.position.set(PRESENT.x, PRESENT.y, PRESENT.z - 0.1)
    ring.scale.setScalar(0.5)
    this.scene.add(ring)
    tl.to(ring.scale, { x: 1 + level * 0.5, y: 1 + level * 0.5, duration: 0.9, ease: "power2.out" }, at)
      .to(material, { opacity: 0, duration: 0.9, ease: "power1.in" }, at)
      .call(() => this.remove(ring), [], at + 0.9)
  }

  private burst(tl: gsap.core.Timeline, color: string, count: number): void {
    const positions = new Float32Array(count * 3)
    const speeds: THREE.Vector3[] = []
    for (let i = 0; i < count; i++) {
      positions.set([PRESENT.x, PRESENT.y, PRESENT.z - 0.05], i * 3)
      const angle = Math.random() * Math.PI * 2
      const speed = gsap.utils.random(2, 6)
      speeds.push(new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed, gsap.utils.random(-1, 1)))
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    const material = this.sparkMaterial(0.18, false)
    material.color.set(color).lerp(new THREE.Color("#ffffff"), 0.3)
    const points = new THREE.Points(geometry, material)
    this.scene.add(points)
    const burst = { points, speeds }
    this.bursts.push(burst)
    tl.to(material, { opacity: 0, duration: 1.2, ease: "power1.in" }, 0).call(
      () => {
        this.bursts = this.bursts.filter((b) => b !== burst)
        this.remove(points)
      },
      [],
      1.2,
    )
  }

  private sparkMaterial(size: number, vertexColors: boolean): THREE.PointsMaterial {
    return new THREE.PointsMaterial({
      size,
      map: this.spark,
      vertexColors,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  }

  private get spark(): THREE.Texture {
    return (this._spark ??= this.texture(drawSpark()))
  }
  private _spark?: THREE.Texture

  // Shrinks a revealed card into the row at the bottom of the screen, in pull order.
  private toRow(tl: gsap.core.Timeline, card: CardObject): void {
    const z = 0.2
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (this.cameraZ - z)
    const halfW = halfH * this.camera.aspect
    const n = this.cards.length
    const gap = Math.min(CARD_W * ROW_SCALE + 0.08, (halfW * 1.8) / n)
    const i = this.cards.indexOf(card)
    tl.to(
      card.root.position,
      { x: (i - (n - 1) / 2) * gap, y: -halfH + (CARD_H * ROW_SCALE) / 2 + 0.2, z, duration: 0.6, ease: "power2.inOut" },
      0,
    ).to(card.root.scale, { x: ROW_SCALE, y: ROW_SCALE, z: ROW_SCALE, duration: 0.6, ease: "power2.inOut" }, 0)
    if (card.fire) tl.to(card.fire.light, { intensity: 0, duration: 0.3 }, 0).call(() => (card.fire!.on = false), [], 0.3)
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container
    if (!w || !h) return
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    // step back on narrow screens so the pack and the cards still fit
    this.cameraZ = Math.min(16, 10 * Math.max(1, 0.75 / this.camera.aspect))
    this.camera.position.z = this.cameraZ
    this.camera.updateProjectionMatrix()
  }

  private onPointerMove = (e: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
  }

  private onPointerLeave = (): void => {
    this.mouse.set(0, 0)
  }

  private timeline(): gsap.core.Timeline {
    const tl = gsap.timeline({ onComplete: () => this.timelines.delete(tl) })
    this.timelines.add(tl)
    return tl
  }

  private texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    this.textures.push(texture)
    return texture
  }

  private remove(object: THREE.Mesh | THREE.Points): void {
    this.scene.remove(object)
    object.geometry.dispose()
    ;(object.material as THREE.Material).dispose()
  }
}

// Relative URL: the dev server proxies /memes to the API, so the image is same-origin and usable as a WebGL texture.
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  return [canvas, canvas.getContext("2d")!]
}

// The meme-card back: purple stripes, white border, "CC".
function drawCardBack(): HTMLCanvasElement {
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
function drawCardFront(card: Card, image: HTMLImageElement | null): HTMLCanvasElement {
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

// The pack wrapper: colored like the inventory boosters, with a dashed tear line under the top strip.
function drawBooster(name: string, colors: string[]): HTMLCanvasElement {
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

// A soft round dot for the particles.
function drawSpark(): HTMLCanvasElement {
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
