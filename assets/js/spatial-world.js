(() => {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mix = (a, b, amount) => a + (b - a) * amount;
  const smoothstep = (edge0, edge1, value) => {
    const t = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Anchor positions for the embedding-space panel, one per land-cover class -
     arranged so clusters don't overlap. These are only the resting point each
     cluster drifts around; the live position is computed per frame in
     updateEmbeddingCentroids so the layout is never actually static. */
  const EMBEDDING_ANCHORS = {
    ground: { x: .22, y: .68 },
    road: { x: .5, y: .82 },
    marking: { x: .58, y: .6 },
    building: { x: .78, y: .28 },
    vegetation: { x: .2, y: .22 },
    street: { x: .42, y: .38 },
    vehicle: { x: .68, y: .58 },
    water: { x: .85, y: .78 }
  };
  const EMBEDDING_LABELS = {
    ground: 'BARE EARTH',
    road: 'IMPERVIOUS SURFACE',
    marking: 'ROAD MARKING',
    building: 'BUILT-UP',
    vegetation: 'VEGETATION',
    street: 'URBAN FURNITURE',
    vehicle: 'VEHICLE',
    water: 'WATER'
  };

  class SpatialWorld {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas.getContext('2d', { alpha: false, desynchronized: true });
      if (!this.context) return;

      this.scene = canvas.dataset.scene || 'hero';
      this.mode = 'aerial';
      this.width = 1;
      this.height = 1;
      this.ratio = 1;
      this.seed = 71993;
      this.points = [];
      this.stars = [];
      this.frame = 0;
      this.lastTime = 0;
      this.visible = true;
      this.documentVisible = !document.hidden;
      this.mobile = window.matchMedia('(max-width: 720px)').matches;
      this.quality = this.getQuality();
      this.pointer = {
        active: false,
        down: false,
        x: .63,
        y: .46,
        smoothX: .63,
        smoothY: .46,
        lastInteraction: 0
      };
      this.camera = null;
      this.cameraRig = null;
      this.swathZ = 0;
      this.aerial = { x: 0, z: -.4, capture: null };
      this.semanticColors = {
        ground: '#7994ad',
        road: '#a6b0bf',
        marking: '#d8e8ee',
        building: '#77b9ef',
        vegetation: '#72dfb2',
        street: '#b6a1e5',
        vehicle: '#ef9e79',
        water: '#58c9df'
      };
      this.readoutCopy = ['Multispectral footprint', 'Move the observation window · click to capture a local sample', 'Remote sensing', 'Move footprint · click to capture'];
      this.embeddingSamples = [];
      this.embeddingScatter = [];
      this.embeddingCentroids = {};
      this.embeddingQuery = { x: .5, y: .5, kind: 'ground' };
      this.embeddingPanelRect = { x: 0, y: 0, width: 0, height: 0 };
      this.pointerOverPanel = false;

      this.generateWorld();
      this.bind();
      this.resize();
      this.updateReadout();
      this.draw(0, true);
    }

    getQuality() {
      const memory = navigator.deviceMemory || 8;
      if (this.mobile || memory <= 4) return .62;
      if (window.innerWidth < 1180) return .82;
      return 1;
    }

    random() {
      this.seed = (this.seed * 16807) % 2147483647;
      return (this.seed - 1) / 2147483646;
    }

    terrainHeight(x, z) {
      return Math.sin(x * .48) * .025 + Math.cos(z * .41) * .022;
    }

    addPoint(x, y, z, kind = 'ground', size = 1, alpha = .56) {
      this.points.push({ x, y, z, kind, size, alpha });
    }

    addBoxSurface(cx, baseY, cz, sx, sy, sz, kind, density = 1) {
      const step = (.105 / this.quality) / density;
      for (let y = step; y <= sy; y += step) {
        for (let x = -sx / 2; x <= sx / 2; x += step) {
          this.addPoint(cx + x, baseY + y, cz - sz / 2, kind, .94, .62);
          this.addPoint(cx + x, baseY + y, cz + sz / 2, kind, .9, .54);
        }
        for (let z = -sz / 2 + step; z < sz / 2; z += step) {
          this.addPoint(cx - sx / 2, baseY + y, cz + z, kind, .9, .56);
          this.addPoint(cx + sx / 2, baseY + y, cz + z, kind, .94, .62);
        }
      }
      for (let x = -sx / 2; x <= sx / 2; x += step * 1.12) {
        for (let z = -sz / 2; z <= sz / 2; z += step * 1.12) {
          this.addPoint(cx + x, baseY + sy, cz + z, kind, .96, .64);
        }
      }
    }

    addBuilding(cx, cz, sx, sz, height, roof = 'flat') {
      const base = this.terrainHeight(cx, cz);
      this.addBoxSurface(cx, base, cz, sx, height, sz, 'building');
      const step = .12 / this.quality;

      if (roof === 'ridge') {
        for (let x = -sx / 2; x <= sx / 2; x += step) {
          for (let z = -sz / 2; z <= sz / 2; z += step) {
            const rise = .28 * (1 - Math.abs(x) / (sx / 2));
            if (this.random() > .18) this.addPoint(cx + x, base + height + rise, cz + z, 'building', .94, .65);
          }
        }
      }

      if (roof === 'tower') {
        const mastTop = height + .72;
        for (let y = height; y <= mastTop; y += step * .7) {
          this.addPoint(cx, base + y, cz, 'street', .82, .7);
        }
      }

      /* Slightly brighter window rows make each façade legible without turning it into a solid mesh. */
      for (let y = .52; y < height - .22; y += .58) {
        for (let x = -sx * .36; x <= sx * .36; x += .28) {
          this.addPoint(cx + x, base + y, cz - sz / 2 - .006, 'building', 1.22, .8);
        }
      }
    }

    addTree(cx, cz, height = 1.12, radius = .43) {
      const base = this.terrainHeight(cx, cz);
      const trunkStep = .075 / this.quality;
      for (let y = 0; y <= height * .52; y += trunkStep) {
        this.addPoint(cx, base + y, cz, 'street', .72, .62);
        if (this.random() > .5) this.addPoint(cx + .025, base + y, cz - .018, 'street', .62, .48);
      }
      const count = Math.round(170 * this.quality);
      for (let index = 0; index < count; index += 1) {
        const theta = this.random() * Math.PI * 2;
        const phi = Math.acos(2 * this.random() - 1);
        const localRadius = radius * Math.cbrt(this.random());
        this.addPoint(
          cx + Math.sin(phi) * Math.cos(theta) * localRadius,
          base + height * .72 + Math.cos(phi) * localRadius * .8,
          cz + Math.sin(phi) * Math.sin(theta) * localRadius,
          'vegetation',
          .95 + this.random() * .28,
          .56 + this.random() * .18
        );
      }
    }

    addStreetlight(cx, cz, direction = 1) {
      const base = this.terrainHeight(cx, cz);
      const step = .065 / this.quality;
      for (let y = 0; y <= 1.28; y += step) this.addPoint(cx, base + y, cz, 'street', .72, .62);
      for (let x = 0; x <= .34; x += step) this.addPoint(cx + direction * x, base + 1.28, cz, 'street', .78, .72);
      this.addPoint(cx + direction * .35, base + 1.24, cz, 'marking', 1.35, .9);
    }

    addVehicle(cx, cz, heading = 1) {
      const base = this.terrainHeight(cx, cz) + .045;
      const sx = heading ? .86 : .46;
      const sz = heading ? .46 : .86;
      this.addBoxSurface(cx, base, cz, sx, .36, sz, 'vehicle', 1.15);
      const wheelOffsetX = sx * .42;
      const wheelOffsetZ = sz * .42;
      [[-wheelOffsetX,-wheelOffsetZ],[wheelOffsetX,-wheelOffsetZ],[-wheelOffsetX,wheelOffsetZ],[wheelOffsetX,wheelOffsetZ]].forEach(([x,z]) => {
        for (let a = 0; a < Math.PI * 2; a += .34) {
          this.addPoint(cx + x, base + .09 + Math.cos(a) * .09, cz + z + Math.sin(a) * .035, 'street', .76, .62);
        }
      });
    }

    generateWorld() {
      const groundStep = .145 / this.quality;
      for (let x = -7.8; x <= 7.8; x += groundStep) {
        for (let z = -8.2; z <= 7.6; z += groundStep) {
          const road = Math.abs(x) < 1.42;
          const sidewalk = Math.abs(x) >= 1.42 && Math.abs(x) < 2.02;
          const plaza = x > 2.02 && x < 4.35 && z > -1.2 && z < 2.3;
          const kind = road ? 'road' : (sidewalk || plaza ? 'ground' : 'ground');
          const density = road ? .93 : (sidewalk || plaza ? .82 : .68);
          if (this.random() > density) continue;
          const y = this.terrainHeight(x, z) + (sidewalk || plaza ? .055 : 0);
          this.addPoint(x, y, z, kind, .72 + this.random() * .34, .34 + this.random() * .19);
        }
      }

      /* Lane markings are points on the road surface, so every bright trace has a real spatial role. */
      const markStep = .075 / this.quality;
      for (let z = -8; z <= 7.4; z += markStep) {
        const broken = Math.floor((z + 8) / 1.15) % 2 === 0;
        if (broken) {
          this.addPoint(-.05, this.terrainHeight(-.05, z) + .028, z, 'marking', .72, .72);
          this.addPoint(.05, this.terrainHeight(.05, z) + .028, z, 'marking', .72, .72);
        }
        this.addPoint(-1.21, this.terrainHeight(-1.21, z) + .025, z, 'marking', .66, .52);
        this.addPoint(1.21, this.terrainHeight(1.21, z) + .025, z, 'marking', .66, .52);
      }

      const buildings = [
        [-5.95,-5.65,2.22,2.15,2.52,'tower'],[-3.28,-5.72,1.95,2.05,1.72,'flat'],
        [3.36,-5.58,2.08,2.22,2.85,'tower'],[5.92,-5.46,2.15,2.34,1.88,'ridge'],
        [-5.72,-2.38,2.36,2.18,1.72,'ridge'],[-3.18,-2.43,1.86,1.98,2.35,'flat'],
        [5.55,-2.34,2.65,2.12,2.18,'flat'],
        [-5.86,1.15,2.15,2.18,2.82,'tower'],[-3.32,1.15,1.95,2.0,1.62,'ridge'],
        [5.75,3.25,2.54,2.35,2.5,'tower'],[-5.46,4.9,2.72,2.28,1.92,'flat'],[-2.85,4.86,1.72,2.08,2.18,'ridge'],
        [3.28,5.0,1.92,2.12,1.78,'flat'],[5.58,5.08,2.18,2.18,2.28,'tower']
      ];
      buildings.forEach((building) => this.addBuilding(...building));

      const treePositions = [
        [-1.86,-6.8],[1.83,-6.15],[-1.84,-4.85],[1.84,-4.15],[-1.83,-2.82],[1.86,-2.15],
        [-1.84,-.55],[1.84,.18],[-1.86,1.68],[1.84,2.45],[-1.84,3.78],[1.84,4.52],
        [-1.84,6.05],[1.84,6.72],[2.75,-.55],[3.75,-.62],[2.72,1.62],[3.78,1.58]
      ];
      treePositions.forEach(([x,z], index) => this.addTree(x, z, 1.02 + (index % 3) * .08, .39 + (index % 2) * .045));

      [-6.2,-3.7,-1.15,1.4,3.95,6.45].forEach((z, index) => {
        this.addStreetlight(-1.66, z, 1);
        if (index % 2 === 0) this.addStreetlight(1.66, z + .72, -1);
      });

      this.addVehicle(-.66, -3.25, 0);
      this.addVehicle(.64, 1.82, 0);
      this.addVehicle(-.62, 5.42, 0);

      for (let index = 0; index < 82; index += 1) {
        this.stars.push({ x: this.random(), y: this.random() * .56, alpha: .025 + this.random() * .12, size: this.random() > .9 ? 1.25 : .65 });
      }

      this.buildEmbeddingField();
    }

    /* A small subsample of the real point cloud (grouped by class, capped per
       class) drives the embedding query each frame - cheap enough to scan every
       frame without walking the full multi-thousand-point city. Scatter dots
       store an offset relative to their cluster's centroid rather than an
       absolute position, so they ride along as the centroid drifts each frame. */
    buildEmbeddingField() {
      const byKind = new Map();
      this.points.forEach((point) => {
        if (!EMBEDDING_ANCHORS[point.kind]) return;
        if (!byKind.has(point.kind)) byKind.set(point.kind, []);
        const list = byKind.get(point.kind);
        if (list.length < 400) list.push(point);
      });

      this.embeddingSamples = [];
      byKind.forEach((list, kind) => {
        const stride = Math.max(1, Math.floor(list.length / 40));
        for (let index = 0; index < list.length; index += stride) {
          this.embeddingSamples.push({ x: list[index].x, z: list[index].z, kind });
        }
      });

      this.embeddingCentroids = {};
      Object.keys(EMBEDDING_ANCHORS).forEach((kind) => {
        const anchor = EMBEDDING_ANCHORS[kind];
        this.embeddingCentroids[kind] = {
          baseX: anchor.x,
          baseY: anchor.y,
          phaseX: this.random() * Math.PI * 2,
          phaseY: this.random() * Math.PI * 2,
          driftAmount: .05 + this.random() * .045,
          x: anchor.x,
          y: anchor.y
        };
      });

      this.embeddingScatter = [];
      Object.keys(EMBEDDING_ANCHORS).forEach((kind) => {
        const count = byKind.has(kind) ? 12 : 5;
        for (let index = 0; index < count; index += 1) {
          const angle = this.random() * Math.PI * 2;
          const radius = .05 + this.random() * .09;
          this.embeddingScatter.push({
            offsetX: Math.cos(angle) * radius,
            offsetY: Math.sin(angle) * radius,
            kind
          });
        }
      });
    }

    /* Slow independent sine/cosine drift per cluster - cheap (8 clusters, one
       trig pair each) but enough that the layout is visibly never at rest. */
    updateEmbeddingCentroids(time) {
      Object.keys(this.embeddingCentroids).forEach((kind) => {
        const centroid = this.embeddingCentroids[kind];
        const t = reducedMotion ? 0 : time;
        centroid.x = clamp(centroid.baseX + Math.sin(t * .00021 + centroid.phaseX) * centroid.driftAmount, .08, .92);
        centroid.y = clamp(centroid.baseY + Math.cos(t * .00017 + centroid.phaseY) * centroid.driftAmount, .08, .92);
      });
    }

    bind() {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas);

      const pointerMove = (event) => {
        const bounds = this.canvas.getBoundingClientRect();
        this.pointer.active = true;
        this.pointer.x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
        this.pointer.y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
        this.pointer.lastInteraction = performance.now();
        if (reducedMotion) this.draw(performance.now(), true);
      };
      this.canvas.addEventListener('pointermove', pointerMove, { passive: true });
      this.canvas.addEventListener('pointerdown', (event) => {
        pointerMove(event);
        this.pointer.down = true;
        this.activateModeInteraction(performance.now());
        if (reducedMotion) this.draw(performance.now(), true);
      }, { passive: true });
      window.addEventListener('pointerup', () => {
        this.pointer.down = false;
        if (reducedMotion) this.draw(performance.now(), true);
      }, { passive: true });
      window.addEventListener('pointercancel', () => {
        this.pointer.down = false;
        if (reducedMotion) this.draw(performance.now(), true);
      }, { passive: true });
      this.canvas.addEventListener('pointerleave', () => {
        this.pointer.active = false;
        this.pointer.down = false;
      });

      this.visibilityObserver = new IntersectionObserver((entries) => {
        this.visible = entries[0]?.isIntersecting ?? true;
        if (this.visible && this.documentVisible && !reducedMotion && !this.frame) {
          this.frame = requestAnimationFrame((time) => this.draw(time));
        }
      }, { threshold: .01 });
      this.visibilityObserver.observe(this.canvas);

      document.addEventListener('visibilitychange', () => {
        this.documentVisible = !document.hidden;
        if (this.documentVisible && this.visible && !reducedMotion && !this.frame) {
          this.frame = requestAnimationFrame((time) => this.draw(time));
        }
      });

    }

    resize() {
      const bounds = this.canvas.getBoundingClientRect();
      this.width = Math.max(1, bounds.width);
      this.height = Math.max(1, bounds.height);
      this.mobile = this.width < 700;
      this.ratio = Math.min(window.devicePixelRatio || 1, this.mobile ? 1.25 : 1.6);
      this.canvas.width = Math.round(this.width * this.ratio);
      this.canvas.height = Math.round(this.height * this.ratio);
      this.context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
      this.cameraRig = null;
      this.updateEmbeddingPanelRect();
      if (reducedMotion) this.draw(performance.now(), true);
    }

    /* The hero canvas is CSS-masked to fade near the left edge on desktop
       (where the hero copy sits) and near the bottom edge on mobile (where the
       layout is stacked), so the panel is anchored differently per breakpoint
       to land somewhere that's actually visible through the mask. Only depends
       on size/breakpoint, so it's recomputed on resize rather than every frame. */
    updateEmbeddingPanelRect() {
      this.embeddingPanelRect = {
        width: this.mobile ? 128 : 158,
        height: this.mobile ? 92 : 112,
        x: this.mobile ? this.width * .06 : this.width * .35,
        y: this.mobile ? this.height * .08 : this.height * .58
      };
    }

    updateReadout() {
      const copy = this.readoutCopy;
      document.querySelectorAll('[data-world-title]').forEach((node) => { node.textContent = copy[0]; });
      document.querySelectorAll('[data-world-detail]').forEach((node) => { node.textContent = copy[1]; });
      document.querySelectorAll('[data-world-status]').forEach((node) => { node.textContent = copy[2]; });
      document.querySelectorAll('[data-world-interaction]').forEach((node) => { node.textContent = copy[3]; });
    }

    groundPointAtScreen(screenX, screenY, groundY = .08) {
      if (!this.camera) return null;
      const cameraX = (screenX - this.camera.centerX) / this.camera.focal;
      const cameraY = -(screenY - this.camera.centerY) / this.camera.focal;
      const ray = {
        x: this.camera.forward.x + this.camera.right.x * cameraX + this.camera.up.x * cameraY,
        y: this.camera.forward.y + this.camera.right.y * cameraX + this.camera.up.y * cameraY,
        z: this.camera.forward.z + this.camera.right.z * cameraX + this.camera.up.z * cameraY
      };
      if (Math.abs(ray.y) < .0001) return null;
      const distance = (groundY - this.camera.position.y) / ray.y;
      if (distance <= 0) return null;
      return {
        x: this.camera.position.x + ray.x * distance,
        y: groundY,
        z: this.camera.position.z + ray.z * distance
      };
    }

    activateModeInteraction(time) {
      if (this.pointerOverPanel) return;
      const ground = this.groundPointAtScreen(this.pointer.x * this.width, this.pointer.y * this.height);
      if (!ground) return;
      this.aerial.x = clamp(ground.x, -5.4, 5.4);
      this.aerial.z = clamp(ground.z, -6.5, 6.5);
      this.aerial.capture = { x: this.aerial.x, z: this.aerial.z, born: time };
    }

    /* Screen-space hit test against wherever the embedding panel last drew
       itself, so hovering/dragging inside it can be handled separately from
       the 3D scene underneath. */
    updatePointerOverPanel() {
      const rect = this.embeddingPanelRect;
      const px = this.pointer.x * this.width;
      const py = this.pointer.y * this.height;
      this.pointerOverPanel = this.pointer.active
        && px >= rect.x && px <= rect.x + rect.width
        && py >= rect.y && py <= rect.y + rect.height;
    }

    normalize(vector) {
      const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
      return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
    }

    cross(a, b) {
      return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
      };
    }

    cameraFor(time) {
      const idleX = .64 + Math.sin(time * .000085) * .085;
      const idleY = .47 + Math.cos(time * .000071) * .055;
      const targetX = this.pointer.active ? this.pointer.x : idleX;
      const targetY = this.pointer.active ? this.pointer.y : idleY;
      const ease = reducedMotion ? 1 : .055;
      this.pointer.smoothX += (targetX - this.pointer.smoothX) * ease;
      this.pointer.smoothY += (targetY - this.pointer.smoothY) * ease;

      const pointerYaw = (this.pointer.smoothX - .57) * 1.28;
      const pointerPitch = (this.pointer.smoothY - .47) * .92;
      let position = { x: 1.7 + pointerYaw * .35, y: 17.4, z: 2.7 + pointerPitch * .18 };
      let target = { x: 0, y: 0, z: -.35 };
      let focal = Math.min(this.width, this.height) * 1.08 * 1.03;
      let centerX = this.scene === 'explorer' ? this.width * .64 : this.width * .57;
      let centerY = this.height * .52;

      if (this.mobile) {
        centerX = this.width * .5;
        centerY = this.height * .51;
        focal *= .73;
        position.x *= 1.08;
        position.z *= 1.08;
      }

      if (!this.cameraRig) {
        this.cameraRig = {
          position: { ...position },
          target: { ...target },
          focal,
          centerX,
          centerY
        };
      } else {
        const rigEase = reducedMotion ? 1 : .085;
        ['x', 'y', 'z'].forEach((axis) => {
          this.cameraRig.position[axis] = mix(this.cameraRig.position[axis], position[axis], rigEase);
          this.cameraRig.target[axis] = mix(this.cameraRig.target[axis], target[axis], rigEase);
        });
        this.cameraRig.focal = mix(this.cameraRig.focal, focal, rigEase);
        this.cameraRig.centerX = mix(this.cameraRig.centerX, centerX, rigEase);
        this.cameraRig.centerY = mix(this.cameraRig.centerY, centerY, rigEase);
      }

      position = { ...this.cameraRig.position };
      target = { ...this.cameraRig.target };
      focal = this.cameraRig.focal;
      centerX = this.cameraRig.centerX;
      centerY = this.cameraRig.centerY;

      const forward = this.normalize({ x: target.x - position.x, y: target.y - position.y, z: target.z - position.z });
      const worldUp = { x: 0, y: 1, z: 0 };
      /* Correct right-handed camera basis: right = forward × worldUp; up = right × forward. */
      const right = this.normalize(this.cross(forward, worldUp));
      const up = this.normalize(this.cross(right, forward));
      this.camera = { position, forward, right, up, focal, centerX, centerY };
    }

    updateModeInteraction(time) {
      const ground = (this.pointer.active && !this.pointerOverPanel)
        ? this.groundPointAtScreen(this.pointer.x * this.width, this.pointer.y * this.height)
        : null;
      const targetX = ground ? clamp(ground.x, -5.4, 5.4) : Math.sin(time * .00019) * 3.8;
      const targetZ = ground ? clamp(ground.z, -6.5, 6.5) : Math.cos(time * .00016 + .7) * 4.8;
      const ease = reducedMotion ? 1 : (this.pointer.active ? .28 : .045);
      this.aerial.x += (targetX - this.aerial.x) * ease;
      this.aerial.z += (targetZ - this.aerial.z) * ease;
      this.swathZ = this.aerial.z;
    }

    /* Two ways to drive the query marker: hovering/dragging directly inside the
       panel moves it to the pointer and snaps the label to the nearest (live,
       drifting) centroid; otherwise it falls back to the footprint-weighted
       average, using the same falloff shape as semanticAmount, so a patch
       straddling two classes sits between their clusters - same as a real
       embedding for a mixed patch would. Either way the target centroids move
       every frame, so the marker is chasing a moving layout, not a fixed one. */
    updateEmbeddingQuery() {
      let targetX = this.embeddingQuery.x;
      let targetY = this.embeddingQuery.y;
      let dominantKind = this.embeddingQuery.kind;
      let ease = reducedMotion ? 1 : .06;

      if (this.pointerOverPanel) {
        const rect = this.embeddingPanelRect;
        const plotX = rect.x + 6;
        const plotY = rect.y + 20;
        const plotW = rect.width - 12;
        const plotH = rect.height - 34;
        targetX = clamp((this.pointer.x * this.width - plotX) / plotW, 0, 1);
        targetY = clamp((this.pointer.y * this.height - plotY) / plotH, 0, 1);

        let bestDistance = Infinity;
        Object.keys(this.embeddingCentroids).forEach((kind) => {
          const centroid = this.embeddingCentroids[kind];
          const distance = Math.hypot(centroid.x - targetX, centroid.y - targetY);
          if (distance < bestDistance) {
            bestDistance = distance;
            dominantKind = kind;
          }
        });
        ease = reducedMotion ? 1 : .32;
      } else {
        const weights = {};
        let totalWeight = 0;
        this.embeddingSamples.forEach((sample) => {
          const footprintDistance = Math.max(
            Math.abs(sample.x - this.aerial.x) / 2.45,
            Math.abs(sample.z - this.aerial.z) / 1.28
          );
          const weight = 1 - smoothstep(.7, 1.15, footprintDistance);
          if (weight <= 0) return;
          weights[sample.kind] = (weights[sample.kind] || 0) + weight;
          totalWeight += weight;
        });

        if (totalWeight > 0) {
          targetX = 0;
          targetY = 0;
          let bestWeight = 0;
          Object.keys(weights).forEach((kind) => {
            const proportion = weights[kind] / totalWeight;
            const centroid = this.embeddingCentroids[kind];
            targetX += centroid.x * proportion;
            targetY += centroid.y * proportion;
            if (weights[kind] > bestWeight) {
              bestWeight = weights[kind];
              dominantKind = kind;
            }
          });
        }
      }

      this.embeddingQuery.x += (targetX - this.embeddingQuery.x) * ease;
      this.embeddingQuery.y += (targetY - this.embeddingQuery.y) * ease;
      this.embeddingQuery.kind = dominantKind;
    }

    project(point) {
      const relative = {
        x: point.x - this.camera.position.x,
        y: point.y - this.camera.position.y,
        z: point.z - this.camera.position.z
      };
      const x = relative.x * this.camera.right.x + relative.y * this.camera.right.y + relative.z * this.camera.right.z;
      const y = relative.x * this.camera.up.x + relative.y * this.camera.up.y + relative.z * this.camera.up.z;
      const depth = relative.x * this.camera.forward.x + relative.y * this.camera.forward.y + relative.z * this.camera.forward.z;
      if (depth < 1.1) return null;
      const scale = this.camera.focal / depth;
      return { x: this.camera.centerX + x * scale, y: this.camera.centerY - y * scale, depth, scale };
    }

    drawBackground(time) {
      const context = this.context;
      const gradient = context.createLinearGradient(0, 0, this.width, this.height);
      gradient.addColorStop(0, '#06080c');
      gradient.addColorStop(.54, this.scene === 'explorer' ? '#07111a' : '#081019');
      gradient.addColorStop(1, '#030609');
      context.fillStyle = gradient;
      context.fillRect(0, 0, this.width, this.height);

      const glow = context.createRadialGradient(this.width * .68, this.height * .43, 20, this.width * .68, this.height * .5, Math.max(this.width, this.height) * .62);
      glow.addColorStop(0, 'rgba(72,126,177,.14)');
      glow.addColorStop(.48, 'rgba(35,69,101,.05)');
      glow.addColorStop(1, 'rgba(3,6,9,0)');
      context.fillStyle = glow;
      context.fillRect(0, 0, this.width, this.height);

      context.save();
      context.fillStyle = '#a8cae7';
      this.stars.forEach((star, index) => {
        context.globalAlpha = star.alpha;
        const drift = reducedMotion ? 0 : Math.sin(time * .00016 + index) * 1.4;
        context.fillRect(star.x * this.width + drift, star.y * this.height, star.size, star.size);
      });
      context.restore();
    }

    semanticAmount(point) {
      const footprintDistance = Math.max(
        Math.abs(point.x - this.aerial.x) / 2.45,
        Math.abs(point.z - this.aerial.z) / 1.28
      );
      return .045 + .955 * (1 - smoothstep(.74, 1, footprintDistance));
    }

    drawPoints(time) {
      const context = this.context;
      const projected = [];
      const semanticBuckets = new Map(Object.keys(this.semanticColors).map((kind) => [kind, []]));

      for (let index = 0; index < this.points.length; index += 1) {
        const point = this.points[index];
        const projection = this.project(point);
        if (!projection || projection.x < -24 || projection.x > this.width + 24 || projection.y < -24 || projection.y > this.height + 24) continue;
        const farFade = clamp(1 - (projection.depth - 11) / 16, .32, 1);
        const size = clamp(point.size * projection.scale * .015, .58, this.mobile ? 1.85 : 2.25);
        const semantic = this.semanticAmount(point);
        const item = { point, projection, farFade, size, semantic };
        projected.push(item);
        semanticBuckets.get(point.kind)?.push(item);
      }

      context.save();
      context.fillStyle = '#8299b0';
      context.globalAlpha = .38;
      projected.forEach(({ point, projection, farFade, size }) => {
        context.globalAlpha = point.alpha * farFade * .58;
        context.fillRect(projection.x, projection.y, size, size);
      });

      semanticBuckets.forEach((items, kind) => {
        context.fillStyle = this.semanticColors[kind];
        items.forEach(({ point, projection, farFade, size, semantic }) => {
          if (semantic < .06) return;
          context.globalAlpha = clamp(point.alpha * farFade * semantic * .92, .035, .92);
          const semanticSize = size * (1 + semantic * .16);
          context.fillRect(projection.x - semanticSize * .08, projection.y - semanticSize * .08, semanticSize, semanticSize);
        });
      });
      context.restore();
    }

    worldCurve(points, style, width = 1, dash = []) {
      const context = this.context;
      context.save();
      context.strokeStyle = style;
      context.lineWidth = width;
      context.setLineDash(dash);
      context.beginPath();
      let started = false;
      points.forEach((point) => {
        const projected = this.project(point);
        if (!projected) return;
        if (!started) {
          context.moveTo(projected.x, projected.y);
          started = true;
        } else {
          context.lineTo(projected.x, projected.y);
        }
      });
      if (started) context.stroke();
      context.restore();
    }

    drawAerialOverlay(time) {
      const context = this.context;
      const halfX = 2.45;
      const halfZ = 1.28;
      const xStops = [0, .25, .5, .75, 1].map((amount) => this.aerial.x - halfX + halfX * 2 * amount);
      const bandColors = [
        'rgba(104,174,230,.085)',
        'rgba(114,222,178,.068)',
        'rgba(190,160,229,.074)',
        'rgba(239,158,121,.06)'
      ];
      for (let index = 0; index < xStops.length - 1; index += 1) {
        const corners = [
          { x: xStops[index], y: .09, z: this.aerial.z - halfZ },
          { x: xStops[index + 1], y: .09, z: this.aerial.z - halfZ },
          { x: xStops[index + 1], y: .09, z: this.aerial.z + halfZ },
          { x: xStops[index], y: .09, z: this.aerial.z + halfZ }
        ].map((corner) => this.project(corner));
        if (corners.some((corner) => !corner)) continue;
        context.save();
        context.beginPath();
        corners.forEach((corner, cornerIndex) => cornerIndex ? context.lineTo(corner.x, corner.y) : context.moveTo(corner.x, corner.y));
        context.closePath();
        context.fillStyle = bandColors[index];
        context.fill();
        context.restore();
      }

      const outline = [
        { x: this.aerial.x - halfX, y: .1, z: this.aerial.z - halfZ },
        { x: this.aerial.x + halfX, y: .1, z: this.aerial.z - halfZ },
        { x: this.aerial.x + halfX, y: .1, z: this.aerial.z + halfZ },
        { x: this.aerial.x - halfX, y: .1, z: this.aerial.z + halfZ },
        { x: this.aerial.x - halfX, y: .1, z: this.aerial.z - halfZ }
      ];
      this.worldCurve(outline, 'rgba(156,231,239,.62)', 1, [4, 5]);

      const centerPoint = this.project({ x: this.aerial.x, y: .13, z: this.aerial.z });
      if (centerPoint) {
        context.save();
        context.strokeStyle = 'rgba(156,231,239,.82)';
        context.lineWidth = .8;
        context.beginPath();
        context.moveTo(centerPoint.x - 8, centerPoint.y); context.lineTo(centerPoint.x - 3, centerPoint.y);
        context.moveTo(centerPoint.x + 3, centerPoint.y); context.lineTo(centerPoint.x + 8, centerPoint.y);
        context.moveTo(centerPoint.x, centerPoint.y - 8); context.lineTo(centerPoint.x, centerPoint.y - 3);
        context.moveTo(centerPoint.x, centerPoint.y + 3); context.lineTo(centerPoint.x, centerPoint.y + 8);
        context.stroke();
        context.restore();
      }

      const labelPoint = this.project({ x: this.aerial.x + halfX, y: .12, z: this.aerial.z + halfZ });
      if (labelPoint) {
        context.save();
        context.fillStyle = 'rgba(202,233,239,.78)';
        context.font = '7px "DM Mono", monospace';
        context.fillText('OBSERVATION FOOTPRINT · RGB / NIR', labelPoint.x - 178, labelPoint.y - 8);
        context.restore();
      }

      if (this.aerial.capture) {
        const progress = reducedMotion ? 0 : clamp((time - this.aerial.capture.born) / 950, 0, 1);
        if (reducedMotion || progress < 1) {
          const expansion = 1 + progress * .22;
          const alpha = reducedMotion ? .68 : (1 - progress) * .78;
          const captureOutline = [
            { x: this.aerial.capture.x - halfX * expansion, y: .14, z: this.aerial.capture.z - halfZ * expansion },
            { x: this.aerial.capture.x + halfX * expansion, y: .14, z: this.aerial.capture.z - halfZ * expansion },
            { x: this.aerial.capture.x + halfX * expansion, y: .14, z: this.aerial.capture.z + halfZ * expansion },
            { x: this.aerial.capture.x - halfX * expansion, y: .14, z: this.aerial.capture.z + halfZ * expansion },
            { x: this.aerial.capture.x - halfX * expansion, y: .14, z: this.aerial.capture.z - halfZ * expansion }
          ];
          this.worldCurve(captureOutline, `rgba(216,244,247,${alpha})`, 1.15);
        }
      }
    }

    drawEmbeddingPanel(time) {
      const context = this.context;
      const { x: panelX, y: panelY, width: panelWidth, height: panelHeight } = this.embeddingPanelRect;
      const hovered = this.pointerOverPanel;

      context.save();
      context.fillStyle = hovered ? 'rgba(10,19,27,.68)' : 'rgba(7,14,20,.55)';
      context.strokeStyle = hovered ? 'rgba(156,231,239,.5)' : 'rgba(156,231,239,.22)';
      context.lineWidth = 1;
      context.beginPath();
      context.roundRect(panelX, panelY, panelWidth, panelHeight, 8);
      context.fill();
      context.stroke();

      context.fillStyle = 'rgba(202,233,239,.7)';
      context.font = '7px "DM Mono", monospace';
      context.fillText(hovered ? 'EMBEDDING SPACE · LIVE' : 'EMBEDDING SPACE', panelX + 8, panelY + 14);

      const plotX = panelX + 6;
      const plotY = panelY + 20;
      const plotW = panelWidth - 12;
      const plotH = panelHeight - 34;

      this.embeddingScatter.forEach((dot) => {
        const centroid = this.embeddingCentroids[dot.kind];
        const dotX = clamp(centroid.x + dot.offsetX, .02, .98);
        const dotY = clamp(centroid.y + dot.offsetY, .02, .98);
        context.fillStyle = this.semanticColors[dot.kind];
        context.globalAlpha = .5;
        context.fillRect(plotX + dotX * plotW - .8, plotY + dotY * plotH - .8, 1.6, 1.6);
      });
      context.globalAlpha = 1;

      const queryX = plotX + this.embeddingQuery.x * plotW;
      const queryY = plotY + this.embeddingQuery.y * plotH;
      const queryColor = this.semanticColors[this.embeddingQuery.kind] || '#9ce7ef';
      const pulse = reducedMotion ? 0 : (Math.sin(time * .0032) + 1) * .5;

      context.strokeStyle = `${queryColor}70`;
      context.lineWidth = .8;
      context.beginPath();
      context.arc(queryX, queryY, 5 + pulse * 2.2, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = queryColor;
      context.beginPath();
      context.arc(queryX, queryY, hovered ? 2.6 : 2.1, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = 'rgba(188,204,218,.68)';
      context.font = '7px "DM Mono", monospace';
      const label = EMBEDDING_LABELS[this.embeddingQuery.kind] || this.embeddingQuery.kind.toUpperCase();
      context.fillText(`→ ${label}`, panelX + 8, panelY + panelHeight - 8);
      context.restore();
    }

    drawFog() {
      const context = this.context;
      const fog = context.createLinearGradient(0, 0, 0, this.height);
      fog.addColorStop(0, 'rgba(3,6,9,0)');
      fog.addColorStop(.76, 'rgba(3,6,9,.015)');
      fog.addColorStop(1, 'rgba(3,6,9,.66)');
      context.fillStyle = fog;
      context.fillRect(0, 0, this.width, this.height);
    }

    draw(time = 0, force = false) {
      this.frame = 0;
      if (!force && (!this.visible || !this.documentVisible)) return;
      if (!force && time - this.lastTime < 30) {
        this.frame = requestAnimationFrame((next) => this.draw(next));
        return;
      }
      this.lastTime = time;
      this.updatePointerOverPanel();
      this.cameraFor(time);
      this.updateModeInteraction(time);
      this.updateEmbeddingCentroids(time);
      this.updateEmbeddingQuery();
      this.drawBackground(time);
      this.drawPoints(time);
      this.drawAerialOverlay(time);
      this.drawFog();
      this.drawEmbeddingPanel(time);
      if (!reducedMotion && this.visible && this.documentVisible) {
        this.frame = requestAnimationFrame((next) => this.draw(next));
      }
    }
  }

  window.SpatialWorld = SpatialWorld;
  document.querySelectorAll('[data-spatial-world]').forEach((canvas) => {
    const world = new SpatialWorld(canvas);
    canvas.spatialWorld = world;
  });
})();
