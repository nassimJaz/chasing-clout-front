import { ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from "@angular/core"
import { ActivatedRoute } from "@angular/router"
import { concatMap, from, map, Subscription } from "rxjs"
import {
  apiError,
  Card,
  Finish,
  FINISH_LABELS,
  FORMATS,
  PulledCard,
  PurchaseFormat,
  Rarity,
  RARITIES,
  RARITY_COLORS,
  RARITY_LABELS,
  RARITY_LETTERS,
  UserBooster,
  UserCard,
} from "models/game.model"
import { GameService } from "services/game.service"
import type { BoxScene } from "../three/box-scene"

type Phase = "loading" | "closed" | "grid" | "booster" | "all" | "recap"

const FINISH_ORDER: Finish[] = ["FIRE", "HOLO", "NORMAL"]

// Opens a whole purchase (tri-pack or display): the box opens in 3D, its boosters line up,
// each one picked is played by <booster-opening> on top of the paused box. Ends on a sorted recap.
@Component({
  selector: "box-opening",
  templateUrl: "./box-opening.component.html",
  styleUrls: ["./box-opening.component.scss"],
})
export class BoxOpeningComponent implements OnInit, OnDestroy {
  @ViewChild("stage", { static: true }) stage!: ElementRef<HTMLElement>

  phase: Phase = "loading"
  boosters: UserBooster[] = [] // left to open
  format: PurchaseFormat = "SINGLE"
  label = ""
  title = ""
  pulled: PulledCard[] = []
  sorted: PulledCard[] = []
  current?: { booster: UserBooster; cards: PulledCard[] }
  progress = { done: 0, total: 0 }
  error = ""
  empty = false
  flat = false // no WebGL: the boosters are plain buttons
  selected?: { card: Card; owned: UserCard[] }

  rarityLabels = RARITY_LABELS
  rarityLetters = RARITY_LETTERS
  rarityColors = RARITY_COLORS
  finishLabels = FINISH_LABELS

  private scene?: BoxScene
  private sub?: Subscription
  private myCards: UserCard[] = []
  private destroyed = false

  constructor(
    private _route: ActivatedRoute,
    private _game: GameService,
    private _zone: NgZone,
    private _cdr: ChangeDetectorRef,
    private _host: ElementRef<HTMLElement>,
  ) {}

  ngOnInit(): void {
    const purchaseId = Number(this._route.snapshot.paramMap.get("purchaseId"))
    this._game.myBoosters().subscribe({
      next: (all) => {
        this.boosters = all.filter((b) => b.purchaseId === purchaseId)
        if (!this.boosters.length) {
          this.empty = true
          return
        }
        this.format = this.boosters[0].format ?? "SINGLE"
        this.label = FORMATS.find((f) => f.format === this.format)!.label
        this.title = [...new Set(this.boosters.map((b) => b.name))].join(" + ")
        this.startScene()
      },
      error: (err) => (this.error = apiError(err)),
    })
  }

  ngOnDestroy(): void {
    this.destroyed = true
    this.sub?.unsubscribe()
    this.scene?.dispose()
  }

  get hint(): string {
    switch (this.phase) {
      case "loading":
        return "Préparation…"
      case "closed":
        return `Clique pour ouvrir ${this.format === "TRI_PACK" ? "le tri-pack" : "la box"}`
      case "grid":
        return "Choisis un booster"
      case "all":
        return "Ouverture de tous les boosters"
      default:
        return "Ouverture…"
    }
  }

  async onStageClick(): Promise<void> {
    if (this.phase !== "closed" || !this.scene) return
    await this.openBox()
  }

  // A booster picked in the grid: open it (POST), then play it on top of the paused box.
  pick(id: number): void {
    const booster = this.boosters.find((b) => b.id === id)
    if (this.phase !== "grid" || !booster) return
    this.phase = "booster"
    this.error = ""
    this.sub = this._game.open(id).subscribe({
      next: async (cards) => {
        const scene = this.scene
        if (scene) {
          await this._zone.runOutsideAngular(() => scene.removeBooster(id, "zoom"))
          scene.pause()
        }
        if (!this.destroyed) this.current = { booster, cards }
      },
      error: (err) => {
        this.error = apiError(err)
        this.phase = "grid"
      },
    })
  }

  boosterDone(): void {
    if (!this.current) return
    const id = this.current.booster.id
    this.pulled.push(...this.current.cards)
    this.boosters = this.boosters.filter((b) => b.id !== id)
    this.current = undefined
    if (!this.boosters.length) {
      this.recap()
      return
    }
    this.phase = "grid"
    this.scene?.resume()
  }

  // Opens the boosters left one after the other, each one flies out of the grid, then the recap.
  async openAll(): Promise<void> {
    if (this.phase === "closed") await this.openBox()
    if (this.phase !== "grid") return
    this.phase = "all"
    this.error = ""
    this.progress = { done: 0, total: this.boosters.length }
    this.sub = from([...this.boosters])
      .pipe(concatMap((b) => this._game.open(b.id).pipe(map((cards) => ({ b, cards })))))
      .subscribe({
        next: ({ b, cards }) => {
          this.pulled.push(...cards)
          this.boosters = this.boosters.filter((x) => x.id !== b.id)
          this.progress.done++
          this._zone.runOutsideAngular(() => this.scene?.removeBooster(b.id, "fly"))
        },
        complete: () => this.recap(),
        // keep what was opened
        error: (err) => {
          this.error = apiError(err)
          if (this.pulled.length) this.recap()
          else this.phase = "grid"
        },
      })
  }

  async recap(): Promise<void> {
    this.scene?.dispose()
    this.scene = undefined
    this.sorted = [...this.pulled].sort(
      (a, b) =>
        RARITIES.indexOf(b.card.rarity) - RARITIES.indexOf(a.card.rarity) ||
        FINISH_ORDER.indexOf(a.finish) - FINISH_ORDER.indexOf(b.finish),
    )
    this.phase = "recap"
    this._cdr.detectChanges()
    // for the inspection dialog (the quantities and the dates)
    this._game.myCards().subscribe((cards) => (this.myCards = cards))

    // only the first rows are animated, the rest would be off screen anyway
    const slots = Array.from(this._host.nativeElement.querySelectorAll(".recap .slot")).slice(0, 30)
    const { gsap } = await import("gsap")
    this._zone.runOutsideAngular(() =>
      gsap.from(slots, { y: 40, autoAlpha: 0, scale: 0.9, duration: 0.5, ease: "back.out(1.6)", stagger: 0.04 }),
    )
  }

  get rarityCounts(): { rarity: Rarity; count: number }[] {
    return [...RARITIES]
      .reverse()
      .map((rarity) => ({ rarity, count: this.pulled.filter((p) => p.card.rarity === rarity).length }))
      .filter((r) => r.count)
  }

  get finishCounts(): { finish: Finish; count: number }[] {
    return (["FIRE", "HOLO"] as Finish[])
      .map((finish) => ({ finish, count: this.pulled.filter((p) => p.finish === finish).length }))
      .filter((f) => f.count)
  }

  inspect(pulled: PulledCard): void {
    const owned = this.myCards
      .filter((c) => c.card.id === pulled.card.id)
      .sort((a, b) => FINISH_ORDER.indexOf(a.finish) - FINISH_ORDER.indexOf(b.finish))
    this.selected = {
      card: pulled.card,
      owned: owned.length ? owned : [{ card: pulled.card, finish: pulled.finish, quantity: 1, firstObtainedAt: "" }],
    }
  }

  private async openBox(): Promise<void> {
    const scene = this.scene
    if (!scene || scene.busy) return
    await this._zone.runOutsideAngular(() => scene.openBox())
    if (scene === this.scene && this.phase === "closed") this.phase = "grid"
  }

  private async startScene(): Promise<void> {
    try {
      // three and gsap are only downloaded here (lazy chunk)
      const { BoxScene } = await import("../three/box-scene")
      if (this.destroyed) return
      const scene = new BoxScene(this.stage.nativeElement, this.boosters, this.format, this.title)
      scene.onPick = (id) => this._zone.run(() => this.pick(id))
      this.scene = scene
      await this._zone.runOutsideAngular(() => scene.init())
      if (!this.destroyed) this.phase = "closed"
    } catch {
      this.flat = true
      this.phase = "grid"
    }
  }
}
