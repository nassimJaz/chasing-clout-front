import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  ViewChild,
} from "@angular/core"
import { PulledCard } from "models/game.model"
import type { BoosterScene } from "../three/booster-scene"

type Phase = "loading" | "pack" | "stack"

// Plays one opened booster in 3D: the pack is torn open, then the cards are flipped one by one.
// Emits done at the end, or right away with "Passer" or without WebGL. Fills its parent.
@Component({
  selector: "booster-opening",
  templateUrl: "./booster-opening.component.html",
  styleUrls: ["./booster-opening.component.scss"],
})
export class BoosterOpeningComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) cards!: PulledCard[]
  @Input() booster?: { name: string; code: string }
  @Input() skipPack = false
  @Output() done = new EventEmitter<void>()

  @ViewChild("stage", { static: true }) stage!: ElementRef<HTMLElement>

  phase: Phase = "loading"
  index = 0 // cards revealed so far

  private scene?: BoosterScene
  private run = 0 // bumped on each start, so a late init of the previous scene is ignored

  constructor(private _zone: NgZone) {}

  ngOnChanges(): void {
    this.start()
  }

  ngOnDestroy(): void {
    this.stop()
  }

  get hint(): string {
    if (this.phase === "pack") return "Clique pour déchirer le booster"
    if (this.index < this.cards.length) return `Clique pour retourner (${this.index + 1}/${this.cards.length})`
    return "Clique pour continuer"
  }

  async onClick(): Promise<void> {
    const scene = this.scene
    if (!scene || scene.busy) return
    if (this.phase === "pack") {
      await this._zone.runOutsideAngular(() => scene.tearOpen())
      if (scene === this.scene) this.phase = "stack"
    } else if (this.phase === "stack") {
      await this._zone.runOutsideAngular(() => scene.revealNext())
      if (scene !== this.scene) return
      this.index = scene.revealed
      if (scene.done) this.finish()
    }
  }

  finish(): void {
    this.stop()
    this.done.emit()
  }

  private stop(): void {
    this.run++
    this.scene?.dispose()
    this.scene = undefined
  }

  private async start(): Promise<void> {
    this.stop()
    const run = this.run
    this.phase = "loading"
    this.index = 0
    try {
      // three and gsap are only downloaded here (lazy chunk)
      const { BoosterScene } = await import("../three/booster-scene")
      if (run !== this.run) return
      const scene = new BoosterScene(this.stage.nativeElement, this.cards, this.booster?.name ?? "Booster", this.booster?.code ?? "", {
        skipPack: this.skipPack,
      })
      this.scene = scene
      await this._zone.runOutsideAngular(() => scene.init())
      if (run === this.run) this.phase = this.skipPack ? "stack" : "pack"
    } catch {
      // no WebGL: straight to the cards
      if (run === this.run) this.finish()
    }
  }
}
