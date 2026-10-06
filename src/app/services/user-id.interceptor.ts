import { Injectable } from "@angular/core"
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from "@angular/common/http"
import { Observable } from "rxjs"
import { environment } from "../../environments/environment"
import { PlayerService } from "./player.service"

// Tells the API who is playing: adds X-User-Id to every API call.
@Injectable()
export class UserIdInterceptor implements HttpInterceptor {
  constructor(private _player: PlayerService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!req.url.startsWith(environment.apiUrl)) return next.handle(req)
    return next.handle(req.clone({ setHeaders: { "X-User-Id": String(this._player.playerId$.value) } }))
  }
}
