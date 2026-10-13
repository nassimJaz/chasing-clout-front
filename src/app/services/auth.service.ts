import { inject, Injectable } from "@angular/core"
import { HttpClient } from "@angular/common/http"
import { CanActivateFn, Router } from "@angular/router"
import { BehaviorSubject, Observable, tap } from "rxjs"
import { environment } from "../../environments/environment"

const KEY = "cc-token"

// The logged-in player's JWT (null when logged out): sent by AuthInterceptor and kept across reloads.
@Injectable({
  providedIn: "root",
})
export class AuthService {
  private api = environment.apiUrl

  token$ = new BehaviorSubject<string | null>(read())

  constructor(private http: HttpClient, private _router: Router) {}

  login(username: string, password: string): Observable<unknown> {
    return this.http
      .post<{ token: string }>(`${this.api}/auth/login`, { username, password })
      .pipe(tap(({ token }) => this.set(token)))
  }

  // Creates the player (5000 memes to start) and logs them in.
  register(username: string, password: string): Observable<unknown> {
    return this.http
      .post<{ token: string }>(`${this.api}/auth/register`, { username, password })
      .pipe(tap(({ token }) => this.set(token)))
  }

  // ponytail: only forgets the token, which stays valid until it expires (24 h); a server-side blocklist if that matters.
  logout(): void {
    this.set(null)
    this._router.navigate(["/connexion"])
  }

  private set(token: string | null): void {
    try {
      if (token) localStorage.setItem(KEY, token)
      else localStorage.removeItem(KEY)
    } catch {
      // storage blocked: logged in until the next reload
    }
    this.token$.next(token)
  }
}

function read(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

// The game pages need a logged-in player; the login pages send a logged-in one to the shop.
export const loggedIn: CanActivateFn = () => !!inject(AuthService).token$.value || inject(Router).parseUrl("/connexion")
export const loggedOut: CanActivateFn = () => !inject(AuthService).token$.value || inject(Router).parseUrl("/boutique")
