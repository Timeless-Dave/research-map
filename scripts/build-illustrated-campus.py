"""Blender 5: blender --background --python scripts/build-illustrated-campus.py.

Geometry is authored in local east/north metres, Z up. glTF export converts to
Y up. Exact Web Mercator offsets avoid accumulating alignment error at zoom 20.
All heights and facade rhythms are illustrative estimates, never survey data.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/illustrated'
OUT.mkdir(parents=True, exist_ok=True)
AUTHOR = ROOT / 'assets/illustrated'
AUTHOR.mkdir(parents=True, exist_ok=True)
CONFIG = json.loads((ROOT / 'data/illustrated-config.json').read_text())
ORIGIN = CONFIG['origin']
R = 6371008.8
SCALE = math.cos(math.radians(ORIGIN[1]))

def xy(c):
    return (R * SCALE * math.radians(c[0] - ORIGIN[0]),
            R * SCALE * (math.log(math.tan(math.pi / 4 + math.radians(c[1]) / 2)) -
                         math.log(math.tan(math.pi / 4 + math.radians(ORIGIN[1]) / 2))))

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0

def material(name, rgb):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    m.use_backface_culling = False
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = 0.85
    return m

BRICK = material('Campus brick', (0.52, 0.29, 0.21))
LIGHT = material('STEM pale brick', (0.68, 0.48, 0.35))
ROOF = material('Warm gray roof', (0.48, 0.49, 0.45))
TRIM = material('Limestone trim', (0.88, 0.84, 0.71))
GLASS = material('Muted blue glazing', (0.21, 0.34, 0.38))

def mesh(name, verts, faces, mat, place_id):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj['placeId'] = place_id
    return obj

def prism(name, coords, bottom, top, mat, place_id):
    n = len(coords)
    verts = [(x, y, z) for z in (bottom, top) for x, y in coords]
    faces = [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
    # Triangulate concave roofs explicitly; a single n-gon is not robust in GLB.
    ring = [Vector((x, y, top)) for x, y in coords]
    for tri in tessellate_polygon([ring]):
        faces.append(tuple(n + (v if isinstance(v, int) else min(range(n), key=lambda i: (ring[i]-v).length)) for v in tri))
    return mesh(name, verts, faces, mat, place_id)

DETAIL = {'stem-building': (8.5, LIGHT, 2), 'woodward-hall': (9.0, BRICK, 2),
          'human-sciences-building': (8.0, LIGHT, 2), 'larrison-hall': (8.5, BRICK, 2)}
# Facade rhythms are photo-informed, but spacing and repetition on unseen
# elevations are estimates. No doors or access points are inferred from these.
FACADES = {
    'stem-building': dict(bay=4.5, fraction=.78, sill=.85, glazing=2.65, belt=.28, frame=.10),
    'woodward-hall': dict(bay=3.2, fraction=.42, sill=1.1, glazing=2.5, belt=.18, frame=.10),
    'human-sciences-building': dict(bay=4.2, fraction=.80, sill=1.25, glazing=1.9, belt=.55, frame=.08),
    'larrison-hall': dict(bay=3.5, fraction=.90, sill=.85, glazing=2.7, belt=.20, frame=.09),
}

def facade_panel(pid, name, a, b, normal, start, end, bottom, top, mat, offset):
    """A vertical surface, not a capped prism through the building interior."""
    if end <= start or top <= bottom:
        return
    dx, dy = b[0]-a[0], b[1]-a[1]
    verts = [(a[0]+dx*t+normal[0]*offset, a[1]+dy*t+normal[1]*offset, z)
             for t,z in ((start,bottom),(end,bottom),(end,top),(start,top))]
    mesh(pid+'-'+name, verts, [(0,1,2,3)], mat, pid)

def add_facade(pid, coords, height, floors):
    profile = FACADES[pid]
    signed_area = sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(coords,coords[1:]+coords[:1]))
    if abs(signed_area) < .0001:
        raise ValueError(f'{pid}: degenerate footprint')
    winding = 1 if signed_area > 0 else -1
    for i,a in enumerate(coords):
        b = coords[(i+1)%len(coords)]
        dx,dy = b[0]-a[0], b[1]-a[1]
        length = math.hypot(dx,dy)
        if length < .01:
            continue
        # A true outward edge normal works on concave walls too. A vector from
        # the centroid can point inside the wall, hiding panes or causing flicker.
        normal = (winding*dy/length, -winding*dx/length)
        for z in (.25, height/floors, height-.12):
            facade_panel(pid,'belt',a,b,normal,0,1,z,z+profile['belt'],TRIM,.065)
        # Roof-edge coping: a restrained visible strip, not an invented roof ridge.
        nx,ny = normal
        mesh(pid+'-coping', [(a[0],a[1],height+.36),(b[0],b[1],height+.36),
             (b[0]-nx*.25,b[1]-ny*.25,height+.36),(a[0]-nx*.25,a[1]-ny*.25,height+.36)],
             [(0,1,2,3)],TRIM,pid)
        if length < .8:
            continue
        count = max(1, round(length/profile['bay']))
        for k in range(count):
            t0 = (k+(1-profile['fraction'])/2)/count
            t1 = (k+(1+profile['fraction'])/2)/count
            frame = min(profile['frame']/length, (t1-t0)/6)
            for floor in range(floors):
                z = floor*height/floors+profile['sill']
                top = min(z+profile['glazing'], (floor+1)*height/floors-.35)
                facade_panel(pid,'frames',a,b,normal,t0-frame,t1+frame,z-.10,top+.10,TRIM,.045)
                facade_panel(pid,'windows',a,b,normal,t0,t1,z,top,GLASS,.055)
                mid = (t0+t1)/2
                facade_panel(pid,'mullions',a,b,normal,mid-frame/2,mid+frame/2,z,top,TRIM,.07)
                facade_panel(pid,'transoms',a,b,normal,t0,t1,z+(top-z)*.7,z+(top-z)*.7+.07,TRIM,.07)
features = json.loads((ROOT / 'public/buildings.geojson').read_text())['features']
manifest = []
seen = set()
for f in features:
    p = f.get('properties') or {}
    pid = p.get('building_id')
    g = f.get('geometry') or {}
    if not pid or pid == 'building' or g.get('type') not in ('Polygon', 'MultiPolygon'):
        continue
    polygons = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
    height, wall, floors = DETAIL.get(pid, (6.0, BRICK, 1))
    if pid == 'w-e-o-bryant-bell-tower':
        height = 15.0
    for part, polygon in enumerate(polygons):
        if len(polygon) != 1:
            raise ValueError(f'{pid}: courtyard rings need explicit geometry; refusing to fill them')
        coords = [xy(c) for c in polygon[0][:-1]]
        if len(coords) < 3: continue
        prism(pid + '-walls', coords, 0, height, wall, pid)
        prism(pid + '-roof', coords, height, height + 0.35, ROOF, pid)
        if pid in DETAIL:
            add_facade(pid, coords, height, floors)
    if pid not in seen:
        seen.add(pid)
        manifest.append({'id':pid, 'name':p.get('name',pid), 'heightMetres':height,
                         'heightStatus':'estimated', 'orientationDegrees':0,
                         'coordinates':polygon[0][0], 'footprints':polygons,
                         'detail':'photo-informed approximation' if pid in DETAIL else 'simplified footprint',
                         'roofStatus':'flat-roof simplification; roof profiles not surveyed',
                         'facadeEstimates':FACADES.get(pid),
                         'unseenElevations':'repeated illustrative rhythm, not independently verified' if pid in DETAIL else None,
                         'photoEvidence': f'public/buildings/{pid}/ (exterior reference)' if pid in DETAIL else
                             ('reviewed photographs show interiors, not exterior architecture' if pid.startswith('parker-') else None),
                         'source':p.get('osm_id','buildings.geojson')})

# Merge by material and place to keep draw calls bounded, retaining place IDs.
for pid in sorted(seen):
    for mat in (BRICK,LIGHT,ROOF,TRIM,GLASS):
        objects = [o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('placeId')==pid and o.data.materials[0]==mat]
        if not objects: continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects: o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()

# An editable, immediately renderable authoring scene (not exported to GLB).
bpy.ops.object.camera_add(location=(0, -1000, 1600))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 100, 0))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 1500
camera.data.clip_end = 5000
bpy.context.scene.camera = camera
bpy.ops.object.light_add(type='SUN', location=(-300,-500,1000))
bpy.context.object.data.energy = 2
bpy.context.object.rotation_euler = (math.radians(25), math.radians(-20), math.radians(-35))
bpy.context.scene.world.color = (0.35,0.35,0.35)
bpy.context.scene.render.resolution_x = 1600
bpy.context.scene.render.resolution_y = 1200
bpy.ops.wm.save_as_mainfile(filepath=str(AUTHOR/'campus.blend'))
for level, filename in [('base','campus.glb'),('detail','detail.glb')]:
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH': continue
        detail = obj.data.materials[0] in (TRIM,GLASS)
        obj.select_set(detail == (level == 'detail'))
    bpy.ops.export_scene.gltf(filepath=str(OUT/filename), export_format='GLB', export_extras=True, use_selection=True)
(OUT/'manifest.json').write_text(json.dumps({**CONFIG,
    'buildings':sorted(manifest,key=lambda p:p['id'])}, indent=2)+'\n')
print('Exported',len(manifest),'places;', (OUT/'campus.glb').stat().st_size,'bytes')
