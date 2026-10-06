import { Injectable } from "@angular/core"
import { BehaviorSubject } from "rxjs"

const KEY = "cc-player"

// The player we play as (no login yet): its id is sent as X-User-Id and kept across reloads.
@Injectable({
  providedIn: "root",
})
export class PlayerService {
  playerId$ = new BehaviorSubject<number>(read())

  set(id: number): void {
    try {
      localStorage.setItem(KEY, String(id))
    } catch {
      // storage blocked: the choice only lasts until the next reload
    }
    this.playerId$.next(id)
  }
}

function read(): number {
  try {
    return Number(localStorage.getItem(KEY)) || 1
  } catch {
    return 1
  }
}
