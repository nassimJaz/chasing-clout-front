import * as THREE from "three"
import { gsap } from "gsap"
import { PurchaseFormat, UserBooster } from "models/game.model"
import { loadFonts } from "./card-art"
import { boosterColors, BOOSTER_H, BOOSTER_W, buildPack, Pack } from "./pack-art"
import { BoosterArt, boosterGeometry } from "./booster-art"
import { Stage } from "./stage"

// A whole purchase in 3D: the closed pack (booster, tri-pack or display box) floats; opening it first
// tears its cellophane (or peels the blister) and swings the lid open on the boosters standing inside,
// then they line up in arched rows and the one picked with the mouse is sent to the component.

interface Item {
  id: number
  holder: THREE.Group // placed by the layout tweens
  mesh: THREE.Mesh // lifted by the hover, inside the holder
  material: THREE.MeshStandardMaterial
  hover: number // 0..1
  phase: number // idle bobbing offset
}

interface Slot {
  x: number
  y: number
  z: number
  ry: number
  scale: number
}

export class BoxScene extends Stage {
  busy = false
  onPick?: (id: number) => void

  private pack!: Pack
  private items: Item[] = []
  private geometry = boosterGeometry()
  private raycaster = new THREE.Raycaster()
  private hovered?: Item
  private interactive = false
  private opening = false
  private opened = false
  private gridZ = 10
  private closedZ = 10
  private unwrapped = false
  private look = new THREE.Vector3() // where the camera looks: the box center, its inside while it opens
  private unwrapping?: gsap.core.Timeline
  private reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches

  constructor(container: HTMLElement, private boosters: UserBooster[], private format: PurchaseFormat, private title: string) {
    super(container)
  }

  private get isBox(): boolean {
    return !!this.pack.body
  }

  // closed displays are seen a little from above and from the side
  private get base(): { x: number; y: number } {
    return this.isBox ? { x: 0.25, y: -0.5 } : { x: 0, y: 0 }
  }

  // Throws when WebGL is not available.
  async init(): Promise<void> {
    this.setup()
    await loadFonts()
    if (this.disposed) return

    this.pack = buildPack(this.kit, this.format, this.boosters, this.title)
    this.scene.add(this.pack.group)
    // the closed pack in studio light, floating over its soft shadow
    this.studio().place(-this.pack.size.h * 0.62, this.pack.size)
    if (this.isBox) {
      // standing in the box in tight rows, facing the front, a quarter of their height out of the box
      const art = new BoosterArt(this.kit)
      const { w, d, floor } = this.pack.inner!
      const k = (this.pack.size.h / 2 - floor) / (0.75 * BOOSTER_H)
      const cols = Math.max(1, Math.floor(w / (BOOSTER_W * k * 1.04)))
      const rows = Math.ceil(this.boosters.length / cols)
      this.boosters.forEach((b, i) => {
        const material = art.material(b.code, b.name, boosterColors(b.code))
        const mesh = new THREE.Mesh(this.geometry, material)
        const holder = new THREE.Group()
        holder.add(mesh)
        const col = i % cols
        const row = Math.floor(i / cols)
        holder.position.set(
          (col - (cols - 1) / 2) * (w / cols),
          floor + (BOOSTER_H * k) / 2,
          // a margin front and back: the packs lean and bulge
          d / 2 - 0.2 * k - ((row + 0.5) * (d - 0.4 * k)) / rows,
        )
        // leaning a little, every other one the other way
        holder.rotation.x = (row % 2 ? -0.07 : -0.02) + gsap.utils.random(-0.015, 0.015)
        holder.rotation.z = (col % 2 ? 0.035 : -0.035)
        holder.scale.setScalar(k)
        holder.visible = false
        this.pack.group.add(holder)
        this.items.push(this.item(b.id, holder, mesh, material, i))
      })
    } else {
      // the pack's boosters are the items: wrap each one in a holder at its place
      this.pack.boosters.forEach((mesh, i) => {
        const holder = new THREE.Group()
        holder.position.copy(mesh.position)
        holder.rotation.copy(mesh.rotation)
        mesh.position.set(0, 0, 0)
        mesh.rotation.set(0, 0, 0)
        holder.add(mesh)
        this.pack.group.add(holder)
        this.items.push(this.item(this.boosters[i].id, holder, mesh, mesh.material as THREE.MeshStandardMaterial, i))
      })
    }
    this.pack.group.rotation.set(this.base.x, this.base.y, 0)
    // reduced motion: the pack is shown already unwrapped and open
    if (this.reducedMotion) this.unwrap()?.progress(1)

    this.listen("click", () => {
      if (this.interactive && !this.busy && this.hovered) this.onPick?.(this.hovered.id)
    })
    this.start()
  }

  // Display: the cellophane is torn off and the lid swings open on its hinge, then the lid flies off
  // and the boosters come out of the box. Tri-pack: the blister bubble peels off, then the backing
  // slides away. A click while unwrapping jumps to the end of it.
  async openBox(): Promise<void> {
    if (this.unwrapping?.isActive()) {
      this.unwrapping.progress(1)
      return
    }
    if (this.opened || this.busy || this.disposed) return
    this.busy = true
    const unwrapping = this.unwrap()
    if (unwrapping) await unwrapping
    if (this.disposed) return
    // the camera looks straight at the grid again, as it moves to it
    this.timeline().to(this.look, { x: 0, y: 0, z: 0, duration: 1.1, ease: "power2.inOut" }, this.isBox ? 0.6 : 0.2)
    this.opening = true
    const { group, lid, body, band, size } = this.pack
    const tl = this.timeline({ defaults: { ease: "power2.out" } })
    tl.to(group.rotation, { x: 0, y: 0, z: 0, duration: 0.5 }, 0)

    let out = 0.3 // when the boosters leave the pack
    if (lid && body) {
      tl.to(lid.position, { y: `+=${size.h * 0.5}`, duration: 0.45 }, 0.3)
        .to(lid.rotation, { x: -0.5, z: 0.25, duration: 0.45 }, 0.3)
        .to(lid.position, { x: size.w * 1.5, y: `+=${size.h * 3}`, duration: 0.7, ease: "power2.in" }, 0.75)
        .to(materials(lid), { opacity: 0, duration: 0.4 }, 1)
        .to(body.position, { y: -size.h * 3, duration: 0.8, ease: "power2.in" }, 1.7)
        .to(materials(body), { opacity: 0, duration: 0.5 }, 2)
      out = 0.9
      // out of the top first
      tl.call(() => this.items.forEach((it) => (it.holder.visible = true)), [], out)
      tl.to(
        this.items.map((it) => it.holder.position),
        { y: size.h * 0.9, duration: 0.4, stagger: { amount: Math.min(0.6, this.items.length * 0.03) } },
        out,
      )
      out += 0.35
    } else if (band) {
      tl.to(band.position, { x: 8, duration: 0.6, ease: "power2.in" }, 0.1)
        .to(band.rotation, { z: -0.6, duration: 0.6 }, 0.1)
        .to(materials(band), { opacity: 0, duration: 0.3 }, 0.4)
      out = 0.5
    }
    // the boosters now live in the scene, at the same place on screen
    tl.call(() => this.items.forEach((it) => this.scene.attach(it.holder)), [], out)
    tl.to(this.camera.position, { x: 0, y: 0, z: this.gridZ, duration: 1.1, ease: "power2.inOut" }, Math.max(0, out - 0.3))
    this.layout(tl, out + 0.05, 0.03)
    tl.call(() => {
      this.opened = true
      this.interactive = true
      if (this.isBox) group.visible = false
    })
    await tl
    this.busy = false
  }

  // The physical opening, before the boosters come out (about 1.6 s): the tear strip runs across, the
  // cellophane loosens and fades, the lid swings back on its hinge (the big display lifts it first).
  // Tri-pack: the blister bubble peels off. Nothing for a single booster.
  private unwrap(): gsap.core.Timeline | undefined {
    if (this.unwrapped) return undefined
    this.unwrapped = true
    const { wrap, tab, hinge, lid, size, telescopic } = this.pack
    if (!wrap && !hinge) return undefined // a single booster
    const tl = this.timeline({ defaults: { ease: "power2.out" } })
    this.unwrapping = tl
    // the pack stops floating; the camera steps back and rises to look down into the box
    this.opening = true
    if (hinge) {
      const peek = this.peek()
      tl.to(this.pack.group.rotation, { x: 0, y: -0.35, z: 0, duration: 0.9, ease: "power2.inOut" }, 0.2)
        .to(this.camera.position, { ...peek.position, duration: 1.1, ease: "power2.inOut" }, 0.2)
        .to(this.look, { ...peek.look, duration: 1.1, ease: "power2.inOut" }, 0.2)
    }
    if (tab) {
      tl.to(tab.position, { x: size.w * 1.2, duration: 0.45, ease: "power1.in" }, 0).to(tab.material as THREE.Material, { opacity: 0, duration: 0.2 }, 0.3)
    }
    if (wrap) {
      const peel = !hinge // the blister bubble comes off forward and down
      tl.to(wrap.scale, { x: 1.04, y: 1.04, z: 1.06, duration: 0.4 }, peel ? 0 : 0.25)
        .to(materials(wrap), { opacity: 0, duration: 0.45 }, peel ? 0.15 : 0.35)
      if (peel) tl.to(wrap.position, { y: -1.2, z: 1.5, duration: 0.6, ease: "power2.in" }, 0).to(wrap.rotation, { x: 0.9, duration: 0.6 }, 0)
      tl.call(() => (wrap.visible = false))
    }
    if (hinge && lid) {
      let at = 0.6
      if (telescopic) {
        // the big display: the lid lifts off the walls before turning
        tl.to(lid.position, { y: `+=${size.h * 0.16}`, duration: 0.35, ease: "power2.out" }, at)
        at += 0.3
      }
      // the boosters show once the lid has cleared their tops
      tl.call(() => this.items.forEach((it) => (it.holder.visible = true)), [], at + 0.2)
        .to(hinge.rotation, { x: -1.92, duration: 0.75, ease: "back.out(1.4)" }, at)
        .to({}, { duration: 0.35 }) // a look at the boosters inside
    }
    return tl
  }

  // Takes a booster out of the grid: "zoom" toward the camera (it is being opened) or "fly" away (opened in bulk).
  async removeBooster(id: number, style: "zoom" | "fly"): Promise<void> {
    const item = this.items.find((it) => it.id === id)
    if (!item || this.disposed) return
    this.items = this.items.filter((it) => it !== item)
    if (this.hovered === item) this.hovered = undefined
    const tl = this.timeline({ defaults: { overwrite: "auto" } })
    if (style === "zoom") {
      tl.to(item.holder.position, { x: 0, y: 0, z: this.gridZ - 4, duration: 0.5, ease: "power2.in" }, 0)
        .to(item.holder.rotation, { x: 0, y: 0, z: 0, duration: 0.5 }, 0)
        .to(item.material, { opacity: 0, duration: 0.2 }, 0.35)
    } else {
      tl.to(item.holder.position, { y: "+=8", duration: 0.6, ease: "power2.in" }, 0)
        .to(item.holder.rotation, { z: gsap.utils.random(-1, 1), duration: 0.6 }, 0)
        .to(item.material, { opacity: 0, duration: 0.3 }, 0.3)
    }
    tl.call(() => this.remove(item.holder, item.mesh.geometry === this.geometry), [], 0.6)
    this.layout(tl, 0.2, 0.01)
    await tl
  }

  protected update(t: number): void {
    if (!this.opening) {
      this.tilt(this.pack.group, t, 1, this.base)
      this.pack.group.position.y = Math.sin(t * 1.6) * 0.06 * Math.max(1, this.pack.size.h / 4)
    }

    // the booster under the mouse lifts and glows
    let hovered: Item | undefined
    if (this.interactive && !this.busy) {
      this.raycaster.setFromCamera(this.mouse, this.camera)
      const hit = this.raycaster.intersectObjects(this.items.map((it) => it.mesh), false)[0]
      hovered = this.items.find((it) => it.mesh === hit?.object)
    }
    if (hovered !== this.hovered) {
      this.hovered = hovered
      this.canvas.style.cursor = hovered ? "pointer" : ""
    }
    for (const it of this.items) {
      it.hover += ((it === this.hovered ? 1 : 0) - it.hover) * 0.15
      it.mesh.position.set(0, it.hover * 0.5 + (this.opened ? Math.sin(t * 1.4 + it.phase) * 0.06 : 0), it.hover * 1.2)
      it.material.emissiveIntensity = it.hover * 0.35
    }
    this.camera.lookAt(this.look)
  }

  protected override onResize(): void {
    this.gridZ = Math.min(16, 10 * Math.max(1, 0.75 / this.camera.aspect))
    if (this.pack) {
      // the closed pack takes about two thirds of the screen
      const { w, h, d } = this.pack.size
      const fit = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
      // a little more than half of the height: room for the hint under it
      this.closedZ = Math.max((h * 1.9) / fit, (w * 1.6) / fit / this.camera.aspect) + d / 2
    }
    if (this.opened) {
      this.camera.position.z = this.gridZ
      this.layout(this.timeline(), 0, 0)
    } else if (!this.busy) {
      // closed, or already unwrapped with reduced motion: not while an opening moves the camera
      const view = this.unwrapped && this.pack.hinge ? this.peek() : { position: { x: 0, y: 0, z: this.closedZ }, look: { x: 0, y: 0, z: 0 } }
      this.camera.position.set(view.position.x, view.position.y, view.position.z)
      this.look.set(view.look.x, view.look.y, view.look.z)
    }
  }

  // Looking down into the open box (about 32°), far enough for the open lid to fit.
  private peek(): { position: { x: number; y: number; z: number }; look: { x: number; y: number; z: number } } {
    const { h } = this.pack.size
    // the big display's lid, lifted and turned, needs more room
    const distance = this.closedZ * (this.pack.telescopic ? 1.7 : 1.45)
    const angle = THREE.MathUtils.degToRad(32)
    const look = { x: 0, y: h * 0.2, z: 0 }
    return { position: { x: 0, y: look.y + Math.sin(angle) * distance, z: Math.cos(angle) * distance }, look }
  }

  private item(id: number, holder: THREE.Group, mesh: THREE.Mesh, material: THREE.MeshStandardMaterial, i: number): Item {
    material.emissive.set("#ffffff")
    material.emissiveIntensity = 0
    return { id, holder, mesh, material, hover: 0, phase: i * 0.7 }
  }

  // Moves every booster to its slot.
  private layout(tl: gsap.core.Timeline, at: number, each: number): void {
    const slots = this.slots(this.items.length)
    this.items.forEach((it, i) => {
      const s = slots[i]
      const vars = { duration: 0.7, ease: "power3.out", overwrite: "auto" as const }
      tl.to(it.holder.position, { ...vars, x: s.x, y: s.y, z: s.z }, at + i * each)
        .to(it.holder.rotation, { ...vars, x: 0, y: s.ry, z: 0 }, at + i * each)
        .to(it.holder.scale, { ...vars, x: s.scale, y: s.scale, z: s.scale }, at + i * each)
    })
  }

  // Rows of boosters as big as the screen allows, bent into an arc (the sides lower and further back).
  private slots(n: number): Slot[] {
    const { halfH, halfW } = this.visibleHalf(this.gridZ)
    const cellW = BOOSTER_W * 1.12
    const cellH = BOOSTER_H * 1.1
    const areaW = halfW * 2 * 0.92
    const areaH = halfH * 2 * 0.76 // room for the hint and the buttons
    let cols = 1
    let scale = 0
    for (let c = 1; c <= n; c++) {
      const s = Math.min(areaW / (c * cellW), areaH / (Math.ceil(n / c) * cellH))
      if (s > scale) {
        scale = s
        cols = c
      }
    }
    scale = Math.min(scale, 0.62)
    const rows = Math.ceil(n / cols)
    return Array.from({ length: n }, (_, i) => {
      const row = Math.floor(i / cols)
      const inRow = row === rows - 1 ? n - row * cols : cols
      const x = (i % cols - (inRow - 1) / 2) * cellW * scale
      const bend = x / Math.max(halfW, 1)
      return {
        x,
        y: -halfH * 0.04 + ((rows - 1) / 2 - row) * cellH * scale - bend * bend * 0.4,
        z: -bend * bend * 1.2,
        ry: -bend * 0.35,
        scale,
      }
    })
  }
}

// every material of an object and of its children (a display's body has its walls as children)
function materials(object: THREE.Object3D): THREE.Material[] {
  const list: THREE.Material[] = []
  object.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.material) list.push(...([] as THREE.Material[]).concat(mesh.material))
  })
  return list
}
