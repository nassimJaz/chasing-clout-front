import * as THREE from "three"
import { PurchaseFormat } from "models/game.model"
import { Kit, loadFonts } from "./card-art"
import { buildPack, PackBooster } from "./pack-art"
import { castShadows, studio } from "./studio"

// Pictures of the real packs for the inventory: each model is rendered once, offscreen, under the studio
// lighting, into a transparent PNG (cached for the session) instead of one live 3D scene per tile.
// One shared renderer, freed as soon as no picture is waiting.

const W = 480
const H = 400
const cache = new Map<string, Promise<string>>()
let renderer: THREE.WebGLRenderer | undefined
let pending = 0

// boosters: what the pack holds (their types give the colors). Rejects without WebGL.
export function packThumb(format: PurchaseFormat, boosters: PackBooster[], title: string): Promise<string> {
  const codes = [...new Set(boosters.map((b) => b.code))].join("+")
  const key = `${format}:${codes}:${Math.min(boosters.length, 3)}`
  let picture = cache.get(key)
  if (!picture) {
    picture = render(format, boosters, title)
    picture.catch(() => cache.delete(key))
    cache.set(key, picture)
  }
  return picture
}

async function render(format: PurchaseFormat, boosters: PackBooster[], title: string): Promise<string> {
  await loadFonts()
  pending++
  const textures: THREE.Texture[] = []
  const scene = new THREE.Scene()
  try {
    renderer ??= new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(1)
    renderer.setSize(W, H, false)

    scene.add(new THREE.AmbientLight("#ffffff", 1.6))
    const key = new THREE.DirectionalLight("#ffffff", 1.8)
    key.position.set(2, 3, 6)
    scene.add(key)
    const lights = studio(renderer, scene, key)

    const kit: Kit = {
      texture: (canvas) => {
        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        textures.push(texture)
        return texture
      },
      uTime: { value: 0 },
      spark: new THREE.Texture(), // no particles here
    }
    const pack = buildPack(kit, format, boosters, title)
    castShadows(pack.group)
    // displays a little from above and the side, like in the box scene
    if (pack.body) pack.group.rotation.set(0.25, -0.5, 0)
    scene.add(pack.group)
    const { w, h, d } = pack.size
    lights.place(-h / 2 - 0.05, pack.size)

    const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 200)
    const fov = 2 * Math.tan(THREE.MathUtils.degToRad(15))
    camera.position.set(0, h * 0.12, Math.max((h * 1.25) / fov, (w * 1.25) / fov / camera.aspect) + d)
    camera.lookAt(0, -h * 0.03, 0)
    renderer.render(scene, camera)
    const url = renderer.domElement.toDataURL("image/png")

    lights.dispose()
    return url
  } finally {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      ;([] as THREE.Material[]).concat(mesh.material ?? []).forEach((m) => m.dispose())
    })
    textures.forEach((t) => t.dispose())
    pending--
    if (!pending) {
      setTimeout(() => {
        if (pending || !renderer) return
        renderer.dispose()
        renderer.forceContextLoss()
        renderer = undefined
      })
    }
  }
}
