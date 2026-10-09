import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { usePlot } from "../../geometry/plot/PlotContext";
import { useUnits } from "../../geometry/units/UnitContext";
import { downloadBlob } from "../../lib/sitePlanExport";
import { buildScene, disposeScene } from "./house3d/buildScene";

type ViewPreset = "iso" | "top" | "front" | "side";

interface Engine {
  renderer: THREE.WebGLRenderer;
  labels: CSS2DRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  sun: THREE.DirectionalLight;
  ground: THREE.Mesh;
  requestRender: () => void;
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Interactive WebGL model of the site and house, generated from the 2D plan. */
export function House3DModule() {
  const { plot, compassRotation, floorPlans, groundLevel, setbackDistances, buildableCorners, siteFeatures, building, activeProjectName } = usePlot();
  const { format, unitSystem } = useUnits();
  const metric = unitSystem === "metric";
  const unitScale = metric ? 1000 : 304.8;
  const unitLabel = metric ? "m" : "ft";
  const [wallHeightMm, setWallHeightMm] = useState(10 * 304.8);
  const [stiltHeightMm, setStiltHeightMm] = useState(10 * 304.8);
  const [plinthHeightMm, setPlinthHeightMm] = useState(1.5 * 304.8);
  const [pillarSpacingMm, setPillarSpacingMm] = useState(12 * 304.8);
  const [pillarLayout, setPillarLayout] = useState<"eight" | "grid">("eight");
  const [removedPillarIds, setRemovedPillarIds] = useState<string[]>([]);
  const [selectedPillarId, setSelectedPillarId] = useState<string | null>(null);
  const [showRoof, setShowRoof] = useState(false);
  const [showSiteFeatures, setShowSiteFeatures] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [levelLimit, setLevelLimit] = useState<number | "all">("all");
  const [cameraHeading, setCameraHeading] = useState(0);
  const [webglSupported] = useState(webglAvailable);
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const needsFramingRef = useRef(true);

  const levels = useMemo(() => [groundLevel, ...floorPlans], [groundLevel, floorPlans]);
  const visibleLevelCount = levelLimit === "all" ? levels.length : Math.min(levelLimit, levels.length);
  const hasSetback = setbackDistances.some(distance => distance > 0);
  const roomCount = levels.reduce((sum, level) => sum + level.rooms.length, 0);
  const openingCount = levels.reduce((sum, level) => sum + level.openings.length, 0);

  const model = useMemo(() => buildScene({
    corners: plot.corners,
    setbackCorners: buildableCorners,
    hasSetback,
    siteFeatures,
    groundLevel,
    upperLevels: floorPlans,
    fallbackFootprint: building,
    compassRotation,
    wallHeightMm,
    stiltHeightMm,
    plinthHeightMm,
    pillarLayout,
    pillarSpacingMm,
    removedPillarIds,
    selectedPillarId,
    showRoof,
    showSiteFeatures,
    showLabels,
    visibleLevelCount,
    formatLength: format,
  }), [plot.corners, buildableCorners, hasSetback, siteFeatures, groundLevel, floorPlans, building, compassRotation, wallHeightMm, stiltHeightMm, plinthHeightMm, pillarLayout, pillarSpacingMm, removedPillarIds, selectedPillarId, showRoof, showSiteFeatures, showLabels, visibleLevelCount, format]);

  const frameView = useCallback((preset: ViewPreset = "iso") => {
    const engine = engineRef.current;
    if (!engine) return;
    const sphere = model.bounds.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 5);
    const distance = radius / Math.sin((engine.camera.fov * Math.PI) / 360) * 1.05;
    // Directions are in plan terms: plan-up is scene -Z.
    const direction = preset === "top" ? new THREE.Vector3(0, 1, 0.0001)
      : preset === "front" ? new THREE.Vector3(0, 0.35, 1)
      : preset === "side" ? new THREE.Vector3(1, 0.35, 0)
      : new THREE.Vector3(0.75, 0.75, 1);
    engine.controls.target.copy(sphere.center);
    engine.camera.position.copy(sphere.center).addScaledVector(direction.normalize(), distance);
    engine.camera.near = Math.max(0.05, distance / 500);
    engine.camera.far = distance * 20;
    engine.camera.updateProjectionMatrix();
    engine.controls.update();
    engine.requestRender();
  }, [model]);

  // One-time renderer, camera, controls and lighting setup.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !webglSupported) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "block h-full w-full touch-none";
    mount.appendChild(renderer.domElement);
    const labels = new CSS2DRenderer();
    labels.domElement.className = "pointer-events-none absolute inset-0";
    mount.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e8eef3");
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.screenSpacePanning = true;

    scene.add(new THREE.HemisphereLight("#ffffff", "#a3b18a", 1.4));
    const sun = new THREE.DirectionalLight("#fff6e5", 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    scene.add(sun, sun.target);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: "#d6e2cf", roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.31;
    ground.receiveShadow = true;
    scene.add(ground);

    let frame = 0;
    let lastHeading = Number.NaN;
    const render = () => {
      frame = 0;
      controls.update();
      renderer.render(scene, camera);
      labels.render(scene, camera);
      const heading = Math.round(controls.getAzimuthalAngle() * 180 / Math.PI);
      if (heading !== lastHeading) { lastHeading = heading; setCameraHeading(heading); }
    };
    const requestRender = () => { if (!frame) frame = requestAnimationFrame(render); };
    controls.addEventListener("change", requestRender);
    const resize = () => {
      const { clientWidth: width, clientHeight: height } = mount;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      labels.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      requestRender();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    engineRef.current = { renderer, labels, scene, camera, controls, sun, ground, requestRender };
    resize();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
      engineRef.current = null;
      needsFramingRef.current = true;
    };
  }, [webglSupported]);

  // Swap the model whenever the plan or display options change.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.scene.add(model.root);
    const sphere = model.bounds.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 5);
    engine.ground.scale.set(radius * 8, radius * 8, 1);
    engine.ground.position.x = sphere.center.x;
    engine.ground.position.z = sphere.center.z;
    // Sun from the south-east of project north, high enough to read the massing.
    const sunAzimuth = (compassRotation + 150) * Math.PI / 180;
    engine.sun.target.position.copy(sphere.center);
    engine.sun.position.set(sphere.center.x + Math.sin(sunAzimuth) * radius * 2, sphere.center.y + radius * 2.4, sphere.center.z - Math.cos(sunAzimuth) * radius * 2);
    const shadow = engine.sun.shadow.camera;
    shadow.left = shadow.bottom = -radius * 1.4;
    shadow.right = shadow.top = radius * 1.4;
    shadow.near = 0.1;
    shadow.far = radius * 6;
    shadow.updateProjectionMatrix();
    if (needsFramingRef.current) { needsFramingRef.current = false; frameView("iso"); }
    engine.requestRender();
    return () => {
      engine.scene.remove(model.root);
      disposeScene(model.root);
    };
  }, [model, compassRotation, frameView]);

  const removePillar = useCallback((id: string | null) => {
    if (!id) return;
    setRemovedPillarIds(current => current.includes(id) ? current : [...current, id]);
    setSelectedPillarId(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input,select,textarea,[contenteditable=true]")) return;
      if (selectedPillarId) { event.preventDefault(); removePillar(selectedPillarId); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedPillarId, removePillar]);

  const pickPillar = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerDownRef.current;
    pointerDownRef.current = null;
    const engine = engineRef.current;
    if (!start || !engine || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const rect = engine.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, engine.camera);
    const hit = raycaster.intersectObjects(model.pickables, false)[0];
    setSelectedPillarId(hit ? String(hit.object.userData.pillarId) : null);
  };

  const exportImage = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.renderer.render(engine.scene, engine.camera);
    const safeName = activeProjectName.trim().replace(/[^a-z0-9-_]+/gi, "-") || "site-plan";
    engine.renderer.domElement.toBlob(blob => { if (blob) downloadBlob(blob, `${safeName}-3d.png`); }, "image/png");
  };

  const lengthInput = (label: string, valueMm: number, setValue: (mm: number) => void, min: number, max: number) => (
    <label className="flex items-center gap-1.5 text-slate-600">{label}
      <input aria-label={`${label} in ${unitLabel}`} type="number" min={(min / unitScale).toFixed(1)} max={(max / unitScale).toFixed(1)} step={metric ? 0.1 : 0.5} value={Number((valueMm / unitScale).toFixed(2))}
        onChange={event => { const value = Number(event.target.value) * unitScale; if (Number.isFinite(value) && value >= min && value <= max) setValue(value); }}
        className="w-16 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-800" /> {unitLabel}
    </label>
  );

  const buttonClass = (active: boolean) => `rounded-md border px-2.5 py-1 font-medium transition ${active ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;

  return <div className="flex h-full min-h-0 flex-col bg-[#eef1f4]">
    <div className="z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-4 py-2.5 text-[11px] shadow-sm">
      {lengthInput("Wall height", wallHeightMm, setWallHeightMm, 2100, 6100)}
      {lengthInput("Stilt height", stiltHeightMm, setStiltHeightMm, 1800, 6100)}
      {lengthInput("Plinth", plinthHeightMm, setPlinthHeightMm, 0, 1800)}
      <label className="flex items-center gap-1.5 text-slate-600">Pillars <select aria-label="Pillar arrangement" value={pillarLayout} onChange={event => { setPillarLayout(event.target.value as "eight" | "grid"); setRemovedPillarIds([]); setSelectedPillarId(null); }} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-800"><option value="eight">8-column layout</option><option value="grid">Automatic grid</option></select></label>
      {pillarLayout === "grid" && lengthInput("Spacing", pillarSpacingMm, setPillarSpacingMm, 1800, 9200)}
      <label className="flex items-center gap-1.5 text-slate-600">Show <select aria-label="Levels to show" value={String(levelLimit)} onChange={event => setLevelLimit(event.target.value === "all" ? "all" : Number(event.target.value))} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-800"><option value="all">All levels</option>{levels.map((level, index) => <option key={level.id} value={index + 1}>{index === 0 ? "Ground / stilt only" : `Up to ${level.name}`}</option>)}</select></label>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" aria-pressed={showRoof} onClick={() => setShowRoof(value => !value)} className={buttonClass(showRoof)}>Roof</button>
        <button type="button" aria-pressed={showSiteFeatures} onClick={() => setShowSiteFeatures(value => !value)} className={buttonClass(showSiteFeatures)}>Site features</button>
        <button type="button" aria-pressed={showLabels} onClick={() => setShowLabels(value => !value)} className={buttonClass(showLabels)}>Labels</button>
      </div>
    </div>
    <div className="relative min-h-0 flex-1 overflow-hidden">
      {webglSupported
        ? <div ref={mountRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" onPointerDown={event => { pointerDownRef.current = { x: event.clientX, y: event.clientY }; }} onPointerUp={pickPillar} />
        : <div className="grid h-full place-items-center p-6 text-center text-sm text-slate-600">3D view needs WebGL, which is unavailable in this browser. The 2D plan and reports still work.</div>}

      <div className="absolute left-3 top-3 flex flex-col gap-1.5">
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white/90 p-1 text-[11px] shadow-sm backdrop-blur">
          {([["iso", "3D"], ["top", "Top"], ["front", "Front"], ["side", "Side"]] as [ViewPreset, string][]).map(([preset, text]) => <button key={preset} type="button" onClick={() => frameView(preset)} className="rounded px-2 py-1 font-medium text-slate-700 hover:bg-slate-100">{text}</button>)}
          <button type="button" onClick={exportImage} className="rounded px-2 py-1 font-medium text-blue-700 hover:bg-blue-50" title="Download the current 3D view as a PNG image">PNG</button>
        </div>
        <p className="rounded-md bg-white/80 px-2 py-1 text-[10px] text-slate-500 backdrop-blur">Drag to orbit · right-drag to pan · scroll to zoom · click a pillar to select it</p>
      </div>

      <div className="absolute right-3 top-3 flex items-center gap-2 rounded-xl border border-white/80 bg-white/85 px-3 py-2 shadow-sm backdrop-blur" aria-label={`North is ${compassRotation} degrees clockwise from plan up`}>
        <svg viewBox="0 0 56 56" className="size-11" role="img" aria-label="North compass relative to the current view">
          <circle cx="28" cy="28" r="23" fill="#f8fafc" stroke="#cbd5e1" />
          <g transform={`rotate(${compassRotation + cameraHeading} 28 28)`}><path d="M28 10 L34 30 L28 27 L22 30 Z" fill="#dc2626" /><path d="M28 46 L22 26 L28 29 L34 26 Z" fill="#94a3b8" /><text x="28" y="8" textAnchor="middle" fontSize="7" fontWeight="700" fill="#334155">N</text></g>
          <circle cx="28" cy="28" r="2" fill="#334155" />
        </svg>
        <div className="text-[10px] leading-tight text-slate-600"><b className="block text-xs text-slate-800">North</b>{compassRotation}° from plan-up</div>
      </div>

      {selectedPillarId && <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-1.5 text-[11px] text-amber-900 shadow-sm">
        Pillar {selectedPillarId.replaceAll("-", " ")} selected
        <button type="button" onClick={() => removePillar(selectedPillarId)} className="rounded border border-red-200 bg-white px-2 py-0.5 font-medium text-red-700 hover:bg-red-50">Remove</button>
        <button type="button" onClick={() => setSelectedPillarId(null)} className="rounded px-1.5 py-0.5 text-amber-800 hover:bg-amber-100" aria-label="Clear pillar selection">×</button>
      </div>}
      {model.removedCount > 0 && <div role="status" className="absolute left-1/2 top-14 flex max-w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50/95 px-3 py-1.5 text-center text-[11px] font-medium text-amber-950 shadow-md">
        <span>{model.removedCount} support{model.removedCount === 1 ? "" : "s"} removed · conceptual lean preview {model.leanDegrees.toFixed(1)}°. Not a structural analysis.</span>
        <button type="button" onClick={() => setRemovedPillarIds(current => current.slice(0, -1))} className="shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 text-amber-900 hover:bg-amber-100">Restore last</button>
      </div>}

      <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5 text-[10px] font-medium text-slate-600">
        {[`Stilt + ${floorPlans.length} ${floorPlans.length === 1 ? "floor" : "floors"}`, roomCount ? `${roomCount} spaces` : "No rooms yet · showing footprint", `${openingCount} openings`, `${model.pillarCount}/${model.totalPillars} pillars`].map(text => <span key={text} className="rounded-full border border-white/80 bg-white/85 px-2.5 py-1 shadow-sm backdrop-blur">{text}</span>)}
      </div>
      <div className="absolute bottom-3 right-3 max-w-64 rounded-lg border border-slate-200/70 bg-white/75 px-3 py-1.5 text-right text-[10px] leading-relaxed text-slate-500 backdrop-blur">Concept visualization. Structural sizing and engineering are not included.</div>
    </div>
  </div>;
}
