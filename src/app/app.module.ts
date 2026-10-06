import { NgModule } from "@angular/core"
import { BrowserModule } from "@angular/platform-browser"

import { AppRoutingModule } from "app-routing.module"
import { AppComponent } from "app.component"
import { BrowserAnimationsModule } from "@angular/platform-browser/animations"
import { NavbarComponent } from "navbar/navbar.component"
import { MatListModule } from "@angular/material/list"
import { FormsModule } from "@angular/forms"
import { MatIconModule } from "@angular/material/icon"
import { MatButtonModule } from "@angular/material/button"
import { HttpClientModule } from "@angular/common/http"
import { MemeCardComponent } from "meme-card/meme-card.component"
import { ShopComponent } from "shop/shop.component"
import { InventoryComponent } from "inventory/inventory.component"
import { OpeningComponent } from "opening/opening.component"
import { CollectionComponent } from "collection/collection.component"
import { BoosterOpeningComponent } from "booster-opening/booster-opening.component"
import { CardInspectComponent } from "card-inspect/card-inspect.component"

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
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    MatListModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    HttpClientModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {
}
