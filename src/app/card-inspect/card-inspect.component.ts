import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from "@angular/core"
import { Observable } from "rxjs"
import { apiError, Card, CardPrice, Finish, FINISHES, FINISH_LABELS, RARITY_COLORS, RARITY_LABELS, UserCard } from "models/game.model"
import { GameService } from "services/game.service"
import type { CardViewer } from "../three/card-viewer"

// A full-screen dialog showing one card in 3D (drag to turn it), with the finishes owned.
// In "collection" mode it also buys the card from the system and puts owned finishes on sale (emits changed).
// Closes with Escape, the backdrop or the cross. Without WebGL it shows a big <meme-card> instead.
@Component({
  selector: "card-inspect",
  templateUrl: "./card-inspect.component.html",
  styleUrls: ["./card-inspect.component.scss"],
})
export class CardInspectComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input({ required: true }) card!: Card
  @Input() owned: UserCard[] = []
  @Input() mode: "collection" | "view" = "view"
  @Input() startFinish?: Finish // shown first, otherwise the best one owned
  @Output() closed = new EventEmitter<void>()
  @Output() changed = new EventEmitter<void>()

  @ViewChild("stage", { static: true }) stage!: ElementRef<HTMLElement>
  @ViewChild("dialog", { static: true }) dialog!: ElementRef<HTMLElement>

  finish: Finish = "NORMAL"
  fallback = false
  rarityLabels = RARITY_LABELS
  rarityColors = RARITY_COLORS
  finishLabels = FINISH_LABELS
  finishes = FINISHES

  // collection mode
  prices: Partial<Record<Finish, number>> = {}
  sellPrice: Partial<Record<Finish, number>> = {}
  busy = false
  message = ""
  error = ""

  private viewer?: CardViewer
  private destroyed = false
  private opener?: Element | null

  constructor(private _zone: NgZone, private _game: GameService) {}

  ngOnInit(): void {
    this.finish = this.startFinish ?? this.owned[0]?.finish ?? "NORMAL"
    this.opener = document.activeElement
    if (this.mode === "collection") {
      this._game.prices(this.card.id).subscribe({
        next: (prices: CardPrice[]) =>
          prices.forEach((p) => {
            this.prices[p.finish] = p.price
            this.sellPrice[p.finish] ??= p.price
          }),
        error: (err) => (this.error = apiError(err)),
      })
    }
  }

  async ngAfterViewInit(): Promise<void> {
    this.dialog.nativeElement.querySelector<HTMLElement>(".close")?.focus()
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches
    try {
      const { CardViewer } = await import("../three/card-viewer")
      if (this.destroyed) return
      const viewer = new CardViewer(this.stage.nativeElement, this.card, this.finish, reducedMotion)
      this.viewer = viewer
      await this._zone.runOutsideAngular(() => viewer.init())
    } catch {
      this.fallback = true
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true
    this.viewer?.dispose()
    // give the focus back to the card that opened the dialog
    if (this.opener instanceof HTMLElement) this.opener.focus()
  }

  quantity(finish: Finish): number {
    return this.owned.find((o) => o.finish === finish)?.quantity ?? 0
  }

  buy(finish: Finish): void {
    this.act(this._game.buyFromSystem(this.card.id, finish), `${this.finishLabels[finish]} achetée`, finish)
  }

  // The card leaves the collection while it is on sale.
  sell(finish: Finish): void {
    const price = Math.round(this.sellPrice[finish] ?? 0)
    this.act(this._game.createListing(this.card.id, finish, price), `Mise en vente à ${price} memes`, finish)
  }

  private act(call: Observable<unknown>, success: string, finish: Finish): void {
    this.busy = true
    this.message = ""
    this.error = ""
    call.subscribe({
      next: () => {
        this.busy = false
        this.message = success
        this.select(finish)
        this.changed.emit()
      },
      error: (err) => {
        this.busy = false
        this.error = apiError(err)
      },
    })
  }

  get selected(): UserCard | undefined {
    return this.owned.find((o) => o.finish === this.finish)
  }

  // "12 mars 2026"
  get obtained(): string {
    const date = this.selected?.firstObtainedAt
    return date ? new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : ""
  }

  select(finish: Finish): void {
    this.finish = finish
    this._zone.runOutsideAngular(() => this.viewer?.setFinish(finish))
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit()
  }

  @HostListener("document:keydown", ["$event"])
  onKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      this.closed.emit()
    } else if (event.key === "Tab") {
      // keep the focus inside the dialog
      const focusable = Array.from(this.dialog.nativeElement.querySelectorAll<HTMLElement>("button, [href]"))
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !this.dialog.nativeElement.contains(active))) {
        last?.focus()
        event.preventDefault()
      } else if (!event.shiftKey && active === last) {
        first?.focus()
        event.preventDefault()
      }
    }
  }
}
