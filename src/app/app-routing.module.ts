import { inject, NgModule } from "@angular/core"
import { RouterModule, Routes } from "@angular/router"
import { GameService } from "services/game.service"
import { ShopComponent } from "shop/shop.component"
import { InventoryComponent } from "inventory/inventory.component"
import { OpeningComponent } from "opening/opening.component"
import { CollectionComponent } from "collection/collection.component"
import { BoxOpeningComponent } from "box-opening/box-opening.component"
import { MarketComponent } from "market/market.component"
import { LoginComponent } from "login/login.component"
import { loggedIn, loggedOut } from "services/auth.service"

const routes: Routes = [
  { path: "", redirectTo: "boutique", pathMatch: "full" },
  { path: "connexion", component: LoginComponent, canActivate: [loggedOut] },
  { path: "inscription", component: LoginComponent, canActivate: [loggedOut], data: { register: true } },
  {
    path: "boutique",
    component: ShopComponent,
    canActivate: [loggedIn],
    resolve: {
      boosters: () => inject(GameService).boosters(),
      // for the strip of the rarest cards
      cards: () => inject(GameService).cards(),
    },
  },
  {
    path: "inventaire",
    component: InventoryComponent,
    canActivate: [loggedIn],
    resolve: {
      boosters: () => inject(GameService).myBoosters(),
    },
  },
  // no resolver: opening is a POST, the component does it
  { path: "ouverture/box/:purchaseId", component: BoxOpeningComponent, canActivate: [loggedIn] },
  { path: "ouverture/:id", component: OpeningComponent, canActivate: [loggedIn] },
  {
    path: "collection",
    component: CollectionComponent,
    canActivate: [loggedIn],
    resolve: {
      cards: () => inject(GameService).cards(),
      myCards: () => inject(GameService).myCards(),
    },
  },
  {
    path: "marche",
    component: MarketComponent,
    canActivate: [loggedIn],
    resolve: {
      listings: () => inject(GameService).listings(),
    },
  },
]

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
