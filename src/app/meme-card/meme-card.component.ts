import { Component, Input } from "@angular/core"
import { Card, Finish, RARITY_LABELS } from "models/game.model"
import { GameService } from "services/game.service"

// One card. faceDown shows its back (flips when it turns false), missing greys it out (collection).
@Component({
  selector: "meme-card",
  templateUrl: "./meme-card.component.html",
  styleUrls: ["./meme-card.component.scss"],
})
export class MemeCardComponent {
  @Input({ required: true }) card!: Card
  @Input() finish: Finish = "NORMAL"
  @Input() faceDown = false
  @Input() missing = false

  rarityLabels = RARITY_LABELS

  constructor(public game: GameService) {}
}
