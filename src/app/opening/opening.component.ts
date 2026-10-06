import { ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from "@angular/core"
import { ActivatedRoute } from "@angular/router"
import { Subscription, switchMap } from "rxjs"
import { apiError, FINISH_LABELS, PulledCard, UserBooster } from "models/game.model"
import { GameService } from "services/game.service"
import type { BoosterScene } from "./booster-scene"

type Phase = "loading" | "pack" | "stack" | "recap"

// Opens the booster of the URL (POST), plays it in 3D (pack torn open, cards flipped one by one), then shows a recap.
@Component({
  selector: "opening",
  templateUrl: "./opening.component.html",
  styleUrls: ["./opening.component.scss"],
})
export class OpeningComponent implements OnInit, OnDestroy {
  @ViewChild("stage", { static: true }) stage!: ElementRef<HTMLElement>

  phase: Phase = "loading"
  cards: PulledCard[] = []
  index = 0 // cards revealed so far
  next?: UserBooster
  error = ""
  finishLabels = FINISH_LABELS

  private scene?: BoosterScene
  private sub?: Subscription
  private run = 0 // bumped on each opening, so a late answer of the previous one is ignored

  constructor(
    private _route: ActivatedRoute,
    private _game: GameService,
    private _zone: NgZone,
    private _cdr: ChangeDetectorRef,
    private _host: ElementRef<HTMLElement>,
  ) {}

  ngOnInit(): void {
    // the component is reused when going to the next booster, so follow the URL
    this._route.paramMap.subscribe((params) => this.open(Number(params.get("id"))))
  }

  ngOnDestroy(): void {
    this.run++
    this.sub?.unsubscribe()
    this.scene?.dispose()
  }

  get hint(): string {
    if (this.phase === "pack") return "Clique pour déchirer le booster"
    if (this.index < this.cards.length) return `Clique pour retourner (${this.index + 1}/${this.cards.length})`
    return "Clique pour voir le récap"
  }

  async onStageClick(): Promise<void> {
    const scene = this.scene
    if (!scene || scene.busy) return
    if (this.phase === "pack") {
      await this._zone.runOutsideAngular(() => scene.tearOpen())
      if (scene === this.scene) this.phase = "stack"
    } else if (this.phase === "stack") {
      await this._zone.runOutsideAngular(() => scene.revealNext())
      if (scene !== this.scene) return
      this.index = scene.revealed
      if (scene.done) this.recap()
    }
  }

  // Also the "Passer" button: every card is shown face up in the recap.
  async recap(): Promise<void> {
    this.scene?.dispose()
    this.scene = undefined
    this.index = this.cards.length
    this.phase = "recap"
    this._cdr.detectChanges()
    const slots = this._host.nativeElement.querySelectorAll(".recap .slot")
    const { gsap } = await import("gsap")
    this._zone.runOutsideAngular(() =>
      gsap.from(slots, { y: 40, autoAlpha: 0, scale: 0.9, duration: 0.5, ease: "back.out(1.6)", stagger: 0.07 }),
    )
  }

  private open(id: number): void {
    const run = ++this.run
    this.sub?.unsubscribe()
    this.scene?.dispose()
    this.scene = undefined
    this.phase = "loading"
    this.cards = []
    this.index = 0
    this.next = undefined
    this.error = ""
    let booster: UserBooster | undefined
    this.sub = this._game
      .myBoosters()
      .pipe(
        switchMap((boosters) => {
          booster = boosters.find((b) => b.id === id)
          this.next = boosters.find((b) => b.id !== id)
          return this._game.open(id)
        }),
      )
      .subscribe({
        next: (cards) => this.start(run, cards, booster),
        error: (err) => (this.error = apiError(err)),
      })
  }

  private async start(run: number, cards: PulledCard[], booster?: UserBooster): Promise<void> {
    this.cards = cards
    try {
      // three and gsap are only downloaded here (lazy chunk)
      const { BoosterScene } = await import("./booster-scene")
      if (run !== this.run) return
      const scene = new BoosterScene(this.stage.nativeElement, cards, booster?.name ?? "Booster", booster?.code ?? "")
      this.scene = scene
      await this._zone.runOutsideAngular(() => scene.init())
      if (run === this.run) this.phase = "pack"
    } catch {
      // no WebGL: straight to the cards
      if (run === this.run) this.recap()
    }
  }
}
