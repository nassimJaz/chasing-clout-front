import { inject, NgModule } from "@angular/core"
import { RouterModule, Routes } from "@angular/router"
import { GameService } from "services/game.service"
import { ShopComponent } from "shop/shop.component"
import { InventoryComponent } from "inventory/inventory.component"
import { OpeningComponent } from "opening/opening.component"
import { CollectionComponent } from "collection/collection.component"
import { BoxOpeningComponent } from "box-opening/box-opening.component"
import { MarketComponent } from "market/market.component"

const routes: Routes = [
  { path: "", redirectTo: "boutique", pathMatch: "full" },
  {
    path: "boutique",
    component: ShopComponent,
    resolve: {
      boosters: () => inject(GameService).boosters(),
      // for the strip of the rarest cards
      cards: () => inject(GameService).cards(),
    },
  },
  {
    path: "inventaire",
    component: InventoryComponent,
    resolve: {
      boosters: () => inject(GameService).myBoosters(),
    },
  },
  // no resolver: opening is a POST, the component does it
  { path: "ouverture/box/:purchaseId", component: BoxOpeningComponent },
  { path: "ouverture/:id", component: OpeningComponent },
  {
    path: "collection",
    component: CollectionComponent,
    resolve: {
      cards: () => inject(GameService).cards(),
      myCards: () => inject(GameService).myCards(),
    },
  },
  {
    path: "marche",
    component: MarketComponent,
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
