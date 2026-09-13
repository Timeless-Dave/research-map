import { MercatorCoordinate, type CustomLayerInterface, type Map, type MapMouseEvent } from 'maplibre-gl';
import { AmbientLight, Camera, DirectionalLight, Matrix4, Mesh, Raycaster, Scene, Vector3, WebGLRenderer, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import config from '../../data/illustrated-config.json';

/** Blender exports X east, Y up, Z south. This transform is exact in Mercator. */
export function createIllustratedLayer(onReady: () => void, onFailure: () => void, onSelect: (id: string) => void, onDetailFailure: () => void): CustomLayerInterface {
  const scene = new Scene();
  const camera = new Camera();
  let renderer: WebGLRenderer;
  let map: Map;
  let disposed = false;
  let loaded = false;
  let detailRequested = false;
  let detailScene: Object3D | undefined;
  let renderFailed = false;
  const controller = new AbortController();
  const raycaster = new Raycaster();
  function selectModel(e: MapMouseEvent) {
    if (!loaded || disposed || map.queryRenderedFeatures(e.point, { layers: ['pins-layer', 'pins-layer-secondary', 'pins-layer-selected'] }).length) return;
    const x = e.point.x / map.getCanvas().clientWidth * 2 - 1;
    const y = 1 - e.point.y / map.getCanvas().clientHeight * 2;
    const inverse = camera.projectionMatrix.clone().invert();
    const near = new Vector3(x,y,-1).applyMatrix4(inverse);
    const far = new Vector3(x,y,1).applyMatrix4(inverse);
    raycaster.set(near, far.sub(near).normalize());
    const hit = raycaster.intersectObjects(scene.children, true).find(candidate => {
      let object: Object3D | null = candidate.object;
      while (object) {
        if (!object.visible) return false;
        object = object.parent;
      }
      return true;
    });
    let object: Object3D | undefined = hit?.object;
    while (object && !object.userData.placeId) object = object.parent ?? undefined;
    if (object?.userData.placeId) {
      map.getContainer().dataset.lastModelSelection = String(object.userData.placeId);
      onSelect(String(object.userData.placeId));
    }
  }
  async function loadAsset(url: string) {
    const request = new AbortController();
    const abort = () => request.abort();
    controller.signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 15000);
    return fetch(url, { signal: request.signal })
      .then(r => { if (!r.ok) throw new Error('Model unavailable'); return r.arrayBuffer(); })
      .then(buffer => new GLTFLoader().parseAsync(buffer, '/illustrated/'))
      .then(gltf => {
        scene.add(gltf.scene);
        if (disposed) { disposeScene(); return; }
        map.triggerRepaint();
        return gltf.scene;
      }).finally(() => {
        clearTimeout(timeout);
        controller.signal.removeEventListener('abort', abort);
      });
  }
  function loadDetail() {
    if (!loaded || detailRequested || map.getZoom() < config.detailMinZoom) return;
    detailRequested = true;
    map.getContainer().dataset.modelDetail = 'loading';
    void loadAsset(config.detailAsset).then(root => {
      if (disposed) return;
      detailScene = root;
      map.getContainer().dataset.modelDetail = 'ready';
      syncDetailVisibility();
    }).catch(() => { if (!disposed) {
      map.getContainer().dataset.modelDetail = 'error';
      onDetailFailure();
    } });
  }
  function syncDetailVisibility() {
    if (!detailScene) return;
    detailScene.visible = map.getZoom() >= config.detailMinZoom;
    map.getContainer().dataset.modelDetailVisible = String(detailScene.visible);
  }
  const origin = MercatorCoordinate.fromLngLat(config.origin as [number, number]);
  const s = origin.meterInMercatorCoordinateUnits();
  const transform = new Matrix4().makeTranslation(origin.x, origin.y, 0)
    .multiply(new Matrix4().makeScale(s, -s, s))
    .multiply(new Matrix4().makeRotationAxis(new Vector3(1, 0, 0), Math.PI / 2));
  function disposeScene() {
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      }
    });
    scene.clear();
  }
  return {
    id: 'illustrated-buildings', type: 'custom', renderingMode: '3d',
    onAdd(host, gl) {
      map = host;
      renderer = new WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
      renderer.autoClear = false;
      scene.add(new AmbientLight(0xffffff, 1.6));
      const sun = new DirectionalLight(0xfff3d6, 1.8);
      sun.position.set(-300, 500, 200);
      scene.add(sun);
      map.on('zoomend', loadDetail);
      map.on('zoom', syncDetailVisibility);
      map.on('click', selectModel);
      map.getContainer().dataset.models = 'loading';
      void loadAsset(config.asset)
        .then(() => {
          if (disposed) return;
          loaded = true;
          map.getContainer().dataset.models = 'ready';
          onReady();
          map.triggerRepaint();
          loadDetail();
        })
        .catch(() => { if (!disposed) onFailure(); });
    },
    render(_gl, { defaultProjectionData }) {
      if (!loaded || disposed || renderFailed) return;
      try {
        camera.projectionMatrix.fromArray(defaultProjectionData.mainMatrix).multiply(transform);
        renderer.resetState();
        renderer.render(scene, camera);
      } catch {
        renderFailed = true;
        queueMicrotask(() => { if (!disposed) onFailure(); });
      } finally { renderer.resetState(); }
    },
    onRemove() {
      disposed = true;
      controller.abort();
      map.off('zoomend', loadDetail);
      map.off('zoom', syncDetailVisibility);
      map.off('click', selectModel);
      delete map.getContainer().dataset.models;
      delete map.getContainer().dataset.modelDetail;
      delete map.getContainer().dataset.modelDetailVisible;
      disposeScene();
      renderer?.dispose();
    },
  };
}
