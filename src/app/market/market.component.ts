import { Component } from "@angular/core"
import { ActivatedRoute } from "@angular/router"
import { Observable } from "rxjs"
import {
  apiError,
  CardPrice,
  FINISH_LABELS,
  instant,
  Listing,
  Rarity,
  RARITIES,
  RARITY_LABELS,
  RARITY_LETTERS,
} from "models/game.model"
import { GameService } from "services/game.service"

// Cards on sale by the players, compared with the system price of the same finish.
@Component({
  selector: "market",
  templateUrl: "./market.component.html",
  styleUrls: ["./market.component.scss"],
})
export class MarketComponent {
  listings: Listing[] = this._route.snapshot.data["listings"]
  rarities = RARITIES
  rarityLabels = RARITY_LABELS
  rarityLetters = RARITY_LETTERS
  finishLabels = FINISH_LABELS

  mine = false
  rarity: Rarity | null = null
  sort: "asc" | "desc" = "asc"
  busy?: number // listing being bought or cancelled
  message = ""
  error = ""
  inspected?: Listing

  // system prices, loaded once per card
  private prices = new Map<number, CardPrice[]>()

  constructor(private _route: ActivatedRoute, public game: GameService) {
    this.loadPrices()
  }

  shown(username: string): Listing[] {
    const list = this.listings.filter(
      (l) => (!this.mine || l.seller === username) && (!this.rarity || l.card.rarity === this.rarity),
    )
    // the API already sorts by price, cheapest first
    return this.sort === "asc" ? list : [...list].reverse()
  }

  // "−12 % vs système", "+8 % vs système", or "" while the price is loading
  versusSystem(listing: Listing): string {
    const system = this.prices.get(listing.card.id)?.find((p) => p.finish === listing.finish)?.price
    if (!system) return ""
    const diff = Math.round((100 * (listing.price - system)) / system)
    if (diff === 0) return "Prix système"
    return `${diff > 0 ? "+" : "−"}${Math.abs(diff)} % vs système`
  }

  // what the system would pay for the same card, to place the listing
  buyback(listing: Listing): number | undefined {
    return this.prices.get(listing.card.id)?.find((p) => p.finish === listing.finish)?.buyback
  }

  cheaper(listing: Listing): boolean {
    return this.versusSystem(listing).startsWith("−")
  }

  date(listing: Listing): string {
    return new Date(instant(listing.createdAt)).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
  }

  buy(listing: Listing): void {
    this.act(listing, this.game.buyListing(listing.id), `${listing.card.name} achetée pour ${listing.price} memes`)
  }

  // Gives the card back to its seller's collection.
  cancel(listing: Listing): void {
    this.act(listing, this.game.cancelListing(listing.id), `${listing.card.name} retirée de la vente`)
  }

  private act(listing: Listing, call: Observable<unknown>, success: string): void {
    this.busy = listing.id
    this.message = ""
    this.error = ""
    call.subscribe({
      next: () => {
        this.message = success
        this.reload()
      },
      // 409: already sold, or not enough memes
      error: (err) => {
        this.error = apiError(err)
        this.reload()
      },
    })
  }

  private reload(): void {
    this.game.refreshProfile()
    this.game.listings().subscribe({
      next: (listings) => {
        this.listings = listings
        this.busy = undefined
        this.loadPrices()
      },
      error: () => (this.busy = undefined),
    })
  }

  private loadPrices(): void {
    for (const id of new Set(this.listings.map((l) => l.card.id))) {
      if (this.prices.has(id)) continue
      this.prices.set(id, [])
      this.game.prices(id).subscribe((prices) => this.prices.set(id, prices))
    }
  }
}
