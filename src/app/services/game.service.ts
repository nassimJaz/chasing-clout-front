import { Injectable } from "@angular/core"
import { HttpClient } from "@angular/common/http"
import { BehaviorSubject, Observable, tap } from "rxjs"
import { environment } from "../../environments/environment"
import {
  BoosterType,
  Card,
  Profile,
  PulledCard,
  Purchase,
  PurchaseFormat,
  UserBooster,
  UserCard,
} from "models/game.model"

@Injectable({
  providedIn: "root",
})
export class GameService {
  private api = environment.apiUrl

  // Shown in the navbar, reloaded after each purchase.
  profile$ = new BehaviorSubject<Profile | null>(null)

  constructor(private http: HttpClient) {
    this.refreshProfile()
  }

  refreshProfile(): void {
    this.http.get<Profile>(`${this.api}/me`).subscribe((profile) => this.profile$.next(profile))
  }

  // The API serves the card images itself.
  imageUrl(card: Card): string {
    return this.api + card.imageUrl
  }

  cards(): Observable<Card[]> {
    return this.http.get<Card[]>(`${this.api}/cards`)
  }

  boosters(): Observable<BoosterType[]> {
    return this.http.get<BoosterType[]>(`${this.api}/boosters`)
  }

  buy(format: PurchaseFormat, boosterTypeId: number, secondBoosterTypeId: number | null): Observable<Purchase> {
    return this.http
      .post<Purchase>(`${this.api}/me/purchases`, { format, boosterTypeId, secondBoosterTypeId })
      .pipe(tap(() => this.refreshProfile()))
  }

  myBoosters(): Observable<UserBooster[]> {
    return this.http.get<UserBooster[]>(`${this.api}/me/boosters`)
  }

  open(userBoosterId: number): Observable<PulledCard[]> {
    return this.http.post<PulledCard[]>(`${this.api}/me/boosters/${userBoosterId}/open`, null)
  }

  myCards(): Observable<UserCard[]> {
    return this.http.get<UserCard[]>(`${this.api}/me/cards`)
  }
}
