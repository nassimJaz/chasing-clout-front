import * as THREE from "three"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"

// Product-photo lighting for the packs: a soft room reflected by the foils and the cardboard
// (no HDR file to download), filmic tone mapping, and the key light casting a soft shadow on an
// invisible floor. The cards opt out (toneMapped false, envMapIntensity 0) so they look as before.
export interface Studio {
  floor: THREE.Mesh
  // Puts the floor under a product of this size (its bottom at y) and fits the shadow camera.
  place(y: number, size: { w: number; h: number; d: number }): void
  dispose(): void
}

export function studio(renderer: THREE.WebGLRenderer, scene: THREE.Scene, key: THREE.DirectionalLight): Studio {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const env = pmrem.fromScene(room, 0.04)
  room.dispose()
  pmrem.dispose()
  scene.environment = env.texture

  renderer.toneMapping = THREE.ACESFilmicToneMapping
  // the scenes keep their bright ambient for the cards (not tone mapped): the products are exposed down
  renderer.toneMappingExposure = 0.6
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.bias = -0.0005
  key.shadow.normalBias = 0.02
  key.shadow.radius = 4

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.35 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor, key.target)

  return {
    floor,
    place(y, size) {
      floor.position.y = y
      const r = Math.max(size.w, size.h, size.d) * 1.2
      const cam = key.shadow.camera
      cam.left = -r
      cam.right = r
      cam.top = r
      cam.bottom = -r
      cam.near = 0.5
      cam.far = 60
      cam.updateProjectionMatrix()
    },
    dispose() {
      env.dispose()
    },
  }
}

// Every mesh of a product casts its shadow on the floor, except the clear films.
export function castShadows(object: THREE.Object3D): void {
  object.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) mesh.castShadow = !mesh.userData["film"]
  })
}
