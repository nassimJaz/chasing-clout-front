import { Component } from "@angular/core"
import { Link } from "models/links.model"
import { GameService } from "services/game.service"

@Component({
  selector: "navbar",
  templateUrl: "./navbar.component.html",
  styleUrls: ["./navbar.component.scss"],
})
export class NavbarComponent {
  links: Link[] = []

  constructor(public game: GameService) {
    this.links.push({ name: "Boutique", href: "boutique" })
    this.links.push({ name: "Inventaire", href: "inventaire" })
    this.links.push({ name: "Collection", href: "collection" })
  }
}
