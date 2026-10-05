import { Component } from "@angular/core"
import { ActivatedRoute } from "@angular/router"
import { apiError, BoosterSlot, BoosterType, FORMATS, PurchaseFormat, Rarity, RARITY_LABELS } from "models/game.model"
import { GameService } from "services/game.service"

@Component({
  selector: "shop",
  templateUrl: "./shop.component.html",
  styleUrls: ["./shop.component.scss"],
})
export class ShopComponent {
  boosters: BoosterType[] = this._route.snapshot.data["boosters"]
  formats = FORMATS

  boosterId = this.boosters[0]?.id
  format: PurchaseFormat = "SINGLE"
  mixed = false
  secondBoosterId = this.boosters[1]?.id
  message = ""
  error = ""

  constructor(private _route: ActivatedRoute, private _game: GameService) {}

  get mixable(): boolean {
    return this.formats.find((f) => f.format === this.format)!.mixable
  }

  // Same rule as the API: a mixed display costs half of each full display.
  get price(): number {
    const first = this.find(this.boosterId).prices[this.format]
    if (!this.mixed || !this.mixable) {
      return first
    }
    return (first + this.find(this.secondBoosterId).prices[this.format]) / 2
  }

  odds(slot: BoosterSlot): { label: string; percent: number }[] {
    const entries = Object.entries(slot.weights) as [Rarity, number][]
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
    return entries.map(([rarity, weight]) => ({ label: RARITY_LABELS[rarity], percent: (100 * weight) / total }))
  }

  buy(): void {
    this.message = ""
    this.error = ""
    const second = this.mixed && this.mixable ? this.secondBoosterId : null
    this._game.buy(this.format, this.boosterId, second).subscribe({
      next: (purchase) => {
        const count = this.formats.find((f) => f.format === purchase.format)!.count
        this.message = `${count} booster${count > 1 ? "s" : ""} ajouté${count > 1 ? "s" : ""} à l'inventaire pour ${purchase.totalPrice} memes`
      },
      error: (err) => (this.error = apiError(err)),
    })
  }

  private find(id: number): BoosterType {
    return this.boosters.find((b) => b.id === id)!
  }
}
