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
import { Card, Finish, FINISH_LABELS, RARITY_COLORS, RARITY_LABELS, UserCard } from "models/game.model"
import type { CardViewer } from "../three/card-viewer"

// A full-screen dialog showing one card in 3D (drag to turn it), with the finishes owned.
// Closes with Escape, the backdrop or the cross. Without WebGL it shows a big <meme-card> instead.
@Component({
  selector: "card-inspect",
  templateUrl: "./card-inspect.component.html",
  styleUrls: ["./card-inspect.component.scss"],
})
export class CardInspectComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input({ required: true }) card!: Card
  @Input() owned: UserCard[] = []
  @Output() closed = new EventEmitter<void>()

  @ViewChild("stage", { static: true }) stage!: ElementRef<HTMLElement>
  @ViewChild("dialog", { static: true }) dialog!: ElementRef<HTMLElement>

  finish: Finish = "NORMAL"
  fallback = false
  rarityLabels = RARITY_LABELS
  rarityColors = RARITY_COLORS
  finishLabels = FINISH_LABELS

  private viewer?: CardViewer
  private destroyed = false
  private opener?: Element | null

  constructor(private _zone: NgZone) {}

  ngOnInit(): void {
    this.finish = this.owned[0]?.finish ?? "NORMAL"
    this.opener = document.activeElement
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
