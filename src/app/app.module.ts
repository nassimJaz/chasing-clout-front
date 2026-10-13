import { NgModule } from "@angular/core"
import { BrowserModule } from "@angular/platform-browser"

import { AppRoutingModule } from "app-routing.module"
import { AppComponent } from "app.component"
import { NavbarComponent } from "navbar/navbar.component"
import { FormsModule } from "@angular/forms"
import { HTTP_INTERCEPTORS, HttpClientModule } from "@angular/common/http"
import { MemeCardComponent } from "meme-card/meme-card.component"
import { ShopComponent } from "shop/shop.component"
import { InventoryComponent } from "inventory/inventory.component"
import { OpeningComponent } from "opening/opening.component"
import { CollectionComponent } from "collection/collection.component"
import { BoosterOpeningComponent } from "booster-opening/booster-opening.component"
import { CardInspectComponent } from "card-inspect/card-inspect.component"
import { BoxOpeningComponent } from "box-opening/box-opening.component"
import { MarketComponent } from "market/market.component"
import { AuthInterceptor } from "services/auth.interceptor"
import { LoginComponent } from "login/login.component"

@NgModule({
  declarations: [
    AppComponent,
    NavbarComponent,
    MemeCardComponent,
    ShopComponent,
    InventoryComponent,
    OpeningComponent,
    CollectionComponent,
    BoosterOpeningComponent,
    CardInspectComponent,
    BoxOpeningComponent,
    MarketComponent,
    LoginComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    HttpClientModule,
  ],
  // every API call says who is playing (the logged-in player's token)
  providers: [{ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }],
  bootstrap: [AppComponent],
})
export class AppModule {
}
