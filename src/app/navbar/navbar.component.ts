import { Component, OnDestroy } from "@angular/core"
import { Router } from "@angular/router"
import { Subscription, timer } from "rxjs"
import { apiError, instant } from "models/game.model"
import { Link } from "models/links.model"
import { GameService } from "services/game.service"
import { AuthService } from "services/auth.service"

@Component({
  selector: "navbar",
  templateUrl: "./navbar.component.html",
  styleUrls: ["./navbar.component.scss"],
})
export class NavbarComponent implements OnDestroy {
  links: Link[] = []
  now = Date.now()
  freeError = ""
  claiming = false
  balance?: number // shown, counts toward the real balance when it changes

  private clock: Subscription
  private profile: Subscription
  private frame = 0

  constructor(public game: GameService, public auth: AuthService, private _router: Router) {
    this.links.push({ name: "Boutique", href: "boutique" })
    this.links.push({ name: "Inventaire", href: "inventaire" })
    this.links.push({ name: "Collection", href: "collection" })
    this.links.push({ name: "Marché", href: "marche" })
    // ticks the free booster countdown
    this.clock = timer(0, 1000).subscribe(() => (this.now = Date.now()))
    // logged out: the next player's balance shows at once instead of counting from this one
    this.profile = this.game.profile$.subscribe((p) => (p ? this.countTo(p.memeBalance) : (this.balance = undefined)))
  }

  ngOnDestroy(): void {
    this.clock.unsubscribe()
    this.profile.unsubscribe()
    cancelAnimationFrame(this.frame)
  }

  // Counts the shown balance to the new one in 0.8 s (ease out); jumps the first time and with reduced motion.
  private countTo(target: number): void {
    cancelAnimationFrame(this.frame)
    const from = this.balance
    if (from === undefined || from === target || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.balance = target
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 800)
      this.balance = Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3)))
      if (k < 1) this.frame = requestAnimationFrame(step)
    }
    this.frame = requestAnimationFrame(step)
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
}
