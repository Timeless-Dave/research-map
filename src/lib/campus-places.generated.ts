// GENERATED FILE — do not edit by hand.
// Source: public/buildings.geojson
// Regenerate: node scripts/generate-campus-places.mjs

export interface CampusPlace {
  id: string;
  name: string;
  code: string | null;
  /** Routable coordinate guaranteed to fall inside the building footprint. */
  lng: number;
  lat: number;
}

export const CAMPUS_PLACES: Record<string, CampusPlace> = {
  "administration-building": { id: "administration-building", name: "Administration Building", code: null, lng: -92.018738, lat: 34.243961 },
  "alumni-house": { id: "alumni-house", name: "Alumni House", code: null, lng: -92.020738, lat: 34.244857 },
  "caine-gilleland-hall": { id: "caine-gilleland-hall", name: "Caine-Gillelean Hall", code: "CGH", lng: -92.021017, lat: 34.241384 },
  "caldwell-hall": { id: "caldwell-hall", name: "Caldwell hall", code: "CALD", lng: -92.019622, lat: 34.24222 },
  "child-development-center": { id: "child-development-center", name: "Child Development Center", code: null, lng: -92.019881, lat: 34.244347 },
  "childress-hall": { id: "childress-hall", name: "Childress Hall", code: null, lng: -92.019783, lat: 34.243395 },
  "corbin-hall": { id: "corbin-hall", name: "Corbin Hall", code: "CBH", lng: -92.020955, lat: 34.240696 },
  "dawson-hicks-hall": { id: "dawson-hicks-hall", name: "Dawson-Hicks Hall", code: "DHH", lng: -92.020201, lat: 34.241363 },
  "delta-housing-complex": { id: "delta-housing-complex", name: "Delta Housing Complex", code: null, lng: -92.021962, lat: 34.248259 },
  "douglas-hall": { id: "douglas-hall", name: "Douglas Hall", code: null, lng: -92.020388, lat: 34.243028 },
  "facilities-management": { id: "facilities-management", name: "Facilities Management", code: null, lng: -92.02276, lat: 34.247212 },
  "fitness-center": { id: "fitness-center", name: "Fitness Center", code: null, lng: -92.020649, lat: 34.243991 },
  "harrold-complex": { id: "harrold-complex", name: "Harrold Complex", code: null, lng: -92.023672, lat: 34.241972 },
  "hazzard-building-military-science": { id: "hazzard-building-military-science", name: "Hazzard Building/Military Science", code: null, lng: -92.017751, lat: 34.242936 },
  "health-physical-education-and-recreation-hper-building": { id: "health-physical-education-and-recreation-hper-building", name: "Health, Physical Education and Recreation (HPER) Building", code: null, lng: -92.024423, lat: 34.246029 },
  "henderson-young-hall": { id: "henderson-young-hall", name: "Henderson-Young Hall", code: "HYH", lng: -92.0213, lat: 34.242202 },
  "holiday-hall": { id: "holiday-hall", name: "Holiday Hall", code: "HLD", lng: -92.022022, lat: 34.243502 },
  "human-sciences-building": { id: "human-sciences-building", name: "Human Sciences Building", code: "HSB", lng: -92.020003, lat: 34.244008 },
  "infirmary-building": { id: "infirmary-building", name: "Infirmary Building", code: null, lng: -92.02092, lat: 34.243696 },
  "john-b-watson-library": { id: "john-b-watson-library", name: "John B. Watson Library", code: "JBWL", lng: -92.022315, lat: 34.242092 },
  "johnny-b-johnson-housing-complex": { id: "johnny-b-johnson-housing-complex", name: "Johnny B. Johnson Housing Complex", code: null, lng: -92.023892, lat: 34.247438 },
  "la-davis-student-union": { id: "la-davis-student-union", name: "L.A. David Sr. Student Union", code: "LDSU", lng: -92.022468, lat: 34.2428 },
  "larrison-hall": { id: "larrison-hall", name: "Larrison Hall", code: null, lng: -92.022479, lat: 34.24342 },
  "lewis-hall": { id: "lewis-hall", name: "Lewis Hall", code: null, lng: -92.021011, lat: 34.243099 },
  "parker-1890-complex": { id: "parker-1890-complex", name: "S.J. Parker 1890 Extension Complex", code: "1890", lng: -92.023941, lat: 34.251526 },
  "parker-ag-research": { id: "parker-ag-research", name: "S.J. Parker Agriculture Research Bldg", code: "PARB", lng: -92.024201, lat: 34.252581 },
  "rust-technology-building": { id: "rust-technology-building", name: "Rust Technology Building", code: "RTB", lng: -92.022491, lat: 34.240799 },
  "stem-building": { id: "stem-building", name: "STEM Building", code: "STEM", lng: -92.023657, lat: 34.244129 },
  "w-e-o-bryant-bell-tower": { id: "w-e-o-bryant-bell-tower", name: "W.E. O'Bryant Bell Tower", code: null, lng: -92.020602, lat: 34.242239 },
  "walker-research-center": { id: "walker-research-center", name: "Walker Research Center", code: "WRC", lng: -92.021318, lat: 34.243664 },
  "woodward-hall": { id: "woodward-hall", name: "Woodward Hall", code: "WWH", lng: -92.022136, lat: 34.244009 },
};

export const CAMPUS_PLACE_IDS: readonly string[] = Object.keys(CAMPUS_PLACES);

export function getCampusPlace(id: string): CampusPlace | null {
  return CAMPUS_PLACES[id] ?? null;
}

export function isKnownPlaceId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(CAMPUS_PLACES, id);
}
