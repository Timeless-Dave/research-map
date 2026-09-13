import type { Building } from "@/types";
import {
  CAMPUS_PLACES,
  getCampusPlace,
  type CampusPlace,
} from "@/lib/campus-places.generated";
import {
  displayBuildingName,
  resolveCategory,
  resolvePinTier,
  shortDescriptionFor,
  type BuildingCategory,
  type PinTier,
} from "@/lib/building-catalog";

/**
 * One client-visible campus place.
 *
 * Shaped to satisfy the `{ id, name, image_url }` helpers already used for
 * sorting, so list rendering does not need two code paths.
 */
export interface PlaceEntry {
  id: string;
  name: string;
  code: string;
  category: BuildingCategory;
  pinTier: PinTier;
  description: string | null;
  image_url: string | null;
  lng: number;
  lat: number;
  /** The API/database record, when this place has one. */
  building: Building | null;
  /** Whether a research detail panel can be shown for this place. */
  hasDetail: boolean;
}

function fromPlace(place: CampusPlace, building: Building | null): PlaceEntry {
  return {
    id: place.id,
    name: building?.name ?? displayBuildingName(place.id, place.name),
    code: building?.code ?? place.code ?? "",
    category: resolveCategory(place.id),
    pinTier: resolvePinTier(place.id),
    description: shortDescriptionFor(place.id, building?.description ?? null),
    image_url: building?.image_url ?? null,
    lng: building?.lng ?? place.lng,
    lat: building?.lat ?? place.lat,
    building,
    hasDetail: Boolean(building),
  };
}

/**
 * The canonical catalog: every geometry-backed campus place, enriched by the
 * API record where one exists.
 *
 * Previously the sidebar listed only the 16 API-seeded buildings while the map
 * and directions knew about all 31, so 15 places were pins you could see but
 * could never find by name.
 */
export function buildPlaceCatalog(buildings: Building[]): PlaceEntry[] {
  const byId = new Map(buildings.map((b) => [b.id, b]));
  const entries = Object.values(CAMPUS_PLACES).map((place) =>
    fromPlace(place, byId.get(place.id) ?? null)
  );

  // An API record with no matching geometry still belongs in the catalog —
  // dropping it would hide a real building.
  for (const building of buildings) {
    if (!CAMPUS_PLACES[building.id]) {
      entries.push({
        id: building.id,
        name: building.name,
        code: building.code,
        category: resolveCategory(building.id),
        pinTier: resolvePinTier(building.id),
        description: building.description ?? null,
        image_url: building.image_url ?? null,
        lng: building.lng,
        lat: building.lat,
        building,
        hasDetail: true,
      });
    }
  }

  return entries;
}

/** Display name for an id, without needing click-supplied metadata. */
export function placeDisplayName(id: string, fallbackName?: string | null): string {
  if (fallbackName) return fallbackName;
  const place = getCampusPlace(id);
  return place ? displayBuildingName(id, place.name) : id;
}

/** Case-insensitive match over name, code, category, and description. */
export function matchesQuery(entry: PlaceEntry, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  return (
    entry.name.toLowerCase().includes(q) ||
    entry.code.toLowerCase().includes(q) ||
    entry.category.toLowerCase().includes(q) ||
    (entry.description?.toLowerCase().includes(q) ?? false)
  );
}
