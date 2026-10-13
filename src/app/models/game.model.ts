// Mirrors the API DTOs (chasing-clout-api, package DTO).

export type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "VERY_RARE" | "ULTRA_RARE" | "SECRET"
export type Finish = "NORMAL" | "HOLO" | "FIRE"
export type PurchaseFormat = "SINGLE" | "TRI_PACK" | "DISPLAY_MINI" | "DISPLAY_MEDIUM" | "DISPLAY_MEGA"

export interface Card {
  id: number
  name: string
  imageUrl: string
  rarity: Rarity
}

export interface BoosterSlot {
  position: number
  cardCount: number
  weights: Partial<Record<Rarity, number>>
}

export interface BoosterType {
  id: number
  code: string
  name: string
  price: number
  prices: Record<PurchaseFormat, number>
  slots: BoosterSlot[]
}

export interface Profile {
  id: number
  username: string
  memeBalance: number
  nextFreeBoosterAt: string | number | null // null or in the past: the free booster can be claimed
}

export interface Purchase {
  id: number
  format: PurchaseFormat
  totalPrice: number
  createdAt: string
}

export interface UserBooster {
  id: number
  code: string
  name: string
  // the purchase it comes from; null for a gifted booster, missing with an older API
  purchaseId?: number | null
  format?: PurchaseFormat | null
}

export interface PulledCard {
  position: number
  card: Card
  finish: Finish
}

export type ListingStatus = "ACTIVE" | "SOLD" | "CANCELLED"

// A card put on sale by a player (the card is held by the market until sold or cancelled).
export interface Listing {
  id: number
  card: Card
  finish: Finish
  price: number
  status: ListingStatus
  seller: string // username
  createdAt: string | number
}

// The system price of a card in one finish (the reference), and what the system pays to buy it back.
export interface CardPrice {
  memeCardId: number
  finish: Finish
  price: number
  buyback: number
}

export interface UserCard {
  card: Card
  finish: Finish
  quantity: number
  firstObtainedAt: string
}

export const FINISHES: Finish[] = ["NORMAL", "HOLO", "FIRE"]

export const RARITIES: Rarity[] = ["COMMON", "UNCOMMON", "RARE", "VERY_RARE", "ULTRA_RARE", "SECRET"]

export const RARITY_LABELS: Record<Rarity, string> = {
  COMMON: "Commun",
  UNCOMMON: "Peu commun",
  RARE: "Rare",
  VERY_RARE: "Très rare",
  ULTRA_RARE: "Ultra rare",
  SECRET: "Secrète",
}

// Same colors as meme-card.component.scss (used by the 3D scenes).
export const RARITY_COLORS: Record<Rarity, string> = {
  COMMON: "#9e9e9e",
  UNCOMMON: "#43a047",
  RARE: "#1e88e5",
  VERY_RARE: "#8e24aa",
  ULTRA_RARE: "#fb8c00",
  SECRET: "#c9a227",
}

// Rarity colors for text on the dark theme (the card frames keep RARITY_COLORS): all AA on the background.
export const RARITY_TEXT: Record<Rarity, string> = {
  COMMON: "#9e9e9e",
  UNCOMMON: "#6ccb70",
  RARE: "#5aaeff",
  VERY_RARE: "#c98be0",
  ULTRA_RARE: "#fb8c00",
  SECRET: "#c9a227",
}

export const FINISH_LABELS: Record<Finish, string> = {
  NORMAL: "Normale",
  HOLO: "Holo",
  FIRE: "Enflammée",
}

// mixable: only these displays can be split 50/50 between two boosters
export const FORMATS: { format: PurchaseFormat; label: string; count: number; mixable: boolean }[] = [
  { format: "SINGLE", label: "Booster", count: 1, mixable: false },
  { format: "TRI_PACK", label: "Tri-pack", count: 3, mixable: false },
  { format: "DISPLAY_MINI", label: "Display Mini", count: 9, mixable: false },
  { format: "DISPLAY_MEDIUM", label: "Display Medium", count: 30, mixable: true },
  { format: "DISPLAY_MEGA", label: "Display Méga", count: 60, mixable: true },
]

export function formatCount(format: PurchaseFormat): number {
  return FORMATS.find((f) => f.format === format)!.count
}

// An API Instant as milliseconds: an ISO string, or seconds if Jackson writes dates as numbers.
export function instant(value: string | number): number {
  return typeof value === "number" ? value * 1000 : Date.parse(value)
}

// Error message sent by the API ("Solde insuffisant"...), or a generic one.
export function apiError(err: any): string {
  return err?.error?.message || "L'API ne répond pas"
}
