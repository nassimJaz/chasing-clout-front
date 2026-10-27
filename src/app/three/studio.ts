import * as THREE from "three"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"

// Product-photo lighting for the packs: a soft room reflected by the foils and the cardboard
// (no HDR file to download), filmic tone mapping, and a soft contact shadow baked into a plane
// centered under the product. The cards opt out (toneMapped false, envMapIntensity 0) so they look as before.
export interface Studio {
  floor: THREE.Mesh // the contact shadow
  // Puts the contact shadow under a product of this size, its bottom at y.
  place(y: number, size: { w: number; h: number; d: number }): void
  dispose(): void
}

export function studio(renderer: THREE.WebGLRenderer, scene: THREE.Scene): Studio {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const env = pmrem.fromScene(room, 0.04)
  room.dispose()
  pmrem.dispose()
  scene.environment = env.texture

  renderer.toneMapping = THREE.ACESFilmicToneMapping
  // the scenes keep their bright ambient for the cards (not tone mapped): the products are exposed down
  renderer.toneMappingExposure = 0.6

  const shadow = new THREE.CanvasTexture(contactShadow())
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadow, transparent: true, depthWrite: false, toneMapped: false }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.renderOrder = -1
  scene.add(floor)

  return {
    floor,
    place(y, size) {
      floor.position.y = y
      // wider than the product, deep enough to read even for a flat pack
      floor.scale.set(size.w * 1.35, Math.max(size.d * 1.6, size.w * 0.45), 1)
    },
    dispose() {
      env.dispose()
      shadow.dispose()
    },
  }
}

// A soft dark ellipse fading out: the shadow where a product touches (or nearly touches) the floor.
function contactShadow(): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext("2d")!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, "rgba(0, 0, 0, 0.6)")
  g.addColorStop(0.45, "rgba(0, 0, 0, 0.35)")
  g.addColorStop(1, "rgba(0, 0, 0, 0)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return canvas
}
