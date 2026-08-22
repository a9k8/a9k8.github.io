// Interactive 3D "latent embedding space" background (Three.js) - a navigable point
// cloud standing in for learned representations: separate clusters per modality
// (SAR / optical / hyperspectral) with faint pulsing links converging on a shared
// "joint embedding" cluster, illustrating cross-modal alignment via self-supervised
// representation learning. Replaces the previous rotating-globe background.

(function initEmbeddingSpace() {
    const container = document.getElementById('embedding-container');
    if (!container || typeof THREE === 'undefined') return;

    const CLUSTERS = [
        { name: 'SAR embeddings', color: 0x4ec9b0, center: new THREE.Vector3(-5.5, 1.6, -1.5), spread: 2.1, count: 320 },
        { name: 'Optical embeddings', color: 0xf0a94e, center: new THREE.Vector3(5.5, 1.9, -1), spread: 2.1, count: 320 },
        { name: 'Hyperspectral embeddings', color: 0xff6b9d, center: new THREE.Vector3(0, -3.4, 2.2), spread: 1.9, count: 280 },
        { name: 'LiDAR / elevation embeddings', color: 0x6bcf7f, center: new THREE.Vector3(-5.8, -2.5, 2.0), spread: 1.9, count: 260 },
        { name: 'Temporal embeddings', color: 0x3498db, center: new THREE.Vector3(5.8, -2.3, 1.8), spread: 1.9, count: 260 },
        { name: 'Text embeddings', color: 0x9b59b6, center: new THREE.Vector3(0, 4.0, -2.0), spread: 1.8, count: 240 },
        { name: 'Joint embedding space', color: 0xffffff, center: new THREE.Vector3(0, 0.6, 0), spread: 1.2, count: 220 }
    ];
    const JOINT_CLUSTER_INDEX = CLUSTERS.length - 1;

    const POINT_SIZE = 0.16;
    const MAX_LINKS = 450;
    const LINK_SPAWN_INTERVAL = 550; // ms

    // Box-Muller transform - gives clusters a denser core / tapering edge instead
    // of a uniform cube, so they read as organic "distributions" not blocks.
    function randomGaussian() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    const scene = new THREE.Scene();
    // Fades distant points/lines toward the page's own background color, giving
    // the scene real depth instead of everything reading at the same distance.
    scene.fog = new THREE.Fog(0x1e1e1e, 10, 28);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 14);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // Everything rotates together as one unit, same drag/momentum model as the
    // previous globe background.
    const sceneGroup = new THREE.Group();
    scene.add(sceneGroup);

    // Soft round glow sprite, generated on the fly (no image asset) so each point
    // reads as a small glowing node rather than a hard square/circle.
    function makeGlowTexture() {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        return new THREE.CanvasTexture(canvas);
    }

    // Build one merged point cloud across all clusters (single draw call), while
    // keeping per-cluster index ranges for hover/links.
    const positions = [];
    const colors = [];
    const clusterIndexRanges = []; // [start, end) per cluster, into the flat point arrays
    let pointCount = 0;

    CLUSTERS.forEach((cluster, ci) => {
        const start = pointCount;
        const color = new THREE.Color(cluster.color);
        for (let i = 0; i < cluster.count; i++) {
            const x = cluster.center.x + randomGaussian() * cluster.spread;
            const y = cluster.center.y + randomGaussian() * cluster.spread;
            const z = cluster.center.z + randomGaussian() * cluster.spread;
            positions.push(x, y, z);
            colors.push(color.r, color.g, color.b);
            pointCount++;
        }
        clusterIndexRanges.push([start, pointCount]);
    });

    const positionArray = new Float32Array(positions); // final "trained" resting positions - links/sweep always target these
    const colorArray = new Float32Array(colors);
    const baseColorArray = colorArray.slice(); // untouched reference the "active glow" lerp resets back to

    // Each cluster's color as HSL, used by the hover-glow below to brighten by
    // raising lightness rather than multiplying RGB - scaling RGB channels
    // directly pushes the weakest channel (e.g. red in teal) up to meet the
    // others, and once every channel clips at 1.0 the result is just white
    // regardless of hue. Lightness-boosting keeps the actual hue intact.
    const clusterBaseHSL = CLUSTERS.map((cluster) => {
        const hsl = {};
        new THREE.Color(cluster.color).getHSL(hsl);
        return hsl;
    });

    // One-time "training converges" intro: points start scattered almost
    // randomly across the whole scene, then settle into their cluster
    // positions over a couple seconds - representations starting unstructured
    // and training organizing them, without needing any text to explain it.
    const INTRO_DURATION = 3000; // ms
    const introStartArray = new Float32Array(positionArray.length);
    const SCATTER_EXTENT = new THREE.Vector3(9, 6.5, 5.5);
    for (let i = 0; i < pointCount; i++) {
        introStartArray[i * 3] = (Math.random() * 2 - 1) * SCATTER_EXTENT.x;
        introStartArray[i * 3 + 1] = (Math.random() * 2 - 1) * SCATTER_EXTENT.y;
        introStartArray[i * 3 + 2] = (Math.random() * 2 - 1) * SCATTER_EXTENT.z;
    }
    // The geometry displays this array, which starts equal to the scatter and
    // is animated toward positionArray during the intro, then continuously
    // driven by breathing/repel afterward. positionArray itself is never
    // mutated - it's the fixed "resting" reference every other system reads.
    const displayPositionArray = introStartArray.slice();

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(displayPositionArray, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

    const glowTexture = makeGlowTexture(); // shared by the point cloud and the traveling signal sprites

    const material = new THREE.PointsMaterial({
        size: POINT_SIZE,
        map: glowTexture,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
    });

    const points = new THREE.Points(geometry, material);
    sceneGroup.add(points);

    const colorAttr = geometry.attributes.color; // shared by the glow lerp and the breathing effect below

    // Per-point "active glow" state: hovered/linked points briefly lerp toward
    // white and back, reusing the color attribute (no custom shader needed).
    const activeGlow = new Float32Array(pointCount); // 0..1 intensity, decays each frame
    let hoveredIndex = -1;

    function pulsePoint(index, intensity) {
        activeGlow[index] = Math.max(activeGlow[index], intensity);
    }

    // The glow lerp's "resting" color to lerp from/back to - normally just
    // baseColorArray, but a breathing cluster (below) brightens/dims this so
    // glow flashes still layer correctly on top of the current breath phase.
    const currentBaseArray = baseColorArray.slice();

    // Cluster-wide "breathing": every so often, a random cluster's points all
    // brighten and dim together as one slow pulse, like the whole cluster is
    // breathing - distinct from individual point glow (hover/links/repel),
    // which still flashes independently on top of whatever the breath is doing.
    const activeBreaths = []; // { clusterIndex, startTime, duration }
    const BREATH_LIGHTNESS_AMPLITUDE = 0.42; // HSL lightness swings this far above/below resting - hue-preserving, unlike a raw RGB multiply
    const BREATH_SATURATION_AMPLITUDE = 0.3; // extra vividness on the bright half of the cycle only
    const BREATH_DURATION_MIN = 5000;
    const BREATH_DURATION_MAX = 7000; // slow, deliberate inhale/exhale, not a quick flicker
    const BREATH_INTERVAL_MIN = 2500;
    const BREATH_INTERVAL_MAX = 5000;
    const _tmpBreathColor = new THREE.Color();

    function spawnBreath() {
        const clusterIndex = Math.floor(Math.random() * CLUSTERS.length);
        if (activeBreaths.some((b) => b.clusterIndex === clusterIndex)) return; // that cluster is already breathing
        activeBreaths.push({
            clusterIndex,
            startTime: performance.now(),
            duration: BREATH_DURATION_MIN + Math.random() * (BREATH_DURATION_MAX - BREATH_DURATION_MIN)
        });
    }

    function scheduleNextBreath() {
        const delay = BREATH_INTERVAL_MIN + Math.random() * (BREATH_INTERVAL_MAX - BREATH_INTERVAL_MIN);
        setTimeout(() => {
            spawnBreath();
            scheduleNextBreath();
        }, delay);
    }
    setTimeout(scheduleNextBreath, INTRO_DURATION + 700);

    function updateBreaths(now) {
        for (let i = activeBreaths.length - 1; i >= 0; i--) {
            const b = activeBreaths[i];
            const t = (now - b.startTime) / b.duration;
            const [start, end] = clusterIndexRanges[b.clusterIndex];

            // phase = 0 at both ends of the pulse, +1 at the inhale peak,
            // -1 at the exhale trough - one full cycle, not just a flash.
            const phase = t >= 1 ? 0 : Math.sin(2 * Math.PI * t);
            const hsl = clusterBaseHSL[b.clusterIndex];
            const boostedL = Math.min(0.92, Math.max(0.05, hsl.l + BREATH_LIGHTNESS_AMPLITUDE * phase));
            const boostedS = Math.min(1, hsl.s + BREATH_SATURATION_AMPLITUDE * Math.max(0, phase));
            _tmpBreathColor.setHSL(hsl.h, boostedS, boostedL);

            for (let idx = start; idx < end; idx++) {
                const bi = idx * 3;
                currentBaseArray[bi] = _tmpBreathColor.r;
                currentBaseArray[bi + 1] = _tmpBreathColor.g;
                currentBaseArray[bi + 2] = _tmpBreathColor.b;

                // Points with no active glow right now aren't touched by the glow
                // loop at all (it skips them), so the breath has to write the
                // display color directly here for those.
                if (activeGlow[idx] <= 0.001) {
                    colorAttr.array[bi] = currentBaseArray[bi];
                    colorAttr.array[bi + 1] = currentBaseArray[bi + 1];
                    colorAttr.array[bi + 2] = currentBaseArray[bi + 2];
                }
            }

            if (t >= 1) activeBreaths.splice(i, 1);
        }
    }

    const introStartTime = performance.now();
    let introActive = true;

    function updateIntro(now) {
        const t = Math.min((now - introStartTime) / INTRO_DURATION, 1);
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // ease-in-out cubic - gradual start and end, not an abrupt launch
        for (let i = 0; i < pointCount; i++) {
            const bi = i * 3;
            displayPositionArray[bi] = introStartArray[bi] + (positionArray[bi] - introStartArray[bi]) * eased;
            displayPositionArray[bi + 1] = introStartArray[bi + 1] + (positionArray[bi + 1] - introStartArray[bi + 1]) * eased;
            displayPositionArray[bi + 2] = introStartArray[bi + 2] + (positionArray[bi + 2] - introStartArray[bi + 2]) * eased;
        }
        geometry.attributes.position.needsUpdate = true;
        return t < 1;
    }

    // Contrastive push/pull: the links elsewhere only show attraction (a
    // point pulled toward the joint embedding). This is the missing other
    // half of contrastive learning - occasionally two points from different
    // clusters visibly drift apart and back, like a negative pair being
    // pushed away from an anchor, before settling back to rest. Only the two
    // points involved in an active repel are ever touched; every other point
    // just stays at its resting positionArray value (set once, by the intro).
    const activeRepels = [];
    const REPEL_DISTANCE = 1.0;
    const REPEL_INTERVAL_MIN = 3500;
    const REPEL_INTERVAL_MAX = 7000;

    function spawnRepel() {
        const clusterA = Math.floor(Math.random() * JOINT_CLUSTER_INDEX);
        let clusterB = Math.floor(Math.random() * JOINT_CLUSTER_INDEX);
        if (clusterB === clusterA) clusterB = (clusterB + 1) % JOINT_CLUSTER_INDEX;

        const indexA = randomIndexInCluster(clusterA);
        const indexB = randomIndexInCluster(clusterB);
        const ai = indexA * 3, bi = indexB * 3;

        const dx = positionArray[ai] - positionArray[bi];
        const dy = positionArray[ai + 1] - positionArray[bi + 1];
        const dz = positionArray[ai + 2] - positionArray[bi + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

        activeRepels.push({
            indexA,
            indexB,
            dir: { x: dx / len, y: dy / len, z: dz / len },
            startTime: performance.now(),
            duration: 1800
        });

        pulsePoint(indexA, 1);
        pulsePoint(indexB, 1);
    }

    function scheduleNextRepel() {
        const delay = REPEL_INTERVAL_MIN + Math.random() * (REPEL_INTERVAL_MAX - REPEL_INTERVAL_MIN);
        setTimeout(() => {
            spawnRepel();
            scheduleNextRepel();
        }, delay);
    }
    setTimeout(scheduleNextRepel, INTRO_DURATION + 1200);

    function updateRepels(now) {
        for (let i = activeRepels.length - 1; i >= 0; i--) {
            const r = activeRepels[i];
            const t = (now - r.startTime) / r.duration;
            const ai = r.indexA * 3, bi = r.indexB * 3;
            if (t >= 1) {
                // Snap both points back to their exact resting position on completion.
                displayPositionArray[ai] = positionArray[ai];
                displayPositionArray[ai + 1] = positionArray[ai + 1];
                displayPositionArray[ai + 2] = positionArray[ai + 2];
                displayPositionArray[bi] = positionArray[bi];
                displayPositionArray[bi + 1] = positionArray[bi + 1];
                displayPositionArray[bi + 2] = positionArray[bi + 2];
                activeRepels.splice(i, 1);
                continue;
            }
            // Computed fresh from the fixed resting position each frame (not
            // accumulated), so it never drifts regardless of frame rate.
            const push = Math.sin(Math.PI * t) * REPEL_DISTANCE; // grows then eases back to 0
            displayPositionArray[ai] = positionArray[ai] + r.dir.x * push;
            displayPositionArray[ai + 1] = positionArray[ai + 1] + r.dir.y * push;
            displayPositionArray[ai + 2] = positionArray[ai + 2] + r.dir.z * push;
            displayPositionArray[bi] = positionArray[bi] - r.dir.x * push;
            displayPositionArray[bi + 1] = positionArray[bi + 1] - r.dir.y * push;
            displayPositionArray[bi + 2] = positionArray[bi + 2] - r.dir.z * push;
        }
    }

    // Pulsing links: a handful of faint curved lines from a random point in an
    // outer (modality) cluster to a random point inside the shared "joint
    // embedding" cluster - visualizing cross-modal representations being pulled
    // together by self-supervised training.
    const activeLinks = [];

    function randomIndexInCluster(ci) {
        const [start, end] = clusterIndexRanges[ci];
        return start + Math.floor(Math.random() * (end - start));
    }

    // Each firing draws a faint, near-instant pathway (the "axon") between the
    // two points, then a bright glowing segment sweeps along that same line
    // from source to target over a fraction of a second - done by brightening
    // each vertex's own color based on how close it is to the current travel
    // position, rather than a separate object traveling alongside the line.
    const LINE_SEGMENTS = 40;
    const TAIL_LENGTH = 0.4; // how far behind the head the comet trail fades out (curve-parameter units)
    const HEAD_SOFTNESS = 0.04; // crisp leading edge - nothing glows ahead of the head
    const BASE_BRIGHTNESS = 0.22; // dim resting brightness of the pathway itself

    function spawnLink() {
        if (activeLinks.length >= MAX_LINKS) return;

        const sourceClusterIndex = Math.floor(Math.random() * JOINT_CLUSTER_INDEX);
        const sourceIndex = randomIndexInCluster(sourceClusterIndex);
        const targetIndex = randomIndexInCluster(JOINT_CLUSTER_INDEX);

        const p1 = new THREE.Vector3(displayPositionArray[sourceIndex * 3], displayPositionArray[sourceIndex * 3 + 1], displayPositionArray[sourceIndex * 3 + 2]);
        const p2 = new THREE.Vector3(displayPositionArray[targetIndex * 3], displayPositionArray[targetIndex * 3 + 1], displayPositionArray[targetIndex * 3 + 2]);
        const mid = p1.clone().add(p2).multiplyScalar(0.5);
        mid.x += (Math.random() - 0.5) * 1.5;
        mid.y += (Math.random() - 0.5) * 1.5;
        mid.z += (Math.random() - 0.5) * 1.5;

        const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
        const curvePoints = curve.getPoints(LINE_SEGMENTS);
        const vertexCount = curvePoints.length;

        const baseColor = new THREE.Color(CLUSTERS[sourceClusterIndex].color);
        const colorArray = new Float32Array(vertexCount * 3);
        for (let v = 0; v < vertexCount; v++) {
            colorArray[v * 3] = baseColor.r * BASE_BRIGHTNESS;
            colorArray[v * 3 + 1] = baseColor.g * BASE_BRIGHTNESS;
            colorArray[v * 3 + 2] = baseColor.b * BASE_BRIGHTNESS;
        }

        const lineGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
        lineGeometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
        const lineMaterial = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        sceneGroup.add(line);

        activeLinks.push({
            line,
            material: lineMaterial,
            colorAttr: lineGeometry.attributes.color,
            baseColor,
            vertexCount,
            sourceIndex,
            targetIndex,
            peakOpacity: 0.9 + Math.random() * 0.1,
            startTime: performance.now(),
            lifetime: 2600 + Math.random() * 1400,
            travelDuration: 550 + Math.random() * 400 // how long the glow takes to sweep across
        });

        triggerParticleRipple(p1);
    }

    // Irregular firing interval (not a fixed metronome tick) so connections
    // spawn like asynchronous neural activity rather than a mechanical pulse.
    function scheduleNextLink() {
        const delay = LINK_SPAWN_INTERVAL * (0.3 + Math.random() * 1.6);
        setTimeout(() => {
            spawnLink();
            scheduleNextLink();
        }, delay);
    }
    // Wait for the intro settle-in to finish before the first connection fires,
    // so a link never appears to connect to a point that's still mid-flight.
    setTimeout(scheduleNextLink, INTRO_DURATION + 400);

    function updateLinks(now) {
        for (let i = activeLinks.length - 1; i >= 0; i--) {
            const link = activeLinks[i];
            const t = (now - link.startTime) / link.lifetime;
            if (t >= 1) {
                sceneGroup.remove(link.line);
                link.line.geometry.dispose();
                link.material.dispose();
                activeLinks.splice(i, 1);
                continue;
            }
            link.material.opacity = Math.sin(Math.PI * t) * link.peakOpacity;

            const travelT = Math.min((now - link.startTime) / link.travelDuration, 1);

            // Brighten each vertex based on how close it is (in curve-parameter
            // space) to the current travel position - the glow itself sweeps
            // along the line rather than a separate object moving over it.
            const arr = link.colorAttr.array;
            for (let v = 0; v < link.vertexCount; v++) {
                const vt = v / (link.vertexCount - 1);
                let boost = 0;
                if (travelT < 1) {
                    const dist = vt - travelT; // signed - behind the head (<=0) vs ahead of it (>0)
                    boost = dist <= 0
                        ? Math.max(0, 1 + dist / TAIL_LENGTH) // fading tail behind
                        : Math.max(0, 1 - dist / HEAD_SOFTNESS); // sharp cutoff ahead - nothing glows before the signal arrives
                    boost *= boost;
                }
                // Base color at rest, but the head itself burns toward white at
                // peak boost - a hot core reads far brighter under additive
                // blending than just reaching full saturation of the hue.
                const dim = BASE_BRIGHTNESS;
                arr[v * 3] = link.baseColor.r * dim + (1 - link.baseColor.r * dim) * boost;
                arr[v * 3 + 1] = link.baseColor.g * dim + (1 - link.baseColor.g * dim) * boost;
                arr[v * 3 + 2] = link.baseColor.b * dim + (1 - link.baseColor.b * dim) * boost;
            }
            link.colorAttr.needsUpdate = true;

            // Source flashes as it "fires", target flashes as the glow arrives -
            // rather than both endpoints glowing for the whole link lifetime.
            if (travelT < 0.15) pulsePoint(link.sourceIndex, 1 - travelT / 0.15);
            if (travelT > 0.8) pulsePoint(link.targetIndex, (travelT - 0.8) / 0.2);
        }
    }

    // Sync with the particles.js background, same as the previous globe: a link
    // "firing" sends a brief brightness ripple outward through nearby particles.
    const RIPPLE_RADIUS_PX = 420;
    const RIPPLE_DURATION = 1400;
    const RIPPLE_OPACITY_BOOST = 0.3;
    const RIPPLE_SIZE_BOOST = 3;
    const RIPPLE_COOLDOWN = 2200;
    const rippleMap = new Map();
    let lastRippleTime = 0;

    function triggerParticleRipple(worldPoint) {
        const now = performance.now();
        if (now - lastRippleTime < RIPPLE_COOLDOWN) return;
        lastRippleTime = now;

        const pJSDom = window.pJSDom;
        if (!pJSDom || !pJSDom[0] || !pJSDom[0].pJS) return;
        const pJS = pJSDom[0].pJS;

        const screenPos = worldPoint.clone().applyMatrix4(sceneGroup.matrixWorld).project(camera);
        const cx = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
        const cy = (1 - (screenPos.y * 0.5 + 0.5)) * window.innerHeight;

        pJS.particles.array.forEach((p) => {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > RIPPLE_RADIUS_PX) return;

            if (!p._rippleBase) {
                p._rippleBase = { opacity: p.opacity, radius: p.radius };
            }
            rippleMap.set(p, {
                falloff: Math.sqrt(1 - dist / RIPPLE_RADIUS_PX),
                startTime: performance.now()
            });
        });
    }

    function updateParticleRipples(now) {
        rippleMap.forEach((state, p) => {
            const t = (now - state.startTime) / RIPPLE_DURATION;
            if (t >= 1) {
                p.opacity = p._rippleBase.opacity;
                p.radius = p._rippleBase.radius;
                rippleMap.delete(p);
                return;
            }
            const intensity = Math.sin(Math.PI * t) * state.falloff;
            p.opacity = p._rippleBase.opacity + RIPPLE_OPACITY_BOOST * intensity;
            p.radius = p._rippleBase.radius + RIPPLE_SIZE_BOOST * intensity;
        });
    }

    function onResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', onResize);

    // Drag-to-rotate with momentum, same feel as the previous globe background.
    // (No scroll-wheel zoom - hijacking wheel events would break normal page
    // scrolling, so navigation is drag/rotate only.)
    const AUTO_ROTATE_SPEED = 0.0012;
    const DRAG_SENSITIVITY = 0.005;
    const VELOCITY_DAMPING = 0.94;

    let isDragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let velocityX = 0;
    let dragEndTime = 0;
    let dragDistance = 0; // cumulative movement during this press - below CLICK_THRESHOLD counts as a click, not a drag
    const CLICK_THRESHOLD = 6;

    function pointerDown(x, y) {
        isDragging = true;
        lastPointerX = x;
        lastPointerY = y;
        velocityX = 0;
        dragDistance = 0;
        document.body.classList.add('dragging-scene');
    }

    function pointerMove(x, y) {
        if (!isDragging) return;
        const deltaX = x - lastPointerX;
        const deltaY = y - lastPointerY;

        sceneGroup.rotation.y += deltaX * DRAG_SENSITIVITY;
        sceneGroup.rotation.x += deltaY * DRAG_SENSITIVITY;

        velocityX = deltaX * DRAG_SENSITIVITY;
        dragDistance += Math.abs(deltaX) + Math.abs(deltaY);
        lastPointerX = x;
        lastPointerY = y;
    }

    function pointerUp() {
        if (!isDragging) return;
        isDragging = false;
        dragEndTime = performance.now();
        document.body.classList.remove('dragging-scene');

        if (dragDistance < CLICK_THRESHOLD) {
            raycaster.setFromCamera(pointerNDC, camera);
            const hits = raycaster.intersectObject(points);
            if (hits.length > 0) spawnNeighborReveal(hits[0].index);
        }
    }

    // Listen on window (not the canvas) since the scene sits behind the page
    // content in stacking order - real links/buttons are excluded so clicks and
    // navigation still work normally.
    const INTERACTIVE_SELECTOR = 'a, button, input, textarea, select';

    window.addEventListener('mousedown', (e) => {
        if (e.target.closest(INTERACTIVE_SELECTOR)) return;
        e.preventDefault();
        pointerDown(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => pointerMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', pointerUp);

    // Touch: one finger is left alone entirely (that's the OS's scroll
    // gesture) and a tap (movement below CLICK_THRESHOLD) triggers the same
    // nearest-neighbor reveal as a mouse click. Two fingers rotate the scene,
    // the same way mouse-drag does - a two-finger gesture doesn't collide
    // with page scrolling, so it's free to reuse for this. No preventDefault
    // anywhere, so normal touch scrolling is never affected.
    let touchMode = 'none'; // 'none' | 'single' (possible tap) | 'rotate' (two-finger)
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoveDistance = 0;
    let lastMidX = 0;
    let lastMidY = 0;

    window.addEventListener('touchstart', (e) => {
        if (e.target.closest(INTERACTIVE_SELECTOR)) return;
        if (e.touches.length === 2) {
            touchMode = 'rotate';
            lastMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            lastMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            velocityX = 0;
            document.body.classList.add('dragging-scene');
        } else if (e.touches.length === 1 && touchMode === 'none') {
            touchMode = 'single';
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchMoveDistance = 0;
        }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (touchMode === 'rotate' && e.touches.length >= 2) {
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const deltaX = midX - lastMidX;
            const deltaY = midY - lastMidY;

            sceneGroup.rotation.y += deltaX * DRAG_SENSITIVITY;
            sceneGroup.rotation.x += deltaY * DRAG_SENSITIVITY;

            velocityX = deltaX * DRAG_SENSITIVITY;
            lastMidX = midX;
            lastMidY = midY;
        } else if (touchMode === 'single' && e.touches.length === 1) {
            touchMoveDistance += Math.abs(e.touches[0].clientX - touchStartX) + Math.abs(e.touches[0].clientY - touchStartY);
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
        if (touchMode === 'rotate') {
            // Only end once both fingers are up - dropping to one finger
            // mid-rotate should never be misread as the start of a tap.
            if (e.touches.length < 2) {
                touchMode = 'none';
                dragEndTime = performance.now();
                document.body.classList.remove('dragging-scene');
            }
            return;
        }
        if (touchMode === 'single') {
            touchMode = 'none';
            if (touchMoveDistance < CLICK_THRESHOLD && e.changedTouches.length > 0) {
                const touch = e.changedTouches[0];
                pointerNDC.x = (touch.clientX / window.innerWidth) * 2 - 1;
                pointerNDC.y = -(touch.clientY / window.innerHeight) * 2 + 1;
                raycaster.setFromCamera(pointerNDC, camera);
                const hits = raycaster.intersectObject(points);
                if (hits.length > 0) spawnNeighborReveal(hits[0].index);
            }
        }
    }, { passive: true });

    // Hover: raycast against the point cloud to highlight the nearest point -
    // lets a visitor "explore" individual embeddings, not just watch the scene
    // auto-rotate. No caption/tooltip, just the glow.
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.25;
    const pointerNDC = new THREE.Vector2(-10, -10); // off-screen until first move

    window.addEventListener('mousemove', (e) => {
        pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    function updateHover() {
        raycaster.setFromCamera(pointerNDC, camera);
        const hits = raycaster.intersectObject(points);
        hoveredIndex = hits.length > 0 ? hits[0].index : -1;
        if (hoveredIndex !== -1) pulsePoint(hoveredIndex, 1);
    }

    // Click a point to reveal its nearest neighbors by actual 3D distance -
    // literally what an embedding space is used for (similarity retrieval),
    // rather than just an ambient visual.
    const K_NEIGHBORS = 5;
    const activeReveals = [];

    function clusterIndexOfPoint(index) {
        for (let ci = 0; ci < clusterIndexRanges.length; ci++) {
            const [start, end] = clusterIndexRanges[ci];
            if (index >= start && index < end) return ci;
        }
        return 0;
    }

    function findNearestNeighbors(index, k) {
        const ax = displayPositionArray[index * 3];
        const ay = displayPositionArray[index * 3 + 1];
        const az = displayPositionArray[index * 3 + 2];
        const distances = [];
        for (let i = 0; i < pointCount; i++) {
            if (i === index) continue;
            const dx = displayPositionArray[i * 3] - ax;
            const dy = displayPositionArray[i * 3 + 1] - ay;
            const dz = displayPositionArray[i * 3 + 2] - az;
            distances.push([i, dx * dx + dy * dy + dz * dz]);
        }
        distances.sort((a, b) => a[1] - b[1]);
        return distances.slice(0, k).map((d) => d[0]);
    }

    function spawnNeighborReveal(index) {
        const color = CLUSTERS[clusterIndexOfPoint(index)].color;
        const p1 = new THREE.Vector3(displayPositionArray[index * 3], displayPositionArray[index * 3 + 1], displayPositionArray[index * 3 + 2]);

        findNearestNeighbors(index, K_NEIGHBORS).forEach((neighborIndex) => {
            const p2 = new THREE.Vector3(
                displayPositionArray[neighborIndex * 3],
                displayPositionArray[neighborIndex * 3 + 1],
                displayPositionArray[neighborIndex * 3 + 2]
            );
            const revealGeometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
            const revealMaterial = new THREE.LineBasicMaterial({
                color,
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const line = new THREE.Line(revealGeometry, revealMaterial);
            sceneGroup.add(line);

            activeReveals.push({
                line,
                material: revealMaterial,
                startTime: performance.now(),
                lifetime: 2600
            });

            pulsePoint(neighborIndex, 1);
        });

        pulsePoint(index, 1);
    }

    function updateReveals(now) {
        for (let i = activeReveals.length - 1; i >= 0; i--) {
            const r = activeReveals[i];
            const t = (now - r.startTime) / r.lifetime;
            if (t >= 1) {
                sceneGroup.remove(r.line);
                r.line.geometry.dispose();
                r.material.dispose();
                activeReveals.splice(i, 1);
                continue;
            }
            r.material.opacity = Math.sin(Math.PI * t) * 0.8;
        }
    }

    // Also fires on its own, irregularly, so the retrieval demo is visible
    // even for a visitor who never clicks - a random point "queries" its
    // nearest neighbors periodically, same visual as the click-triggered one.
    const REVEAL_INTERVAL_MIN = 2000;
    const REVEAL_INTERVAL_MAX = 4000;

    function scheduleNextReveal() {
        const delay = REVEAL_INTERVAL_MIN + Math.random() * (REVEAL_INTERVAL_MAX - REVEAL_INTERVAL_MIN);
        setTimeout(() => {
            spawnNeighborReveal(Math.floor(Math.random() * pointCount));
            scheduleNextReveal();
        }, delay);
    }
    setTimeout(scheduleNextReveal, INTRO_DURATION + 900);

    function animate() {
        requestAnimationFrame(animate);
        const now = performance.now();

        if (isDragging) {
            // rotation already applied directly in pointerMove
        } else if (Math.abs(velocityX) > 0.00005) {
            sceneGroup.rotation.y += velocityX;
            velocityX *= VELOCITY_DAMPING;
        } else if (now - dragEndTime > 600) {
            sceneGroup.rotation.y += AUTO_ROTATE_SPEED;
        }

        if (introActive) {
            introActive = updateIntro(now);
        } else if (activeRepels.length > 0) {
            updateRepels(now);
            geometry.attributes.position.needsUpdate = true;
        }

        updateHover();
        updateLinks(now);
        updateReveals(now);
        updateBreaths(now);

        // Decay active glow and write it into the color attribute, lerping each
        // affected point's color toward white and back to its cluster's current
        // (possibly breathing-adjusted) base color.
        for (let i = 0; i < activeGlow.length; i++) {
            if (activeGlow[i] <= 0.001) continue;
            const glow = activeGlow[i];
            const bi = i * 3;
            colorAttr.array[bi] = currentBaseArray[bi] + (1 - currentBaseArray[bi]) * glow;
            colorAttr.array[bi + 1] = currentBaseArray[bi + 1] + (1 - currentBaseArray[bi + 1]) * glow;
            colorAttr.array[bi + 2] = currentBaseArray[bi + 2] + (1 - currentBaseArray[bi + 2]) * glow;
            activeGlow[i] *= 0.9;
            if (activeGlow[i] <= 0.001) {
                activeGlow[i] = 0;
                colorAttr.array[bi] = currentBaseArray[bi];
                colorAttr.array[bi + 1] = currentBaseArray[bi + 1];
                colorAttr.array[bi + 2] = currentBaseArray[bi + 2];
            }
        }
        colorAttr.needsUpdate = true;

        updateParticleRipples(now);
        renderer.render(scene, camera);
    }
    animate();
})();
