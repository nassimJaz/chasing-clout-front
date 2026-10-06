import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild } from "@angular/core"
import { ActivatedRoute, Router } from "@angular/router"
import {
  apiError,
  BoosterSlot,
  BoosterType,
  Card,
  Finish,
  FORMATS,
  Purchase,
  PurchaseFormat,
  Rarity,
  RARITIES,
  RARITY_COLORS,
  RARITY_LABELS,
} from "models/game.model"
import { GameService } from "services/game.service"
import type { ShopScene } from "../three/shop-scene"

interface Tile {
  format: PurchaseFormat
  label: string
  count: number
  total: number
  perBooster: number
  saving: number // % saved against buying them one by one
  mixable: boolean
}

// The shop: a 3D window of the pack being configured (type, format, mixed display), the buy button,
// and a strip of the rarest cards to win.
@Component({
  selector: "shop",
  templateUrl: "./shop.component.html",
  styleUrls: ["./shop.component.scss"],
})
export class ShopComponent implements AfterViewInit, OnDestroy {
  @ViewChild("stage", { static: true }) stage!: ElementRef<HTMLElement>
  @ViewChild("strip", { static: true }) strip!: ElementRef<HTMLElement>

  boosters: BoosterType[] = this._route.snapshot.data["boosters"]
  rarities = RARITIES
  rarityLabels = RARITY_LABELS
  rarityColors = RARITY_COLORS

  boosterId = this.boosters[0]?.id
  format: PurchaseFormat = "SINGLE"
  mixed = false
  secondBoosterId = this.boosters[1]?.id ?? this.boosters[0]?.id
  buying = false
  purchase?: Purchase // the last one, for "Ouvrir maintenant"
  error = ""
  flat = false // no WebGL: a CSS pack instead of the 3D window
  // the rarest cards, 10 at random
  prizes: Card[] = this.pickPrizes(this._route.snapshot.data["cards"] ?? [])
  inspected?: { card: Card; finish: Finish }

  private scene?: ShopScene
  private stripTween?: { pause(): void; resume(): void; kill(): void }
  private destroyed = false
  private reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches

  constructor(
    private _route: ActivatedRoute,
    private _router: Router,
    private _zone: NgZone,
    public game: GameService,
  ) {}

  async ngAfterViewInit(): Promise<void> {
    this.startStrip()
    try {
      // three and gsap are only downloaded here (lazy chunk)
      const { ShopScene } = await import("../three/shop-scene")
      if (this.destroyed || !this.type) return
      const scene = new ShopScene(this.stage.nativeElement, this.reducedMotion)
      this.scene = scene
      await this._zone.runOutsideAngular(() => scene.init(this.type, this.format, this.second))
    } catch {
      this.flat = true
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true
    this.scene?.dispose()
    this.stripTween?.kill()
  }

  get type(): BoosterType {
    return this.find(this.boosterId)
  }

  // the other half of a mixed display, when it applies
  get second(): BoosterType | undefined {
    return this.mixed && this.mixable ? this.find(this.secondBoosterId) : undefined
  }

  get mixable(): boolean {
    return FORMATS.find((f) => f.format === this.format)!.mixable
  }

  // Same rule as the API: a mixed display costs half of each full display.
  get price(): number {
    const first = this.type.prices[this.format]
    const second = this.second
    return second ? (first + second.prices[this.format]) / 2 : first
  }

  get tiles(): Tile[] {
    const unit = this.type.price
    return FORMATS.map((f) => {
      const total = this.type.prices[f.format]
      return {
        format: f.format,
        label: f.label,
        count: f.count,
        total,
        perBooster: total / f.count,
        saving: Math.round(100 * (1 - total / (unit * f.count))),
        mixable: f.mixable,
      }
    })
  }

  // the cheapest price per booster (the biggest format on a tie)
  get best(): PurchaseFormat {
    return this.tiles.reduce((a, b) => (b.perBooster <= a.perBooster ? b : a)).format
  }

  // Each slot's odds as segments of one bar.
  odds(slot: BoosterSlot): { rarity: Rarity; percent: number }[] {
    const entries = Object.entries(slot.weights) as [Rarity, number][]
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
    return entries.map(([rarity, weight]) => ({ rarity, percent: (100 * weight) / total }))
  }

  selectType(id: number): void {
    if (id === this.boosterId) return
    this.boosterId = id
    if (this.secondBoosterId === id) this.secondBoosterId = this.boosters.find((b) => b.id !== id)?.id ?? id
    this.refresh()
  }

  selectFormat(format: PurchaseFormat): void {
    if (format === this.format) return
    this.format = format
    this.refresh()
  }

  setMixed(mixed: boolean): void {
    this.mixed = mixed
    this.refresh()
  }

  selectSecond(id: number): void {
    this.secondBoosterId = id
    this.refresh()
  }

  // foil and tilt of a booster type card follow the pointer
  foil(event: PointerEvent): void {
    const el = event.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    el.style.setProperty("--x", ((event.clientX - rect.left) / rect.width).toFixed(3))
    el.style.setProperty("--y", ((event.clientY - rect.top) / rect.height).toFixed(3))
  }

  buy(): void {
    this.purchase = undefined
    this.error = ""
    this.buying = true
    const second = this.second?.id ?? null
    this.game.buy(this.format, this.boosterId, second).subscribe({
      next: (purchase) => {
        this.buying = false
        this.purchase = purchase
        this.celebrate()
      },
      error: (err) => {
        this.buying = false
        this.error = apiError(err)
      },
    })
  }

  // The purchase does not return the boosters: find them by purchaseId.
  openNow(): void {
    const purchase = this.purchase
    if (!purchase) return
    this.game.myBoosters().subscribe({
      next: (boosters) => {
        const mine = boosters.filter((b) => b.purchaseId === purchase.id)
        if (!mine.length) this._router.navigate(["/inventaire"])
        else if (purchase.format === "SINGLE") this._router.navigate(["/ouverture", mine[0].id])
        else this._router.navigate(["/ouverture/box", purchase.id])
      },
      error: (err) => (this.error = apiError(err)),
    })
  }

  inspect(card: Card, i: number): void {
    this.inspected = { card, finish: this.prizeFinish(i) }
  }

  prizeFinish(i: number): Finish {
    return i % 3 === 0 ? "FIRE" : "HOLO"
  }

  pauseStrip(paused: boolean): void {
    if (paused) this.stripTween?.pause()
    else this.stripTween?.resume()
  }

  private refresh(): void {
    this.purchase = undefined
    this._zone.runOutsideAngular(() => this.scene?.show(this.type, this.format, this.second))
  }

  // The pack jumps in the window, then a copy of it flies to the "Inventaire" link, which bounces.
  private async celebrate(): Promise<void> {
    const { gsap } = await import("gsap")
    this._zone.runOutsideAngular(() => {
      this.scene?.celebrate()
      const target = document.querySelector<HTMLElement>('nav a[href$="/inventaire"]')
      if (!target) return
      const from = this.stage.nativeElement.getBoundingClientRect()
      const to = target.getBoundingClientRect()
      const pack = document.createElement("div")
      pack.className = `booster-${this.type.code}`
      Object.assign(pack.style, {
        position: "fixed",
        left: `${from.left + from.width / 2 - 30}px`,
        top: `${from.top + from.height / 2 - 40}px`,
        width: "60px",
        height: "80px",
        borderRadius: "6px",
        boxShadow: "0 6px 16px #0006",
        zIndex: "2000",
        pointerEvents: "none",
      })
      document.body.appendChild(pack)
      const dx = to.left + to.width / 2 - (from.left + from.width / 2)
      const dy = to.top + to.height / 2 - (from.top + from.height / 2)
      gsap
        .timeline({ onComplete: () => pack.remove() })
        .from(pack, { scale: 0, duration: 0.3, ease: "back.out(2)" }, this.reducedMotion ? 0 : 0.5)
        .to(pack, { x: dx, y: dy, scale: 0.25, rotation: 20, duration: this.reducedMotion ? 0.3 : 0.8, ease: "power2.in" })
        .to(pack, { autoAlpha: 0, duration: 0.15 })
        .fromTo(target, { scale: 1 }, { scale: 1.25, duration: 0.15, yoyo: true, repeat: 1, ease: "power2.out" }, "<")
    })
  }

  // The prize strip scrolls slowly back and forth (not with reduced motion, nor on touch screens).
  private async startStrip(): Promise<void> {
    if (this.reducedMotion || matchMedia("(pointer: coarse)").matches || !this.prizes.length) return
    const { gsap } = await import("gsap")
    if (this.destroyed) return
    const el = this.strip.nativeElement
    this._zone.runOutsideAngular(() => {
      const distance = el.scrollWidth - el.clientWidth
      if (distance <= 0) return
      this.stripTween = gsap.to(el, {
        scrollLeft: distance,
        duration: distance / 25,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      })
    })
  }

  private pickPrizes(cards: Card[]): Card[] {
    const rare = cards.filter((c) => c.rarity === "ULTRA_RARE" || c.rarity === "SECRET")
    for (let i = rare.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[rare[i], rare[j]] = [rare[j], rare[i]]
    }
    return rare.slice(0, 10)
  }

  private find(id: number): BoosterType {
    return this.boosters.find((b) => b.id === id)!
  }
}
