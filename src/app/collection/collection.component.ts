import { Component } from "@angular/core"
import { ActivatedRoute } from "@angular/router"
import { Card, Finish, FINISH_LABELS, Rarity, RARITIES, RARITY_LABELS, UserCard } from "models/game.model"

interface Entry {
  card: Card
  owned: UserCard[] // one per finish, best finish first
}

const FINISH_ORDER: Finish[] = ["FIRE", "HOLO", "NORMAL"]

// All 300 cards: owned ones in color with their finishes, missing ones greyed out.
@Component({
  selector: "collection",
  templateUrl: "./collection.component.html",
  styleUrls: ["./collection.component.scss"],
})
export class CollectionComponent {
  entries: Entry[]
  rarities = RARITIES
  rarityLabels = RARITY_LABELS
  finishLabels = FINISH_LABELS

  rarity: Rarity | null = null
  ownedOnly = false

  constructor(private _route: ActivatedRoute) {
    const cards: Card[] = this._route.snapshot.data["cards"]
    const myCards: UserCard[] = this._route.snapshot.data["myCards"]
    this.entries = cards.map((card) => ({
      card,
      owned: myCards
        .filter((c) => c.card.id === card.id)
        .sort((a, b) => FINISH_ORDER.indexOf(a.finish) - FINISH_ORDER.indexOf(b.finish)),
    }))
  }

  get shown(): Entry[] {
    return this.entries.filter(
      (e) => (!this.rarity || e.card.rarity === this.rarity) && (!this.ownedOnly || e.owned.length > 0),
    )
  }

  // "owned / total" for one rarity, or for all of them with null
  progress(rarity: Rarity | null): string {
    const entries = this.entries.filter((e) => !rarity || e.card.rarity === rarity)
    return `${entries.filter((e) => e.owned.length > 0).length} / ${entries.length}`
  }
}
