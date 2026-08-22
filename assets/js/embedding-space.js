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
    const MAX_LINKS = 30;
    const LINK_SPAWN_INTERVAL = 260; // ms

    // Box-Muller transform - gives clusters a denser core / tapering edge instead
    // of a uniform cube, so they read as organic "distributions" not blocks.
    function randomGaussian() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    const scene = new THREE.Scene();

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

    const positionArray = new Float32Array(positions);
    const colorArray = new Float32Array(colors);
    const baseColorArray = colorArray.slice(); // untouched reference the "active glow" lerp resets back to

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
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

    // Per-point "active glow" state: hovered/linked points briefly lerp toward
    // white and back, reusing the color attribute (no custom shader needed).
    const activeGlow = new Float32Array(pointCount); // 0..1 intensity, decays each frame
    let hoveredIndex = -1;

    function pulsePoint(index, intensity) {
        activeGlow[index] = Math.max(activeGlow[index], intensity);
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
    const TRAIL_WIDTH = 0.22; // width of the glowing segment, in curve-parameter units (0..1)
    const BASE_BRIGHTNESS = 0.15; // dim resting brightness of the pathway itself

    function spawnLink() {
        if (activeLinks.length >= MAX_LINKS) return;

        const sourceClusterIndex = Math.floor(Math.random() * JOINT_CLUSTER_INDEX);
        const sourceIndex = randomIndexInCluster(sourceClusterIndex);
        const targetIndex = randomIndexInCluster(JOINT_CLUSTER_INDEX);

        const p1 = new THREE.Vector3(positionArray[sourceIndex * 3], positionArray[sourceIndex * 3 + 1], positionArray[sourceIndex * 3 + 2]);
        const p2 = new THREE.Vector3(positionArray[targetIndex * 3], positionArray[targetIndex * 3 + 1], positionArray[targetIndex * 3 + 2]);
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
            peakOpacity: 0.7 + Math.random() * 0.3,
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
    scheduleNextLink();

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
                    const dist = Math.abs(vt - travelT);
                    boost = Math.max(0, 1 - dist / TRAIL_WIDTH);
                    boost *= boost; // sharper falloff - a comet-like head, not a soft ramp
                }
                const brightness = BASE_BRIGHTNESS + (1 - BASE_BRIGHTNESS) * boost;
                arr[v * 3] = link.baseColor.r * brightness;
                arr[v * 3 + 1] = link.baseColor.g * brightness;
                arr[v * 3 + 2] = link.baseColor.b * brightness;
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
    const MAX_TILT = Math.PI / 2 - 0.05;

    let isDragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let velocityX = 0;
    let dragEndTime = 0;

    function pointerDown(x, y) {
        isDragging = true;
        lastPointerX = x;
        lastPointerY = y;
        velocityX = 0;
        document.body.classList.add('dragging-scene');
    }

    function pointerMove(x, y) {
        if (!isDragging) return;
        const deltaX = x - lastPointerX;
        const deltaY = y - lastPointerY;

        sceneGroup.rotation.y += deltaX * DRAG_SENSITIVITY;
        sceneGroup.rotation.x = Math.max(
            -MAX_TILT,
            Math.min(MAX_TILT, sceneGroup.rotation.x + deltaY * DRAG_SENSITIVITY)
        );

        velocityX = deltaX * DRAG_SENSITIVITY;
        lastPointerX = x;
        lastPointerY = y;
    }

    function pointerUp() {
        if (!isDragging) return;
        isDragging = false;
        dragEndTime = performance.now();
        document.body.classList.remove('dragging-scene');
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

        updateHover();
        updateLinks(now);

        // Decay active glow and write it into the color attribute, lerping each
        // affected point's color toward white and back to its base hue.
        const colorAttr = geometry.attributes.color;
        for (let i = 0; i < activeGlow.length; i++) {
            if (activeGlow[i] <= 0.001) continue;
            const glow = activeGlow[i];
            const bi = i * 3;
            colorAttr.array[bi] = baseColorArray[bi] + (1 - baseColorArray[bi]) * glow;
            colorAttr.array[bi + 1] = baseColorArray[bi + 1] + (1 - baseColorArray[bi + 1]) * glow;
            colorAttr.array[bi + 2] = baseColorArray[bi + 2] + (1 - baseColorArray[bi + 2]) * glow;
            activeGlow[i] *= 0.9;
            if (activeGlow[i] <= 0.001) {
                activeGlow[i] = 0;
                colorAttr.array[bi] = baseColorArray[bi];
                colorAttr.array[bi + 1] = baseColorArray[bi + 1];
                colorAttr.array[bi + 2] = baseColorArray[bi + 2];
            }
        }
        colorAttr.needsUpdate = true;

        updateParticleRipples(now);
        renderer.render(scene, camera);
    }
    animate();
})();
