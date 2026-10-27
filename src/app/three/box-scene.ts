import * as THREE from "three"
import { gsap } from "gsap"
import { PurchaseFormat, UserBooster } from "models/game.model"
import { loadFonts } from "./card-art"
import { boosterColors, boosterMaterial, BOOSTER_H, BOOSTER_W, buildPack, drawBooster, Pack } from "./pack-art"
import { Stage } from "./stage"
import { castShadows } from "./studio"

// A whole purchase in 3D: the closed pack (booster, tri-pack or display box) floats; once open,
// its boosters line up in arched rows and the one picked with the mouse is sent to the component.

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
  private geometry = new THREE.PlaneGeometry(BOOSTER_W, BOOSTER_H)
  private raycaster = new THREE.Raycaster()
  private hovered?: Item
  private interactive = false
  private opening = false
  private opened = false
  private gridZ = 10
  private closedZ = 10

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
    // the closed pack in studio light, standing on its shadow
    castShadows(this.pack.group)
    this.studio().place(-this.pack.size.h / 2 - 0.02, this.pack.size)
    if (this.isBox) {
      // hidden inside the box, they come out of its top when it opens
      const textures = new Map<string, THREE.Texture>()
      const k = (this.pack.size.h * 0.7) / BOOSTER_H
      this.boosters.forEach((b, i) => {
        if (!textures.has(b.code)) textures.set(b.code, this.texture(drawBooster(b.name, boosterColors(b.code))))
        const material = boosterMaterial(textures.get(b.code)!)
        const mesh = new THREE.Mesh(this.geometry, material)
        const holder = new THREE.Group()
        holder.add(mesh)
        holder.position.set(gsap.utils.random(-0.3, 0.3) * this.pack.size.w, 0, gsap.utils.random(-0.3, 0.3) * this.pack.size.d)
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

    this.listen("click", () => {
      if (this.interactive && !this.busy && this.hovered) this.onPick?.(this.hovered.id)
    })
    this.start()
  }

  // Display: the lid flies off and the boosters come out of the box. Tri-pack: the band slides off.
  async openBox(): Promise<void> {
    if (this.opened || this.busy || this.disposed) return
    this.busy = true
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
  }

  protected override onResize(): void {
    this.gridZ = Math.min(16, 10 * Math.max(1, 0.75 / this.camera.aspect))
    if (this.pack) {
      // the closed pack takes about two thirds of the screen
      const { w, h, d } = this.pack.size
      const fit = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
      this.closedZ = Math.max((h * 1.6) / fit, (w * 1.4) / fit / this.camera.aspect) + d / 2
    }
    if (this.opened) {
      this.camera.position.z = this.gridZ
      this.layout(this.timeline(), 0, 0)
    } else if (!this.opening) {
      this.camera.position.set(0, 0, this.closedZ)
    }
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

function materials(mesh: THREE.Mesh): THREE.Material[] {
  return ([] as THREE.Material[]).concat(mesh.material)
}
