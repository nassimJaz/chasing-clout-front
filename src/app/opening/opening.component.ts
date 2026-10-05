import { Component, OnInit } from "@angular/core"
import { ActivatedRoute } from "@angular/router"
import { apiError, FINISH_LABELS, PulledCard, UserBooster } from "models/game.model"
import { GameService } from "services/game.service"

// Opens the booster of the URL (POST) and reveals its cards one by one.
@Component({
  selector: "opening",
  templateUrl: "./opening.component.html",
  styleUrls: ["./opening.component.scss"],
})
export class OpeningComponent implements OnInit {
  cards: PulledCard[] = []
  revealed: boolean[] = []
  next?: UserBooster
  error = ""
  finishLabels = FINISH_LABELS

  constructor(private _route: ActivatedRoute, private _game: GameService) {}

  ngOnInit(): void {
    // the component is reused when going to the next booster, so follow the URL
    this._route.paramMap.subscribe((params) => this.open(Number(params.get("id"))))
  }

  get allRevealed(): boolean {
    return this.revealed.every((r) => r)
  }

  reveal(i: number): void {
    this.revealed[i] = true
  }

  revealAll(): void {
    this.revealed.forEach((r, i) => setTimeout(() => this.reveal(i), i * 150))
  }

  private open(id: number): void {
    this.cards = []
    this.next = undefined
    this.error = ""
    this._game.open(id).subscribe({
      next: (cards) => {
        this.cards = cards
        this.revealed = cards.map(() => false)
        this._game.myBoosters().subscribe((boosters) => (this.next = boosters[0]))
      },
      error: (err) => (this.error = apiError(err)),
    })
  }
}
