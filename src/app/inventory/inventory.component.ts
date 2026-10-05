import { Component } from "@angular/core"
import { ActivatedRoute } from "@angular/router"
import { UserBooster } from "models/game.model"

@Component({
  selector: "inventory",
  templateUrl: "./inventory.component.html",
  styleUrls: ["./inventory.component.scss"],
})
export class InventoryComponent {
  // Unopened boosters grouped by type; opening one takes the first id of its group.
  groups: { code: string; name: string; ids: number[] }[] = []

  constructor(private _route: ActivatedRoute) {
    const boosters: UserBooster[] = this._route.snapshot.data["boosters"]
    for (const booster of boosters) {
      let group = this.groups.find((g) => g.code === booster.code)
      if (!group) {
        group = { code: booster.code, name: booster.name, ids: [] }
        this.groups.push(group)
      }
      group.ids.push(booster.id)
    }
  }
}
