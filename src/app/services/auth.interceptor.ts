import { Injectable } from "@angular/core"
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from "@angular/common/http"
import { catchError, Observable, throwError } from "rxjs"
import { environment } from "../../environments/environment"
import { AuthService } from "./auth.service"

// Tells the API who is playing: adds the token to every API call, and logs out when the API refuses it (401).
// Not on /auth/ calls: a wrong password is a 401 too.
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private _auth: AuthService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const token = this._auth.token$.value
    if (!token || !req.url.startsWith(environment.apiUrl) || req.url.startsWith(`${environment.apiUrl}/auth/`)) {
      return next.handle(req)
    }
    return next.handle(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })).pipe(
      catchError((err) => {
        if (err.status === 401) this._auth.logout()
        return throwError(() => err)
      }),
    )
  }
}
