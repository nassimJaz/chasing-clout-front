import * as THREE from "three"
import { gsap } from "gsap"
import { Card, Finish } from "models/game.model"
import { buildFire, burn, CARD_H, CardObject, createCardObject, drawCardBack, frontMaterial, loadFonts, loadImage, setFire } from "./card-art"
import { Stage } from "./stage"

// One card, big, to inspect: drag to turn it around (360°, shows the back), it tilts toward the mouse at rest.

export class CardViewer extends Stage {
  private object?: CardObject
  private frontMap?: THREE.Texture
  private spinTo?: gsap.QuickToFunc
  private spin = 0 // target rotation.y of the card
  private dragX?: number
  private velocity = 0
  private dragging = false

  constructor(container: HTMLElement, private card: Card, private finish: Finish, private reducedMotion: boolean) {
    super(container)
  }

  // Throws when WebGL is not available.
  async init(): Promise<void> {
    this.setup()
    await loadFonts()
    const image = await loadImage(this.card.imageUrl)
    if (this.disposed) return

    const object = createCardObject(this.kit, { card: this.card, finish: this.finish }, this.texture(drawCardBack()), image)
    object.flip.rotation.y = 0
    if (object.fire) setFire(object.fire, true)
    this.frontMap = (object.front.material as THREE.MeshStandardMaterial).map!
    this.scene.add(object.root)
    this.object = object

    // inertia: every new target is reached smoothly
    this.spinTo = gsap.quickTo(object.flip.rotation, "y", { duration: 0.8, ease: "power3.out" })
    this.listen("pointerdown", (e) => {
      const p = e as PointerEvent
      this.dragging = true
      this.dragX = p.clientX
      this.velocity = 0
      this.canvas.setPointerCapture(p.pointerId)
    })
    this.listen("pointermove", (e) => {
      if (!this.dragging || this.dragX === undefined) return
      const x = (e as PointerEvent).clientX
      this.velocity = (x - this.dragX) * 0.012
      this.spin += this.velocity
      this.dragX = x
      this.spinTo!(this.spin)
    })
    const release = () => {
      if (!this.dragging) return
      this.dragging = false
      // a flick keeps the card turning a bit
      this.spin += this.velocity * (this.reducedMotion ? 0 : 8)
      this.spinTo!(this.spin)
    }
    this.listen("pointerup", release)
    this.listen("pointercancel", release)
    this.start()
  }

  // Swaps the finish with a quick flip: the front changes while the card shows its back.
  setFinish(finish: Finish): void {
    const object = this.object
    if (!object || finish === this.finish) return
    this.finish = finish
    const swap = () => {
      const old = object.front.material as THREE.Material
      object.front.material = frontMaterial(this.kit, this.frontMap!, finish)
      old.dispose()
      if (finish === "FIRE") object.fire ??= buildFire(this.kit, object.root)
      if (object.fire) setFire(object.fire, finish === "FIRE")
    }
    if (this.reducedMotion) return swap()
    this.spin = Math.round(this.spin / (Math.PI * 2)) * Math.PI * 2 + Math.PI * 2
    const tl = this.timeline()
    tl.to(object.root.scale, { x: 0.92, y: 0.92, duration: 0.2, ease: "power2.out" })
      .call(() => this.spinTo!(this.spin), [], 0)
      .call(swap, [], 0.25)
      .to(object.root.scale, { x: 1, y: 1, duration: 0.4, ease: "back.out(2)" }, 0.45)
  }

  protected update(t: number, dt: number): void {
    const object = this.object
    if (!object) return
    // at rest, a light tilt toward the mouse makes the holo sheen move
    const sway = this.reducedMotion ? 0 : Math.sin(t * 0.8) * 0.04
    const rx = this.dragging ? 0 : -this.mouse.y * 0.3 + sway
    const ry = this.dragging ? 0 : this.mouse.x * 0.35
    object.root.rotation.x += (rx - object.root.rotation.x) * 0.08
    object.root.rotation.y += (ry - object.root.rotation.y) * 0.08
    if (object.fire?.on) burn(object.fire, dt, t)
  }

  protected override onResize(): void {
    // the card takes about 70% of the height, less on narrow screens
    const byHeight = CARD_H / 0.7 / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)))
    this.camera.position.z = byHeight * Math.max(1, 0.8 / this.camera.aspect)
  }
}
