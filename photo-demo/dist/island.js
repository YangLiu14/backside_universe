import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * The small world inside the cup. Units: cup inner radius = 1, sea level = 0.
 * The shore faces +Z. The returned ready promise settles after the asset attempt;
 * the scene is usable immediately with the existing Hi3D cottage fallback.
 */
export async function createHolidayWorld(THREE, parent, options = {}) {
  const group = new THREE.Group();
  group.name = 'A small holiday';
  parent.add(group);
  const fallback = new THREE.Group();
  fallback.name = 'Handmade landscape with Hi3D cottage';
  group.add(fallback);
  const animated = [];
  const palms = [];
  const birdPivots = [];
  const warmLights = [];
  let source = 'procedural';
  let disposed = false;
  let seed = 2804;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const mat = (color, roughness = .8, extras = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extras });
  const materials = {
    wood: mat('#a8865f'), woodEdge: mat('#735b42'), linen: mat('#eee4ce'),
    navy: mat('#486b89'), stone: mat('#cbbca0'), paleStone: mat('#e7dbc0'),
    leaf: mat('#597348', .82, { side: THREE.DoubleSide }),
    leafLight: mat('#75865a', .85, { side: THREE.DoubleSide }),
    pink: mat('#ba677d'), blue: mat('#416b85'), bronze: mat('#9d794f', .45, { metalness: .25 }),
  };
  function mesh(geometry, material, owner, xyz = [0, 0, 0]) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...xyz); object.castShadow = true; object.receiveShadow = true;
    owner.add(object); return object;
  }
  function box(size, material, owner, xyz = [0, 0, 0]) {
    return mesh(new THREE.BoxGeometry(...size), material, owner, xyz);
  }
  function cylinder(rt, rb, h, material, owner, xyz = [0, 0, 0], sides = 20) {
    return mesh(new THREE.CylinderGeometry(rt, rb, h, sides), material, owner, xyz);
  }
  function stone(radius, xyz, scale, owner = fallback, material = materials.stone) {
    const rock = mesh(new THREE.IcosahedronGeometry(radius, 2), material, owner, xyz);
    rock.scale.set(...scale); rock.rotation.set(random() * .4, random() * Math.PI, random() * .3);
    return rock;
  }
  function bar(a, b, radius, material, owner) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const vector = end.clone().sub(start);
    const object = cylinder(radius, radius, vector.length(), material, owner, start.add(end).multiplyScalar(.5).toArray(), 8);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize());
    return object;
  }
  function grainTexture(base, contrast, repeat = 1) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = base; context.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 3500; i++) {
      const pale = random() > .5;
      context.fillStyle = pale ? `rgba(255,255,255,${contrast * random()})` : `rgba(70,55,35,${contrast * random()})`;
      const r = .25 + random(); context.fillRect(random() * 128, random() * 128, r, r);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(repeat, repeat);
    return texture;
  }

  // The surface is a real subdivided disc. CCW indices deliberately face up.
  const rings = 25, segments = 88, seaRadius = .97;
  const positions = [], normals = [], colors = [], indices = [];
  const deep = new THREE.Color('#246e7e'), light = new THREE.Color('#80beb0');
  const tempColor = new THREE.Color();
  for (let r = 0; r <= rings; r++) {
    for (let a = 0; a <= segments; a++) {
      const angle = a / segments * Math.PI * 2, radius = r / rings * seaRadius;
      const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
      positions.push(x, 0, z); normals.push(0, 1, 0);
      const distance = Math.hypot(x / .76, (z + .13) / .6);
      const shallows = 1 - THREE.MathUtils.smoothstep(distance, .75, 1.55);
      tempColor.copy(deep).lerp(light, shallows * .9);
      colors.push(tempColor.r, tempColor.g, tempColor.b);
      if (r < rings && a < segments) {
        const i = r * (segments + 1) + a, j = i + segments + 1;
        // For x=sin(theta), z=cos(theta), the outward/angular order faces +Y.
        indices.push(i, j, i + 1, i + 1, j, j + 1);
      }
    }
  }
  const seaGeo = new THREE.BufferGeometry();
  const seaPositions = new THREE.Float32BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const seaNormals = new THREE.Float32BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage);
  seaGeo.setAttribute('position', seaPositions); seaGeo.setAttribute('normal', seaNormals);
  seaGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); seaGeo.setIndex(indices);
  seaGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.02);
  const seaMaterial = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: .23, metalness: .08, clearcoat: .62,
    clearcoatRoughness: .18, envMapIntensity: .85, side: THREE.DoubleSide,
  });
  const sea = mesh(seaGeo, seaMaterial, group); sea.castShadow = false;
  sea.name = 'Moving turquoise water';
  const bottom = cylinder(.967, .945, .018, mat('#377e83', .35), group, [0, -.019, 0], 96);
  bottom.castShadow = false;
  function wave(x, z, time) {
    const radius = Math.hypot(x, z);
    const edge = THREE.MathUtils.smoothstep(.97 - radius, 0, .12);
    return (.006 * Math.sin(x * 16 + z * 11 - time * 1.3) + .003 * Math.sin(x * -20 + z * 14 - time * .9)) * edge;
  }

  // Two translucent shore washes. No opaque white rings and no texture requests.
  const washes = [];
  for (let w = 0; w < 3; w++) {
    const geo = new THREE.BufferGeometry(), count = 64;
    const attribute = new THREE.Float32BufferAttribute(new Float32Array((count + 1) * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const tint = new THREE.Float32BufferAttribute(new Float32Array((count + 1) * 2 * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const faces = [];
    for (let i = 0; i < count; i++) { const q = i * 2; faces.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    geo.setAttribute('position', attribute); geo.setAttribute('color', tint); geo.setIndex(faces);
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, color: '#e5f2d8', transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide });
    const wash = mesh(geo, material, group); wash.castShadow = wash.receiveShadow = false;
    wash.frustumCulled = false; wash.renderOrder = 2;
    washes.push({ attribute, tint, phase: w / 3, count });
  }

  // Asymmetric, rounded sandstone shoreline. Low relief keeps the ocean visible.
  const coast = new THREE.Shape();
  coast.moveTo(-.64, -.16);
  coast.bezierCurveTo(-.7, .15, -.51, .46, -.2, .48);
  coast.bezierCurveTo(.1, .5, .45, .38, .58, .14);
  coast.bezierCurveTo(.67, -.1, .53, -.35, .27, -.47);
  coast.bezierCurveTo(.06, -.57, -.23, -.49, -.44, -.4);
  coast.bezierCurveTo(-.56, -.33, -.61, -.25, -.64, -.16);
  const sandTexture = grainTexture('#e4d6b4', .22, 2);
  const sandMaterial = new THREE.MeshStandardMaterial({ map: sandTexture, roughness: .94 });
  const coastGeometry = new THREE.ExtrudeGeometry(coast, { depth: .047, bevelEnabled: true, bevelSize: .033, bevelThickness: .023, bevelSegments: 3, steps: 1, curveSegments: 12 });
  coastGeometry.rotateX(-Math.PI / 2);
  const land = mesh(coastGeometry, sandMaterial, fallback, [-.03, .026, -.13]);
  land.name = 'Pale sand and limestone';
  const terrace = cylinder(.36, .41, .065, mat('#d2c4a7'), fallback, [-.075, .104, -.3], 7);
  terrace.rotation.y = .25;
  for (let i = 0; i < 14; i++) {
    const angle = i * 2.399;
    const x = Math.sin(angle) * (.5 + random() * .08) - .02;
    const z = Math.cos(angle) * (.35 + random() * .04) - .16;
    stone(.025 + random() * .032, [x, .048, z], [1.4, .65 + random() * .35, 1], fallback, i % 3 ? materials.stone : materials.paleStone);
  }
  for (let i = 0; i < 6; i++) {
    const step = box([.15, .022, .07], materials.paleStone, fallback, [-.15, .065 + i * .015, .17 - i * .061]);
    step.rotation.y = -.16;
    box([.151, .004, .007], materials.stone, step, [0, .013, .03]);
  }

  const cottageSlot = new THREE.Group(); cottageSlot.position.set(-.11, .137, -.31); fallback.add(cottageSlot);
  // A tiny, detailed architectural fallback also works before the GLB arrives.
  const cottageProxy = new THREE.Group(); cottageSlot.add(cottageProxy);
  const plaster = new THREE.MeshStandardMaterial({ map: grainTexture('#eee5ce', .14, 2), roughness: .96 });
  box([.43, .3, .33], plaster, cottageProxy, [0, .15, 0]);
  const roofShape = new THREE.Shape(); roofShape.moveTo(-.26, 0); roofShape.lineTo(0, .15); roofShape.lineTo(.26, 0); roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: .39, bevelEnabled: false });
  const roof = mesh(roofGeo, mat('#b87653', .88), cottageProxy, [0, .3, -.195]);
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 6; i++) {
      const x = side * (i + .25) * .041;
      const tile = cylinder(.013, .013, .405, mat(i % 2 ? '#ba7955' : '#aa684a', .9), cottageProxy, [x, .452 - Math.abs(x) * .57, 0], 8);
      tile.rotation.x = Math.PI / 2;
    }
  }
  box([.086, .19, .012], materials.blue, cottageProxy, [.055, .095, .172]);
  box([.014, .196, .025], plaster, cottageProxy, [.005, .099, .175]);
  box([.014, .196, .025], plaster, cottageProxy, [.105, .099, .175]);
  box([.114, .016, .025], plaster, cottageProxy, [.055, .196, .175]);
  const glass = new THREE.MeshStandardMaterial({ color: '#cbbf90', emissive: '#e0a057', emissiveIntensity: .18, roughness: .35 });
  for (const x of [-.135, .155]) {
    box([.057, .073, .009], glass, cottageProxy, [x, .186, .171]);
    for (const side of [-1, 1]) box([.025, .078, .013], materials.blue, cottageProxy, [x + side * .043, .185, .177]);
    box([.005, .074, .012], materials.linen, cottageProxy, [x, .185, .177]);
    box([.057, .005, .012], materials.linen, cottageProxy, [x, .185, .177]);
  }
  box([.053, .14, .06], plaster, cottageProxy, [.14, .39, -.09]);
  const windowLight = new THREE.PointLight('#ffc585', .012, .65, 2);
  windowLight.position.set(-.07, .33, -.03); fallback.add(windowLight); warmLights.push(windowLight);

  function makePalm(x, z, height, lean, phase) {
    const palm = new THREE.Group(); palm.position.set(x, .08, z); fallback.add(palm);
    const trunk = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * .2, height * .4, 0),
      new THREE.Vector3(lean * .8, height * .8, -.015), new THREE.Vector3(lean, height, -.02),
    ]);
    mesh(new THREE.TubeGeometry(trunk, 22, .014, 7, false), mat('#aa8a5d'), palm);
    for (let i = 2; i < 13; i++) {
      const p = trunk.getPoint(i / 14);
      const ring = mesh(new THREE.TorusGeometry(.015, .0018, 3, 10), mat('#8c704c'), palm, p.toArray());
      ring.rotation.x = Math.PI / 2;
    }
    const crown = new THREE.Group(); crown.position.set(lean, height, -.02); palm.add(crown);
    for (let j = 0; j < 9; j++) {
      const angle = j * Math.PI * 2 / 9 + phase, length = .31 + random() * .1;
      const points = [], faces = [], segments = 16;
      for (let k = 0; k <= segments; k++) {
        const t = k / segments, distance = length * t;
        const y = .1 * Math.sin(t * Math.PI) - .075 * t * t;
        const width = Math.sin(Math.PI * t) * .032;
        const centralX = Math.cos(angle) * distance, centralZ = Math.sin(angle) * distance;
        for (const side of [-1, 1]) points.push(centralX - Math.sin(angle) * width * side, y - width * .35, centralZ + Math.cos(angle) * width * side);
        if (k < segments) { const q = k * 2; faces.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geo.setIndex(faces); geo.computeVertexNormals();
      const leaf = mesh(geo, j % 3 ? materials.leaf : materials.leafLight, crown); leaf.castShadow = true;
      // The center vein and fine leaflets hold up at the close camera distance.
      const veinPoints = [];
      for (let k = 0; k < 10; k++) { const t = k / 9; veinPoints.push(new THREE.Vector3(Math.cos(angle) * length * t, .1 * Math.sin(t * Math.PI) - .075 * t * t + .002, Math.sin(angle) * length * t)); }
      const vein = new THREE.Line(new THREE.BufferGeometry().setFromPoints(veinPoints), new THREE.LineBasicMaterial({ color: '#85965e', transparent: true, opacity: .5 })); crown.add(vein);
    }
    for (let c = 0; c < 3; c++) stone(.017, [lean + Math.sin(c * 2) * .022, height - .025, -.02 + Math.cos(c * 2) * .022], [1, 1.2, 1], palm, materials.woodEdge);
    palms.push({ crown, phase, palm });
  }
  makePalm(-.46, -.26, .74, .085, .2);
  makePalm(.4, -.41, .67, -.055, 1.6);

  // Flower pots, hillside grass, and a few pink blossoms.
  for (const [x, z] of [[-.36, -.1], [.25, -.37], [.31, -.14]]) {
    const pot = cylinder(.035, .023, .052, mat('#bc8466'), fallback, [x, .108, z], 12);
    for (let k = 0; k < 8; k++) {
      const angle = k * 2.399, radius = .025 * Math.sqrt(k / 8);
      stone(.022, [x + Math.sin(angle) * radius, .145 + random() * .028, z + Math.cos(angle) * radius], [1, .8, 1], fallback, k % 3 === 0 ? materials.pink : materials.leaf);
    }
  }
  const grassPositions = [];
  for (let i = 0; i < 65; i++) {
    const a = random() * Math.PI * 2, radius = .2 + random() * .3;
    const x = Math.cos(a) * radius - .03, z = Math.sin(a) * radius * .65 - .25;
    if (z > -.08) continue;
    grassPositions.push(x, .076, z, x + .006, .09 + random() * .02, z - .008);
  }
  const grassGeo = new THREE.BufferGeometry(); grassGeo.setAttribute('position', new THREE.Float32BufferAttribute(grassPositions, 3));
  fallback.add(new THREE.LineSegments(grassGeo, new THREE.LineBasicMaterial({ color: '#8c9367' })));

  // A wooden deckchair with striped canvas, a book and a folded towel.
  const chair = new THREE.Group(); chair.position.set(.3, .085, .19); chair.rotation.y = -.23; fallback.add(chair);
  for (const x of [-.053, .053]) {
    bar([x, 0, -.07], [x, .07, .075], .005, materials.wood, chair);
    bar([x, 0, .08], [x, .08, -.065], .005, materials.wood, chair);
    bar([x, .06, -.035], [x, .18, -.1], .005, materials.wood, chair);
  }
  box([.109, .006, .11], materials.linen, chair, [0, .071, .025]);
  const chairBack = box([.108, .135, .006], materials.linen, chair, [0, .123, -.066]); chairBack.rotation.x = -.43;
  for (const x of [-.034, 0, .034]) {
    box([.012, .001, .11], materials.navy, chair, [x, .075, .025]);
    box([.012, .135, .001], materials.navy, chairBack, [x, 0, .004]);
  }
  const towel = box([.064, .012, .03], mat('#c6ad83'), chair, [.005, .082, .044]); towel.rotation.y = .16;
  const sideTable = cylinder(.041, .041, .009, materials.wood, fallback, [.47, .125, .26], 20);
  bar([.47, .08, .26], [.47, .12, .26], .008, materials.woodEdge, fallback);
  const book = box([.037, .007, .026], mat('#b96d58'), fallback, [.469, .134, .26]); book.rotation.y = .4;
  cylinder(.007, .006, .012, materials.linen, fallback, [.488, .137, .255], 12);

  const parasol = new THREE.Group(); parasol.position.set(.47, .08, .04); fallback.add(parasol);
  bar([0, 0, 0], [0, .42, 0], .005, materials.wood, parasol);
  const canopy = new THREE.Group(); canopy.position.y = .38; parasol.add(canopy);
  const canopyGeo = new THREE.ConeGeometry(.19, .065, 12, 1, true);
  const canopyMesh = mesh(canopyGeo, materials.linen.clone(), canopy); canopyMesh.material.side = THREE.DoubleSide;
  for (let j = 0; j < 12; j++) {
    const angle = j / 12 * Math.PI * 2;
    bar([0, .033, 0], [Math.sin(angle) * .188, -.032, Math.cos(angle) * .188], .0015, materials.wood, canopy);
    const fringe = box([.026, .014, .002], materials.linen, canopy, [Math.sin(angle) * .184, -.037, Math.cos(angle) * .184]); fringe.rotation.y = angle;
  }
  animated.push({ kind: 'canopy', object: canopy });

  const jetty = new THREE.Group(); jetty.position.set(-.32, .037, .45); jetty.rotation.y = .15; fallback.add(jetty);
  for (let i = 0; i < 9; i++) {
    const plank = box([.13, .012, .027], i % 3 ? materials.wood : materials.woodEdge, jetty, [0, 0, i * .029]);
    for (const x of [-.045, .045]) {
      const nail = cylinder(.0015, .0015, .001, materials.bronze, plank, [x, .0067, 0], 6);
      nail.castShadow = false;
    }
  }
  for (const x of [-.055, .055]) for (const z of [.02, .21]) cylinder(.009, .011, .09, materials.woodEdge, jetty, [x, -.012, z], 9);

  // A little anchored boat provides a readable, slow response to the waves.
  const boat = new THREE.Group(); boat.position.set(.43, .015, .65); boat.rotation.y = -.45; group.add(boat);
  const hullShape = new THREE.Shape(); hullShape.moveTo(0, .09); hullShape.bezierCurveTo(.05, .045, .048, -.055, .025, -.075); hullShape.lineTo(-.025, -.075); hullShape.bezierCurveTo(-.048, -.055, -.05, .045, 0, .09);
  const hullGeo = new THREE.ExtrudeGeometry(hullShape, { depth: .025, bevelEnabled: true, bevelSize: .006, bevelThickness: .006, bevelSegments: 2, curveSegments: 12 }); hullGeo.rotateX(-Math.PI / 2);
  mesh(hullGeo, materials.linen, boat, [0, -.009, 0]);
  box([.064, .008, .018], materials.wood, boat, [0, .023, 0]);
  bar([0, .02, -.015], [0, .19, -.015], .0025, materials.wood, boat);
  const sailGeo = new THREE.BufferGeometry(); sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([.006, .18, -.015, .006, .045, -.015, .006, .045, .075], 3)); sailGeo.computeVertexNormals();
  const sail = mesh(sailGeo, materials.linen.clone(), boat); sail.material.side = THREE.DoubleSide;
  const ropePoints = [new THREE.Vector3(.43, .04, .61), new THREE.Vector3(.31, .015, .59), new THREE.Vector3(.22, .022, .5)];
  const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ropePoints), new THREE.LineBasicMaterial({ color: '#a89370', transparent: true, opacity: .6 })); group.add(rope);
  animated.push({ kind: 'boat', object: boat, x: .43, z: .65 });

  for (let i = 0; i < 2; i++) {
    const pivot = new THREE.Group(); pivot.position.y = 1.08 + i * .07; group.add(pivot);
    const bird = new THREE.Group(); bird.position.set(.22 + i * .1, 0, -.15); pivot.add(bird);
    const wingGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-.025, .005, .006), new THREE.Vector3(-.01, .012, 0),
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(.01, .012, 0), new THREE.Vector3(.025, .005, .006),
    ]);
    bird.add(new THREE.Line(wingGeometry, new THREE.LineBasicMaterial({ color: '#e8e0cf' })));
    birdPivots.push({ pivot, bird, phase: i * 2.3 });
  }

  const loader = options.loader || new GLTFLoader();
  function fitModel(model, maxWidth, maxDepth, maxHeight, y) {
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = Math.min(maxWidth / Math.max(size.x, .001), maxDepth / Math.max(size.z, .001), maxHeight / Math.max(size.y, .001));
    const wrapper = new THREE.Group(); wrapper.add(model);
    model.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z)); wrapper.scale.setScalar(scale); wrapper.position.y = y;
    model.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true; object.receiveShadow = true;
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        if ('roughness' in material) material.roughness = Math.max(.58, material.roughness);
        if ('metalness' in material) material.metalness = Math.min(.08, material.metalness);
        material.envMapIntensity = .6;
      }
    });
    return wrapper;
  }
  async function loadAssets() {
    const islandUrl = options.islandUrl === false ? null : (options.islandUrl || './assets/holiday-island.glb');
    const islandUrls=islandUrl?[islandUrl,options.islandFallbackUrl].filter(Boolean):[];
    for (const url of islandUrls) {
      try {
        const result = await loader.loadAsync(url);
        if (disposed) return;
        const whole = fitModel(result.scene, 1.65, 1.5, 1.25, .035);
        whole.rotation.y = options.islandRotation || 0;
        whole.position.z = -.06;
        whole.name = 'Hi3D miniature holiday island'; group.add(whole); fallback.visible = false;
        source = 'hi3d-island';
        return;
      } catch (error) {
        if (options.onAssetError) options.onAssetError('island', error);
      }
    }
    try {
      const result = await loader.loadAsync(options.houseUrl || './assets/holiday-house.glb');
      if (disposed) return;
      const cottage = fitModel(result.scene, .56, .47, .59, 0);
      cottage.rotation.y = options.houseRotation || 0;
      cottageSlot.add(cottage); cottageProxy.visible = false; source = 'hi3d-house';
    } catch (error) {
      if (options.onAssetError) options.onAssetError('house', error);
    }
  }

  function setLight(value) {
    const amount = THREE.MathUtils.clamp(value, 0, 1);
    for (const light of warmLights) light.intensity = .009 + .025 * amount;
    glass.emissiveIntensity = .12 + .45 * amount;
  }
  function update(time = 0) {
    const values = seaPositions.array, n = seaNormals.array;
    for (let i = 0; i < values.length; i += 3) {
      const x = values[i], z = values[i + 2];
      values[i + 1] = wave(x, z, time);
      const dx = (wave(x + .006, z, time) - wave(x - .006, z, time)) / .012;
      const dz = (wave(x, z + .006, time) - wave(x, z - .006, time)) / .012;
      const length = Math.hypot(dx, 1, dz); n[i] = -dx / length; n[i + 1] = 1 / length; n[i + 2] = -dz / length;
    }
    seaPositions.needsUpdate = seaNormals.needsUpdate = true;
    for (const wash of washes) {
      const phase = (time * .12 + wash.phase) % 1;
      const radius = 1.05 + (1 - phase) * .14;
      const intensity = Math.sin(phase * Math.PI);
      for (let i = 0; i <= wash.count; i++) {
        const u = i / wash.count, angle = (u - .5) * 3.65;
        const jagged = Math.sin(angle * 17 + time * .5) * .007;
        for (let side = 0; side < 2; side++) {
          const r = radius + (side - .5) * .011 + jagged;
          const x = Math.sin(angle) * .6 * r - .03;
          const z = Math.cos(angle) * .49 * r - .13;
          const index = i * 2 + side;
          wash.attribute.setXYZ(index, x, wave(x, z, time) + .006, z);
          const breakup = .45 + .55 * Math.sin(angle * 18 + time * .6) ** 2;
          wash.tint.setXYZW(index, 1, 1, 1, intensity * breakup * Math.sin(u * Math.PI) ** .7);
        }
      }
      wash.attribute.needsUpdate = wash.tint.needsUpdate = true;
    }
    if (fallback.visible) {
      for (const palm of palms) {
        palm.crown.rotation.z = Math.sin(time * .72 + palm.phase) * .025;
        palm.crown.rotation.x = Math.sin(time * .57 + palm.phase) * .018;
      }
    }
    for (const item of animated) {
      if (item.kind === 'boat') {
        item.object.position.y = .012 + wave(item.x, item.z, time);
        item.object.rotation.z = Math.sin(time * 1.2) * .035;
        item.object.rotation.x = Math.sin(time * .92 + .5) * .025;
      } else {
        item.object.rotation.z = Math.sin(time * .7) * .013;
      }
    }
    for (const item of birdPivots) {
      item.pivot.rotation.y = time * .07 + item.phase;
      item.bird.position.y = Math.sin(time * .55 + item.phase) * .025;
    }
  }
  update(0);
  const ready = loadAssets();
  return {
    group, update, setLight, ready,
    get source() { return source; },
    dispose() {
      disposed = true;
      group.traverse(object => {
        if (object.geometry) object.geometry.dispose();
        const objectMaterials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
        for (const material of objectMaterials) { material.map?.dispose(); material.dispose(); }
      });
      group.removeFromParent();
    },
  };
}
