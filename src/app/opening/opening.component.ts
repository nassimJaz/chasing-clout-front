import { ChangeDetectorRef, Component, ElementRef, NgZone, OnInit } from "@angular/core"
import { ActivatedRoute } from "@angular/router"
import { Subscription, switchMap } from "rxjs"
import { apiError, FINISH_LABELS, PulledCard, UserBooster } from "models/game.model"
import { GameService } from "services/game.service"

type Phase = "loading" | "playing" | "recap"

// Opens the booster of the URL (POST), plays it in 3D (<booster-opening>), then shows a recap.
@Component({
  selector: "opening",
  templateUrl: "./opening.component.html",
  styleUrls: ["./opening.component.scss"],
})
export class OpeningComponent implements OnInit {
  phase: Phase = "loading"
  cards: PulledCard[] = []
  booster?: UserBooster
  next?: UserBooster
  error = ""
  finishLabels = FINISH_LABELS

  private sub?: Subscription

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

  async recap(): Promise<void> {
    this.phase = "recap"
    this._cdr.detectChanges()
    const slots = this._host.nativeElement.querySelectorAll(".recap .slot")
    const { gsap } = await import("gsap")
    this._zone.runOutsideAngular(() =>
      gsap.from(slots, { y: 40, autoAlpha: 0, scale: 0.9, duration: 0.5, ease: "back.out(1.6)", stagger: 0.07 }),
    )
  }

  private open(id: number): void {
    this.sub?.unsubscribe()
    this.phase = "loading"
    this.cards = []
    this.booster = undefined
    this.next = undefined
    this.error = ""
    this.sub = this._game
      .myBoosters()
      .pipe(
        switchMap((boosters) => {
          this.booster = boosters.find((b) => b.id === id)
          this.next = boosters.find((b) => b.id !== id)
          return this._game.open(id)
        }),
      )
      .subscribe({
        next: (cards) => {
          this.cards = cards
          this.phase = "playing"
        },
        error: (err) => (this.error = apiError(err)),
      })
  }
}
