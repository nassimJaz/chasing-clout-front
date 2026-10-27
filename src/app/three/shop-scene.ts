import * as THREE from "three"
import { gsap } from "gsap"
import { BoosterType, Card, FORMATS, PurchaseFormat } from "models/game.model"
import { CARD_H, createCardObject, drawCardBack, loadFonts, loadImage, sparkMaterial } from "./card-art"
import { boosterColors, buildPack, Pack, PackBooster } from "./pack-art"
import { Stage } from "./stage"
import { castShadows } from "./studio"

// The shop window: what is being bought (a booster, a tri-pack or a display, two-colored when mixed)
// on a lit stand, with a fan of the rarest cards behind it. It turns into the next pack live when the
// type or the format changes. On the first visit it plays an arrival: lights on, the pack drops in.

// the fan of rare cards behind the pack: angles of each card, around their bottom
const FAN_ANGLES = [-0.62, -0.31, 0, 0.31, 0.62]

interface Burst {
  points: THREE.Points
  speeds: THREE.Vector3[]
}

export class ShopScene extends Stage {
  private pack?: Pack
  private holder = new THREE.Group() // sway and mouse tilt
  private stand = new THREE.Group()
  private glow!: THREE.MeshBasicMaterial
  private spot = new THREE.SpotLight("#ffffff", 60, 40, 0.5, 0.6)
  private bursts: Burst[] = []
  private height = 4.8 // of the current pack, for the float and the camera
  private look = new THREE.Vector3()
  private fan = new THREE.Group()
  private fanPivots: THREE.Group[] = []
  private shift = 0 // px the view is moved by, for the configuration panel

  constructor(container: HTMLElement, private reducedMotion: boolean) {
    super(container)
  }

  // Throws when WebGL is not available. intro: start dark, for intro() to light it up.
  async init(type: BoosterType, format: PurchaseFormat, second?: BoosterType, intro = false): Promise<void> {
    this.setup()
    await loadFonts()
    if (this.disposed) return

    // a dark stand with a ring of light in the type's color
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1.06, 0.18, 64),
      new THREE.MeshStandardMaterial({ color: "#2a1236", roughness: 0.3, metalness: 0.6 }),
    )
    this.glow = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4 })
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.06, 1.22, 64), this.glow)
    ring.rotation.x = -Math.PI / 2
    ring.position.y = -0.08
    this.stand.add(top, ring)
    // the pack's shadow falls on the stand
    top.receiveShadow = true
    this.studio()
    this.scene.add(this.stand, this.holder)

    this.spot.position.set(0, 9, 6)
    this.scene.add(this.spot, this.spot.target)

    this.holder.add(this.fan)
    this.place(type, format, second)
    this.fit(1, true)
    if (intro) {
      this.spot.intensity = 0
      this.glow.opacity = 0
      this.pack!.group.position.y = this.height * 1.8
    }
    this.start()
  }

  // The arrival, about 1.5 s: the lights come on, the pack drops onto its stand, the fan opens behind
  // it (as soon as its cards are loaded, see setFan). Returned so a click can jump to its end.
  intro(): gsap.core.Timeline {
    const tl = this.timeline()
    tl.to(this.spot, { intensity: 60, duration: 0.7, ease: "power2.in" }, 0)
      .to(this.glow, { opacity: 0.4, duration: 0.5 }, 0.3)
      .to(this.pack!.group.position, { y: 0, duration: 0.9, ease: "bounce.out" }, 0.35)
    if (this.fanPivots.length) this.spread(tl, 0.6)
    return tl
  }

  // Up to 5 rare cards fanned behind the pack, holo side out. Opens them at once, or animated when
  // still arriving.
  async setFan(cards: Card[], animate: boolean): Promise<void> {
    if (this.disposed || !this.renderer) return
    const back = this.texture(drawCardBack())
    const images = await Promise.all(cards.slice(0, FAN_ANGLES.length).map((c) => loadImage(c.imageUrl)))
    if (this.disposed) return
    images.forEach((image, i) => {
      const card = createCardObject(this.kit, { card: cards[i], finish: "HOLO" }, back, image)
      card.flip.rotation.y = 0
      card.root.position.y = CARD_H / 2 // pivots around its bottom
      const pivot = new THREE.Group()
      pivot.add(card.root)
      pivot.position.z = -Math.abs(i - (images.length - 1) / 2) * 0.05
      pivot.scale.setScalar(0.001)
      this.fan.add(pivot)
      this.fanPivots.push(pivot)
    })
    const tl = this.timeline()
    this.spread(tl, 0, animate ? 0.8 : 0)
  }

  private spread(tl: gsap.core.Timeline, at: number, duration = 0.8): void {
    const n = this.fanPivots.length
    const angles = FAN_ANGLES.slice((FAN_ANGLES.length - n) >> 1)
    tl.to(this.fanPivots.map((p) => p.scale), { x: 1, y: 1, z: 1, duration: duration * 0.5, ease: "back.out(1.6)", stagger: 0.04 }, at)
      .to(this.fanPivots.map((p) => p.rotation), { z: (i: number) => -angles[i], duration, ease: "power3.out", stagger: 0.04 }, at + 0.1)
  }

  // Shrinks the current pack away and grows the new one; the camera steps back for the big displays.
  show(type: BoosterType, format: PurchaseFormat, second?: BoosterType): void {
    if (this.disposed || !this.renderer) return
    const old = this.pack
    const tl = this.timeline()
    if (old) {
      tl.to(old.group.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.25, ease: "back.in(1.6)", overwrite: "auto" })
      tl.call(() => this.remove(old.group, false, true))
    }
    this.place(type, format, second)
    const group = this.pack!.group
    group.scale.setScalar(0.01)
    tl.to(group.scale, { x: 1, y: 1, z: 1, duration: 0.6, ease: "back.out(1.7)" }, old ? 0.2 : 0)
    this.fit(0.8)
  }

  // A purchase: the pack jumps and bursts into sparks of its colors.
  celebrate(): void {
    const pack = this.pack
    if (!pack || this.disposed) return
    const tl = this.timeline()
    const jump = this.height * 0.25
    tl.to(pack.group.position, { y: `+=${jump}`, duration: 0.25, ease: "power2.out" })
      .to(pack.group.position, { y: `-=${jump}`, duration: 0.6, ease: "bounce.out" })
      .to(pack.group.rotation, { y: `+=${Math.PI * 2}`, duration: 0.85, ease: "power2.inOut" }, 0)
      .fromTo(this.glow, { opacity: 1 }, { opacity: 0.4, duration: 1 }, 0)

    const colors = this.colors
    const count = 160
    const positions = new Float32Array(count * 3)
    const vertexColors = new Float32Array(count * 3)
    const speeds: THREE.Vector3[] = []
    const c = new THREE.Color()
    for (let i = 0; i < count; i++) {
      positions.set([0, this.height * 0.1, 0], i * 3)
      c.set(colors[i % colors.length]).lerp(new THREE.Color("#ffffff"), 0.35)
      vertexColors.set([c.r, c.g, c.b], i * 3)
      const dir = new THREE.Vector3().randomDirection()
      dir.y = Math.abs(dir.y) + 0.3
      speeds.push(dir.multiplyScalar(gsap.utils.random(3, 8) * Math.max(1, this.height / 5)))
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute("color", new THREE.BufferAttribute(vertexColors, 3))
    const material = sparkMaterial(this.kit, 0.25 * Math.max(1, this.height / 5), true)
    const points = new THREE.Points(geometry, material)
    this.scene.add(points)
    const burst = { points, speeds }
    this.bursts.push(burst)
    tl.to(material, { opacity: 0, duration: 1.4, ease: "power1.in" }, 0.05).call(
      () => {
        this.bursts = this.bursts.filter((b) => b !== burst)
        this.remove(points)
      },
      [],
      1.5,
    )
  }

  protected update(t: number, dt: number): void {
    // slow sway (none with reduced motion) and the mouse tilt
    const sway = this.reducedMotion ? 0 : Math.sin(t * 0.45) * 0.45
    this.holder.rotation.y += (sway + this.mouse.x * 0.4 - this.holder.rotation.y) * 0.06
    this.holder.rotation.x += (-this.mouse.y * 0.15 - this.holder.rotation.x) * 0.06
    this.holder.position.y = this.reducedMotion ? 0 : Math.sin(t * 1.5) * 0.04 * this.height

    this.bursts.forEach((b) => {
      const pos = b.points.geometry.getAttribute("position") as THREE.BufferAttribute
      b.speeds.forEach((v, i) => {
        pos.setXYZ(i, pos.getX(i) + v.x * dt, pos.getY(i) + v.y * dt, pos.getZ(i) + v.z * dt)
        v.multiplyScalar(0.95)
        v.y -= 6 * dt
      })
      pos.needsUpdate = true
    })
    this.camera.lookAt(this.look)
  }

  protected override onResize(): void {
    // wide screens: the configuration panel covers the right of the window, so the pack is drawn left of center
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    const shift = w > 1000 ? Math.min(240, w * 0.18) : 0
    this.shift = shift
    if (shift) this.camera.setViewOffset(w, h, shift, 0, w, h)
    else this.camera.clearViewOffset()
    if (this.pack) this.fit(0, true)
  }

  private get colors(): string[] {
    return this.pack?.group.userData["colors"] ?? ["#ffffff"]
  }

  // Builds the pack of this choice in the holder (a mixed display alternates both types).
  private place(type: BoosterType, format: PurchaseFormat, second?: BoosterType): void {
    const count = FORMATS.find((f) => f.format === format)!.count
    const types = second && second.id !== type.id ? [type, second] : [type]
    const boosters: PackBooster[] = Array.from({ length: count }, (_, i) => types[i % types.length])
    const title = types.map((b) => b.name).join(" + ")
    const pack = buildPack(this.kit, format, boosters, title)
    const colors = types.flatMap((b) => boosterColors(b.code).slice(0, 2))
    pack.group.userData["colors"] = colors
    // displays are seen a little from the side, to show they are boxes
    if (pack.body) pack.group.rotation.y = -0.45
    this.holder.add(pack.group)
    castShadows(pack.group)
    this.pack = pack
    this.height = pack.size.h
    this.spot.color.set(colors[0])
    this.glow.color.set(colors[colors.length > 2 ? 2 : 0])
  }

  // Puts the stand under the pack and frames it: about two thirds of the height of the window.
  private fit(duration: number, now = false): void {
    const { w, h, d } = this.pack!.size
    const fov = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
    // only the part of the window left of the panel is free: 2 × shift narrower
    const width = this.container.clientWidth
    const free = this.camera.aspect * Math.max(0.4, (width - 2 * this.shift) / Math.max(1, width))
    const z = Math.max((h * 1.9) / fov, (w * 1.5) / fov / free) + d / 2
    const radius = Math.max(w * 0.42, d * 0.6)
    const vars = { duration: now ? 0 : duration, ease: "power2.inOut", overwrite: "auto" as const }
    const tl = this.timeline()
    tl.to(this.camera.position, { ...vars, x: 0, y: h * 0.35, z }, 0)
      .to(this.look, { ...vars, y: -h * 0.05 }, 0)
      .to(this.stand.position, { ...vars, y: -h / 2 - 0.15 }, 0)
      .call(() => this.lights?.place(-h / 2 - 0.24, this.pack!.size), [], 0)
      .to(this.stand.scale, { ...vars, x: radius, z: radius }, 0)
      .to(this.spot, { ...vars, distance: z * 3 }, 0)
      // the fan stands behind the stand, as tall as the pack
      .to(this.fan.position, { ...vars, y: -h / 2, z: -d / 2 - 1.2 }, 0)
      .to(this.fan.scale, { ...vars, x: h / 4.8, y: h / 4.8, z: h / 4.8 }, 0)
    this.spot.position.set(0, h * 2.2, z * 0.6)
  }
}
