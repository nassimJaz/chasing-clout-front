import { Component } from "@angular/core"
import { ActivatedRoute } from "@angular/router"
import { Card, Finish, FINISH_LABELS, Rarity, RARITIES, RARITY_LABELS, RARITY_LETTERS, UserCard } from "models/game.model"
import { GameService } from "services/game.service"

interface Entry {
  card: Card
  owned: UserCard[] // one per finish, best finish first
}

const FINISH_ORDER: Finish[] = ["FIRE", "HOLO", "NORMAL"]

// All 300 cards: owned ones in color with their finishes, missing ones greyed out.
// Any card opens the 3D dialog, where an owned one can be put on sale or sold to the system.
@Component({
  selector: "collection",
  templateUrl: "./collection.component.html",
  styleUrls: ["./collection.component.scss"],
})
export class CollectionComponent {
  entries: Entry[] = []
  rarities = RARITIES
  rarityLabels = RARITY_LABELS
  rarityLetters = RARITY_LETTERS
  finishLabels = FINISH_LABELS

  rarity: Rarity | null = null
  ownedOnly = false
  selected?: Entry // shown in the inspection dialog

  private cards: Card[]

  constructor(private _route: ActivatedRoute, private _game: GameService) {
    this.cards = this._route.snapshot.data["cards"]
    this.entries = this.build(this.cards, this._route.snapshot.data["myCards"])
  }

  // After a purchase or a sale in the dialog: reload what is owned, the dialog follows.
  reload(): void {
    this._game.myCards().subscribe((myCards) => {
      this.entries = this.build(this.cards, myCards)
      if (this.selected) this.selected = this.entries.find((e) => e.card.id === this.selected!.card.id)
    })
  }

  private build(cards: Card[], myCards: UserCard[]): Entry[] {
    return cards.map((card) => ({
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
