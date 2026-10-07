import * as THREE from "three"
import { gsap } from "gsap"
import { PulledCard } from "models/game.model"
import {
  burn,
  CARD_H,
  CARD_W,
  CardObject,
  createCardObject,
  drawCardBack,
  loadFonts,
  loadImage,
  RARITY_COLORS,
  setFire,
  sparkMaterial,
} from "./card-art"
import { boosterColors, boosterMaterial, BOOSTER_H, BOOSTER_W, drawBooster, STRIP } from "./pack-art"
import { Stage } from "./stage"

// The 3D booster opening: a pack that floats, gets torn open, then a stack of cards revealed one by one.

const STACK_Y = 0.3
const PRESENT = { x: 0, y: 0.45, z: 2.6 }
const ROW_SCALE = 0.34

interface Burst {
  points: THREE.Points
  speeds: THREE.Vector3[]
}

// The backdrop behind the scene (CSS, the canvas is transparent): golden while a secret card is announced.
export type Mood = "default" | "secret"

export interface BoosterSceneOptions {
  // start with the cards already stacked (the booster was opened elsewhere, e.g. it comes out of a box)
  skipPack?: boolean
}

export class BoosterScene extends Stage {
  busy = false
  revealed = 0
  onMood?: (mood: Mood) => void

  private flash = new THREE.PointLight("#ffffff", 0, 30)
  private booster = new THREE.Group()
  private strip?: THREE.Mesh
  private body?: THREE.Mesh
  private cards: CardObject[] = []
  private presented?: CardObject
  private bursts: Burst[] = []
  private shake = { amount: 0 }
  private cameraZ = 10
  private tearing = false
  private mood: Mood = "default"

  constructor(
    container: HTMLElement,
    private pulled: PulledCard[],
    private boosterName: string,
    private boosterCode: string,
    private options: BoosterSceneOptions = {},
  ) {
    super(container)
  }

  get done(): boolean {
    return this.revealed === this.cards.length && !this.presented
  }

  // Throws when WebGL is not available.
  async init(): Promise<void> {
    this.setup()
    this.camera.position.set(0, 0, this.cameraZ)
    this.flash.position.set(0, 0.5, 5)
    this.scene.add(this.flash)

    await loadFonts()
    const images = await Promise.all(this.pulled.map((p) => loadImage(p.card.imageUrl)))
    if (this.disposed) return

    const back = this.texture(drawCardBack())
    this.pulled.forEach((p, i) => this.buildCard(p, i, back, images[i]))
    if (this.options.skipPack) this.deal()
    else this.buildBooster()
    this.start()
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
    this.toStack(tl, 1.5)
    tl.call(() => (this.booster.visible = false))
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
      const secret = card.card.rarity === "SECRET"
      tl.to(card.root.position, { ...PRESENT, duration: 0.55, ease: "power3.out" }, 0.1)
        .to(card.root.rotation, { z: 0, duration: 0.55 }, 0.1)
      // a secret card is announced as soon as it comes forward: golden backdrop and light, longer wait
      if (secret) {
        tl.call(() => this.setMood("secret"), [], 0.1)
          .set(this.flash.color, { r: 1, g: 0.8, b: 0.35 }, 0.1)
          .to(this.flash, { intensity: 15, duration: 1.2, ease: "sine.inOut" }, 0.2)
      }
      // suspense: the big ones tremble before turning
      const flipAt = secret ? 1.8 : big ? 1.2 : 0.5
      if (big) {
        const shakes = secret ? 19 : 9
        tl.to(card.root.position, { x: 0.04, duration: 0.05, repeat: shakes, yoyo: true }, 0.65).set(card.root.position, { x: 0 })
      }
      tl.to(card.flip.rotation, { y: 0, duration: 0.8, ease: "back.out(1.6)" }, flipAt)
        .call(() => this.revealEffects(card), [], flipAt + 0.2)
      if (big) tl.to({}, { duration: 0.8 }) // longer pause on the big pulls
    }
    await tl
    this.busy = false
  }

  override dispose(): void {
    gsap.killTweensOf([this.shake, this.flash])
    super.dispose()
  }

  protected update(t: number, dt: number): void {
    // the pack floats and follows the mouse
    if (this.booster.visible) {
      this.tilt(this.booster, t, this.tearing ? 0 : 1)
      if (!this.tearing) this.booster.position.y = STACK_Y + Math.sin(t * 1.6) * 0.06
    }

    // the card on display follows the mouse too (makes the holo sheen move)
    for (const card of this.cards) {
      const on = card === this.presented
      card.root.rotation.x += ((on ? -this.mouse.y * 0.3 : 0) - card.root.rotation.x) * 0.1
      card.root.rotation.y += ((on ? this.mouse.x * 0.4 : 0) - card.root.rotation.y) * 0.1
      if (card.fire?.on) burn(card.fire, dt, t)
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
  }

  protected override onResize(): void {
    // step back on narrow screens so the pack and the cards still fit
    this.cameraZ = Math.min(16, 10 * Math.max(1, 0.75 / this.camera.aspect))
    this.camera.position.z = this.cameraZ
  }

  private buildBooster(): void {
    const canvas = drawBooster(this.boosterName, boosterColors(this.boosterCode))
    const stripTexture = this.texture(canvas)
    stripTexture.repeat.set(1, STRIP)
    stripTexture.offset.set(0, 1 - STRIP)
    const bodyTexture = this.texture(canvas)
    bodyTexture.repeat.set(1, 1 - STRIP)

    this.strip = new THREE.Mesh(new THREE.PlaneGeometry(BOOSTER_W, BOOSTER_H * STRIP), boosterMaterial(stripTexture))
    this.strip.position.y = (BOOSTER_H * (1 - STRIP)) / 2
    this.body = new THREE.Mesh(new THREE.PlaneGeometry(BOOSTER_W, BOOSTER_H * (1 - STRIP)), boosterMaterial(bodyTexture))
    this.body.position.y = (-BOOSTER_H * STRIP) / 2
    this.booster.add(this.strip, this.body)
    this.booster.position.y = STACK_Y
    this.scene.add(this.booster)
  }

  private buildCard(pulled: PulledCard, i: number, back: THREE.Texture, image: HTMLImageElement | null): void {
    const card = createCardObject(this.kit, pulled, back, image)
    // hidden inside the pack until it is torn
    card.root.position.set(0, STACK_Y - 0.4, -0.15 - i * 0.01)
    card.root.scale.setScalar(0.95)
    card.root.visible = false
    this.scene.add(card.root)
    this.cards.push(card)
  }

  // Without a pack: the cards slide up from below into the stack.
  private deal(): void {
    this.booster.visible = false
    this.cards.forEach((c) => {
      c.root.visible = true
      c.root.position.y = -8
    })
    this.busy = true
    const tl = this.timeline()
    this.toStack(tl, 0.1)
    tl.call(() => (this.busy = false))
  }

  private toStack(tl: gsap.core.Timeline, at: number): void {
    tl.to(
      this.cards.map((c) => c.root.position),
      {
        y: STACK_Y,
        z: (i: number) => (this.cards.length - 1 - i) * 0.02,
        duration: 0.6,
        ease: "back.out(1.4)",
        stagger: 0.06,
      },
      at,
    ).to(
      this.cards.map((c) => c.root.rotation),
      { z: () => gsap.utils.random(-0.06, 0.06), duration: 0.6, stagger: 0.06 },
      at,
    )
  }

  // What happens when a card turns face up: stronger with the rarity.
  private revealEffects(card: CardObject): void {
    const color = RARITY_COLORS[card.card.rarity]
    const tl = this.timeline()
    this.flash.color.set(color)
    tl.fromTo(this.flash, { intensity: 10 + card.level * 25 }, { intensity: 0, duration: 1 + card.level * 0.2, ease: "power2.out" }, 0)

    if (card.fire) setFire(card.fire, true)
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
    const material = sparkMaterial(this.kit, 0.18, false)
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

  // Shrinks a revealed card into the row at the bottom of the screen, in pull order.
  private toRow(tl: gsap.core.Timeline, card: CardObject): void {
    const z = 0.2
    const { halfH, halfW } = this.visibleHalf(this.cameraZ - z)
    const n = this.cards.length
    const gap = Math.min(CARD_W * ROW_SCALE + 0.08, (halfW * 1.8) / n)
    const i = this.cards.indexOf(card)
    tl.to(
      card.root.position,
      { x: (i - (n - 1) / 2) * gap, y: -halfH + (CARD_H * ROW_SCALE) / 2 + 0.2, z, duration: 0.6, ease: "power2.inOut" },
      0,
    ).to(card.root.scale, { x: ROW_SCALE, y: ROW_SCALE, z: ROW_SCALE, duration: 0.6, ease: "power2.inOut" }, 0)
    // no flames on the way down: cut as it leaves
    if (card.fire) tl.call(() => setFire(card.fire!, false, true), [], 0)
    if (card.card.rarity === "SECRET") tl.call(() => this.setMood("default"), [], 0)
  }

  private setMood(mood: Mood): void {
    if (mood === this.mood) return
    this.mood = mood
    this.onMood?.(mood)
  }
}
