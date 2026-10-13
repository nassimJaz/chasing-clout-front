import { Component } from "@angular/core"
import { ActivatedRoute, Router } from "@angular/router"
import { apiError } from "models/game.model"
import { AuthService } from "services/auth.service"

// Logs in (/connexion) or creates an account (/inscription, route data `register`), then goes to the shop.
@Component({
  selector: "login",
  templateUrl: "./login.component.html",
  styleUrls: ["./login.component.scss"],
})
export class LoginComponent {
  register = !!this._route.snapshot.data["register"]
  username = ""
  password = ""
  error = ""
  busy = false

  constructor(private _route: ActivatedRoute, private _auth: AuthService, private _router: Router) {}

  submit(): void {
    this.busy = true
    this.error = ""
    const call = this.register ? this._auth.register(this.username, this.password) : this._auth.login(this.username, this.password)
    call.subscribe({
      next: () => this._router.navigate(["/boutique"]),
      error: (err) => {
        this.busy = false
        this.error = apiError(err)
      },
    })
  }
}
