export type PinTier = "primary" | "secondary";
export type BuildingCategory =
  | "Research"
  | "Academic"
  | "Housing"
  | "Recreation"
  | "Administration"
  | "Student Life"
  | "Other";

type Entry = {
  pinTier: PinTier;
  category: BuildingCategory;
  name?: string;
  shortDescription?: string;
};

const CATALOG: Record<string, Entry> = {
  "stem-building": { pinTier: "primary", category: "Research" },
  "walker-research-center": { pinTier: "primary", category: "Research" },
  "parker-ag-research": { pinTier: "primary", category: "Research" },
  "parker-1890-complex": { pinTier: "primary", category: "Research" },
  "caldwell-hall": { pinTier: "primary", category: "Academic", name: "Caldwell Hall" },
  "woodward-hall": { pinTier: "primary", category: "Academic" },
  "john-b-watson-library": { pinTier: "primary", category: "Academic" },
  "rust-technology-building": { pinTier: "primary", category: "Academic" },
  "human-sciences-building": { pinTier: "primary", category: "Academic" },
  "henderson-young-hall": { pinTier: "primary", category: "Academic" },
  "caine-gilleland-hall": { pinTier: "primary", category: "Academic" },
  "dawson-hicks-hall": { pinTier: "primary", category: "Academic" },
  "corbin-hall": { pinTier: "primary", category: "Academic" },
  "larrison-hall": { pinTier: "primary", category: "Academic" },
  "holiday-hall": {
    pinTier: "secondary",
    category: "Housing",
    shortDescription: "Residential and administrative hall.",
  },
  "delta-housing-complex": {
    pinTier: "secondary",
    category: "Housing",
    shortDescription: "Campus residential housing complex.",
  },
  "johnny-b-johnson-housing-complex": {
    pinTier: "secondary",
    category: "Housing",
    shortDescription: "Campus residential housing complex.",
  },
  "fitness-center": { pinTier: "secondary", category: "Recreation" },
  "health-physical-education-and-recreation-hper-building": {
    pinTier: "secondary",
    category: "Recreation",
    name: "HPER Building",
  },
  "alumni-house": { pinTier: "secondary", category: "Administration" },
  "administration-building": { pinTier: "secondary", category: "Administration" },
  "facilities-management": { pinTier: "secondary", category: "Administration" },
  "la-davis-student-union": {
    pinTier: "secondary",
    category: "Student Life",
    name: "L.A. Davis, Sr. Student Union",
  },
  "w-e-o-bryant-bell-tower": { pinTier: "secondary", category: "Other" },
  "child-development-center": { pinTier: "secondary", category: "Other" },
  "infirmary-building": { pinTier: "secondary", category: "Other" },
  "hazzard-building-military-science": { pinTier: "secondary", category: "Academic" },
  "harrold-complex": { pinTier: "secondary", category: "Other" },
  "lewis-hall": { pinTier: "secondary", category: "Housing" },
  "douglas-hall": { pinTier: "secondary", category: "Housing" },
  "childress-hall": { pinTier: "secondary", category: "Housing" },
};

/**
 * Whether an id is deliberately classified. `resolvePinTier`/`resolveCategory`
 * fall back to secondary/"Other" for unknown ids, which makes missing curation
 * indistinguishable from a real classification — this is the seam that lets
 * tests catch uncatalogued places.
 */
export function hasCatalogEntry(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(CATALOG, id);
}

export function resolvePinTier(id: string): PinTier {
  return CATALOG[id]?.pinTier ?? "secondary";
}

export function resolveCategory(id: string): BuildingCategory {
  return CATALOG[id]?.category ?? "Other";
}

export function displayBuildingName(id: string, fallback: string): string {
  return CATALOG[id]?.name ?? fallback;
}

export function shortDescriptionFor(id: string, fallback?: string | null): string {
  return CATALOG[id]?.shortDescription ?? fallback ?? "Campus building.";
}

export function pinPriority(id: string): number {
  return resolvePinTier(id) === "primary" ? 1 : 100;
}
