import { Injectable } from "@angular/core"
import { HttpClient } from "@angular/common/http"
import { BehaviorSubject, Observable, tap } from "rxjs"
import { environment } from "../../environments/environment"
import {
  BoosterType,
  Card,
  CardPrice,
  Finish,
  Listing,
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

  // One free booster every so often; the API answers 429 when it is too early.
  claimFreeBooster(): Observable<UserBooster> {
    return this.http.post<UserBooster>(`${this.api}/me/free-booster`, null).pipe(tap(() => this.refreshProfile()))
  }

  // System price of a card in each finish.
  prices(cardId: number): Observable<CardPrice[]> {
    return this.http.get<CardPrice[]>(`${this.api}/market/prices/${cardId}`)
  }

  buyFromSystem(cardId: number, finish: Finish): Observable<CardPrice> {
    return this.http
      .post<CardPrice>(`${this.api}/market/system-purchases`, { memeCardId: cardId, finish })
      .pipe(tap(() => this.refreshProfile()))
  }

  // Active listings, cheapest first.
  listings(): Observable<Listing[]> {
    return this.http.get<Listing[]>(`${this.api}/market/listings`)
  }

  createListing(cardId: number, finish: Finish, price: number): Observable<Listing> {
    return this.http.post<Listing>(`${this.api}/market/listings`, { memeCardId: cardId, finish, price })
  }

  cancelListing(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/market/listings/${id}`)
  }

  buyListing(id: number): Observable<Listing> {
    return this.http.post<Listing>(`${this.api}/market/listings/${id}/purchase`, null).pipe(tap(() => this.refreshProfile()))
  }
}
