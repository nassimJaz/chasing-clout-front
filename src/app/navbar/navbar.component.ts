import { Component, OnDestroy } from "@angular/core"
import { Router } from "@angular/router"
import { Subscription, timer } from "rxjs"
import { apiError, instant, PLAYERS } from "models/game.model"
import { Link } from "models/links.model"
import { GameService } from "services/game.service"
import { PlayerService } from "services/player.service"

@Component({
  selector: "navbar",
  templateUrl: "./navbar.component.html",
  styleUrls: ["./navbar.component.scss"],
})
export class NavbarComponent implements OnDestroy {
  links: Link[] = []
  players = PLAYERS
  now = Date.now()
  freeError = ""
  claiming = false

  private clock: Subscription

  constructor(public game: GameService, public player: PlayerService, private _router: Router) {
    this.links.push({ name: "Boutique", href: "boutique" })
    this.links.push({ name: "Inventaire", href: "inventaire" })
    this.links.push({ name: "Collection", href: "collection" })
    this.links.push({ name: "Marché", href: "marche" })
    // ticks the free booster countdown
    this.clock = timer(0, 1000).subscribe(() => (this.now = Date.now()))
  }

  ngOnDestroy(): void {
    this.clock.unsubscribe()
  }

  // "mm:ss" until the next free booster, "" when it can be claimed. Only a display: the API decides.
  countdown(nextFreeBoosterAt: string | number | null): string {
    const left = nextFreeBoosterAt ? Math.ceil((instant(nextFreeBoosterAt) - this.now) / 1000) : 0
    if (left <= 0) return ""
    return `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`
  }

  claimFree(): void {
    this.claiming = true
    this.freeError = ""
    this.game.claimFreeBooster().subscribe({
      next: (booster) => {
        this.claiming = false
        this._router.navigate(["/ouverture", booster.id])
      },
      error: (err) => {
        this.claiming = false
        this.freeError = apiError(err)
        setTimeout(() => (this.freeError = ""), 5000)
      },
    })
  }

  // Everything shown belongs to the player: reload the profile and the current page (its resolvers).
  switchPlayer(id: number): void {
    this.player.set(id)
    this.game.refreshProfile()
    // an opening page would open the booster again: go to the inventory instead
    const url = this._router.url.startsWith("/ouverture") ? "/inventaire" : this._router.url
    this._router.navigateByUrl("/", { skipLocationChange: true }).then(() => this._router.navigateByUrl(url))
  }
}
