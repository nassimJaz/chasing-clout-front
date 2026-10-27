import * as THREE from "three"
import { gsap } from "gsap"
import { drawSpark, Kit } from "./card-art"
import { studio, Studio } from "./studio"

// What every 3D scene of the app shares: renderer, camera, lights, render loop, resize, mouse, cleanup.
// Only ever imported with import(), like the scenes built on it, so three and gsap stay in a lazy chunk.
export abstract class Stage {
  protected renderer!: THREE.WebGLRenderer
  protected scene = new THREE.Scene()
  protected camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)
  protected mouse = new THREE.Vector2() // -1..1, y up
  protected uTime = { value: 0 }
  protected disposed = false
  protected lights?: Studio // studio lighting, for the scenes showing products

  private textures: THREE.Texture[] = []
  private timelines = new Set<gsap.core.Timeline>()
  private listeners: [string, EventListener][] = []
  private observer?: ResizeObserver
  private raf = 0
  private last = 0
  private running = false
  private held = false // paused by the scene's owner, not only because the tab is hidden
  private _spark?: THREE.Texture

  constructor(protected container: HTMLElement) {}

  // Called each frame with the time and the time since the last frame, in seconds.
  protected abstract update(t: number, dt: number): void

  // Called when the container changes size, the camera aspect is already updated.
  protected onResize(): void {}

  // Throws when WebGL is not available.
  protected setup(): void {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.container.appendChild(this.renderer.domElement)
    this.scene.add(new THREE.AmbientLight("#ffffff", 1.6))
    const sun = new THREE.DirectionalLight("#ffffff", 1.8)
    sun.position.set(2, 3, 6)
    this.scene.add(sun)
  }

  // Opt-in product lighting (see studio.ts), after setup().
  protected studio(): Studio {
    return (this.lights ??= studio(this.renderer, this.scene))
  }

  // Once the scene is built: follow the container size and the mouse, start the render loop.
  protected start(): void {
    this.resize()
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(this.container)
    this.listen("pointermove", (e) => {
      const rect = this.canvas.getBoundingClientRect()
      const p = e as PointerEvent
      this.mouse.set(((p.clientX - rect.left) / rect.width) * 2 - 1, -((p.clientY - rect.top) / rect.height) * 2 + 1)
    })
    this.listen("pointerleave", () => this.mouse.set(0, 0))
    document.addEventListener("visibilitychange", this.onVisibility)
    this.resume()
  }

  // Stops rendering (the context is kept), for instance while another scene is shown on top.
  pause(): void {
    this.held = true
    this.stop()
  }

  resume(): void {
    this.held = false
    if (!document.hidden) this.run()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.pause()
    document.removeEventListener("visibilitychange", this.onVisibility)
    this.timelines.forEach((tl) => tl.kill())
    this.observer?.disconnect()
    if (!this.renderer) return
    this.listeners.forEach(([type, fn]) => this.canvas.removeEventListener(type, fn))
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      const materials = mesh.material ? ([] as THREE.Material[]).concat(mesh.material) : []
      materials.forEach((m) => m.dispose())
    })
    this.textures.forEach((t) => t.dispose())
    this.lights?.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.canvas.remove()
  }

  protected get canvas(): HTMLCanvasElement {
    return this.renderer.domElement
  }

  protected get kit(): Kit {
    return { texture: (c) => this.texture(c), uTime: this.uTime, spark: this.spark }
  }

  protected get spark(): THREE.Texture {
    return (this._spark ??= this.texture(drawSpark()))
  }

  protected listen(type: string, fn: EventListener): void {
    this.canvas.addEventListener(type, fn)
    this.listeners.push([type, fn])
  }

  // A timeline killed on dispose.
  protected timeline(vars: gsap.TimelineVars = {}): gsap.core.Timeline {
    const tl = gsap.timeline({ ...vars, onComplete: () => this.timelines.delete(tl) })
    this.timelines.add(tl)
    return tl
  }

  // A texture disposed on dispose.
  protected texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    this.textures.push(texture)
    return texture
  }

  // Removes an object and frees what it owns. Its textures are freed on dispose, or now with withTextures
  // (only when nothing else uses them, e.g. a pack replaced by another one).
  protected remove(object: THREE.Object3D, keepGeometry = false, withTextures = false): void {
    object.removeFromParent()
    object.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!keepGeometry) mesh.geometry?.dispose()
      const materials = mesh.material ? ([] as THREE.Material[]).concat(mesh.material) : []
      materials.forEach((m) => {
        if (withTextures) {
          const maps = Object.values(m).filter((v): v is THREE.Texture => v instanceof THREE.Texture)
          maps.forEach((t) => t.dispose())
          this.textures = this.textures.filter((t) => !maps.includes(t))
        }
        m.dispose()
      })
    })
  }

  // Half of the visible height and width at a given distance from the camera.
  protected visibleHalf(distance: number): { halfH: number; halfW: number } {
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * distance
    return { halfH, halfW: halfH * this.camera.aspect }
  }

  // Lerps an object's rotation toward the mouse, with a slow idle sway.
  protected tilt(object: THREE.Object3D, t: number, strength = 1, base = { x: 0, y: 0 }): void {
    const rx = base.x + (-this.mouse.y * 0.25 + Math.sin(t * 1.3) * 0.04) * strength
    const ry = base.y + (this.mouse.x * 0.35 + Math.sin(t * 0.9) * 0.08) * strength
    object.rotation.x += (rx - object.rotation.x) * 0.08
    object.rotation.y += (ry - object.rotation.y) * 0.08
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container
    if (!w || !h) return
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.onResize()
    this.camera.updateProjectionMatrix()
  }

  private run(): void {
    if (this.running || this.disposed || !this.renderer) return
    this.running = true
    this.last = performance.now() / 1000
    this.raf = requestAnimationFrame(this.loop)
  }

  private stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  // no rendering in a hidden tab
  private onVisibility = (): void => {
    if (document.hidden) this.stop()
    else if (!this.held) this.run()
  }

  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop)
    const t = now / 1000
    const dt = Math.min(0.05, Math.max(0, t - this.last))
    this.last = t
    this.uTime.value = t
    this.update(t, dt)
    this.renderer.render(this.scene, this.camera)
  }
}
