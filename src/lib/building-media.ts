import { getBuildingImages, type BuildingImage } from "@/lib/building-images.generated";

export interface GalleryPhoto {
  /** Fallback JPEG URL — also what non-<picture> call sites render. */
  src: string;
  alt: string;
  /**
   * Present only for photos with pre-generated derivatives. A photo sourced
   * from a database `image_url` has no manifest entry and renders as a plain
   * image at its single available size.
   */
  dir?: string;
  image?: BuildingImage;
}

export interface BuildingMedia {
  /** Derived from the first gallery photo — never hardcoded, so it cannot
   *  drift from the widths the optimizer actually produced. */
  hero: string;
  heroAlt: string;
  gallery: GalleryPhoto[];
  /** Optional equirectangular 360° image URL (future: dedicated photospheres). */
  panorama?: string;
}

function gallery(id: string, name: string): GalleryPhoto[] {
  const dir = `/buildings/${id}`;
  return getBuildingImages(id).map((image, i) => ({
    src: `${dir}/${image.name}-${image.fallbackWidth}.jpg`,
    alt: `${name} — campus photo ${i + 1}`,
    dir,
    image,
  }));
}

function media(id: string, name: string, heroAlt: string): BuildingMedia {
  const photos = gallery(id, name);
  return { hero: photos[0]?.src ?? "", heroAlt, gallery: photos };
}

/** Static media for buildings with uploaded campus photos. */
export const BUILDING_MEDIA: Record<string, BuildingMedia> = {
  "stem-building": media("stem-building", "STEM Building", "UAPB STEM Building exterior"),
  "woodward-hall": media("woodward-hall", "Woodward Hall", "Woodward Hall exterior at UAPB"),
  "human-sciences-building": media("human-sciences-building", "Human Sciences Building", "Human Sciences Building exterior at UAPB"),
  "larrison-hall": media("larrison-hall", "Larrison Hall", "Larrison Hall exterior at UAPB"),
  "parker-1890-complex": media("parker-1890-complex", "S.J. Parker 1890 Extension Complex", "S.J. Parker 1890 Extension Complex exterior"),
  "parker-ag-research": media("parker-ag-research", "S.J. Parker Agriculture Research Bldg", "S.J. Parker Agriculture Research Building exterior"),
};

export function getBuildingMedia(buildingId: string): BuildingMedia | null {
  return BUILDING_MEDIA[buildingId] ?? null;
}

export function getBuildingHeroUrl(buildingId: string): string | null {
  return BUILDING_MEDIA[buildingId]?.hero ?? null;
}

export function enrichBuilding<T extends { id: string; image_url: string | null }>(
  building: T
): T {
  const hero = getBuildingHeroUrl(building.id);
  if (!hero || building.image_url) return building;
  return { ...building, image_url: hero };
}

export function enrichBuildings<T extends { id: string; image_url: string | null }>(
  buildings: T[]
): T[] {
  return buildings.map(enrichBuilding);
}

/** Buildings with campus photos first, then alphabetical. */
export function sortBuildingsWithPhotosFirst<
  T extends { id: string; name: string; image_url: string | null },
>(buildings: T[]): T[] {
  return [...buildings].sort((a, b) => {
    const aHasPhoto = Boolean(a.image_url ?? getBuildingHeroUrl(a.id));
    const bHasPhoto = Boolean(b.image_url ?? getBuildingHeroUrl(b.id));
    if (aHasPhoto !== bHasPhoto) return aHasPhoto ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
