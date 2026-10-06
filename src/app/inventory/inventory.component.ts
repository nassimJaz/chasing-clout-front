import { Component } from "@angular/core"
import { ActivatedRoute } from "@angular/router"
import { FORMATS, formatCount, PurchaseFormat, UserBooster } from "models/game.model"

interface Group {
  key: string
  format: PurchaseFormat
  label: string
  codes: string[] // distinct booster types (two for a mixed display)
  names: string[]
  ids: number[] // unopened boosters
  total: number // boosters in the purchase, 0 when grouped by type
  purchaseId: number | null
}

// Unopened boosters: one group per tri-pack or display purchase, the other boosters grouped by type.
@Component({
  selector: "inventory",
  templateUrl: "./inventory.component.html",
  styleUrls: ["./inventory.component.scss"],
})
export class InventoryComponent {
  groups: Group[] = []

  constructor(private _route: ActivatedRoute) {
    const boosters: UserBooster[] = this._route.snapshot.data["boosters"]
    for (const booster of boosters) {
      // single purchases, gifted boosters, or an API without purchaseId: by type, opened one by one
      const boxed = booster.purchaseId != null && booster.format != null && booster.format !== "SINGLE"
      const format: PurchaseFormat = boxed ? booster.format! : "SINGLE"
      const key = boxed ? `p${booster.purchaseId}` : `t${booster.code}`
      let group = this.groups.find((g) => g.key === key)
      if (!group) {
        group = {
          key,
          format,
          label: FORMATS.find((f) => f.format === format)!.label,
          codes: [],
          names: [],
          ids: [],
          total: boxed ? formatCount(format) : 0,
          purchaseId: boxed ? booster.purchaseId! : null,
        }
        this.groups.push(group)
      }
      if (!group.codes.includes(booster.code)) {
        group.codes.push(booster.code)
        group.names.push(booster.name)
      }
      group.ids.push(booster.id)
    }
  }
}
