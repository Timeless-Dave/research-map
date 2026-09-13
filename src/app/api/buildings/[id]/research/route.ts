import { NextResponse } from "next/server";
import { getResearchSeed } from "@/lib/research-seed";
import { querySupabase } from "@/lib/supabase-server";
import { isKnownPlaceId } from "@/lib/campus-places.generated";
import { BUILDINGS_SEED } from "@/lib/buildings-seed";
import type { ResearchProject, Researcher } from "@/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: buildingId } = await params;

  // Unknown ids previously returned 200 with empty arrays, which made an
  // arbitrary `?building=` deep link look like a real but empty place.
  if (!isKnownBuildingId(buildingId)) {
    return NextResponse.json({ error: "Building not found" }, { status: 404 });
  }

  const [projects, researchers] = await Promise.all([
    querySupabase((client) =>
      client
        .from("research_projects")
        .select("*")
        .eq("building_id", buildingId)
        .order("status")
    ),
    querySupabase((client) =>
      client
        .from("researchers")
        .select("*")
        .eq("building_id", buildingId)
        .order("name")
    ),
  ]);

  const seed = getResearchSeed(buildingId);
  const payload: {
    projects: ResearchProject[];
    researchers: Researcher[];
    source: "supabase" | "local" | "mixed";
  } = {
    projects: projects ?? seed.projects,
    researchers: researchers ?? seed.researchers,
    source:
      projects && researchers
        ? "supabase"
        : projects || researchers
          ? "mixed"
          : "local",
  };

  return NextResponse.json(payload);
}

function isKnownBuildingId(id: string): boolean {
  if (isKnownPlaceId(id)) return true;
  return BUILDINGS_SEED.some((b) => b.id === id);
}
