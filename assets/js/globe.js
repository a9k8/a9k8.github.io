// Rotating "data-network" globe background (Three.js) - sits behind page content, above particles
// Abstract geo-intelligence look: dark wireframe sphere + glowing city nodes + pulsing connection arcs

(function initGlobe() {
    const container = document.getElementById('globe-container');
    if (!container || typeof THREE === 'undefined') return;

    const ACCENT_COLOR = 0x4ec9b0;
    const SATELLITE_COLOR = 0xf0a94e; // warm amber for the orbital layer (satellites, orbit rings, downlink beams)
    const GLOBE_RADIUS = 8;
    const MAX_ARCS = 10;
    const ARC_SPAWN_INTERVAL = 600; // ms
    const NODE_IDLE_OPACITY = 0.2;
    const NODE_ACTIVE_OPACITY = 0.95;

    // Roughly-global spread of "city" nodes, as [lat, lon]
    const NODE_COORDS = [
        [40.7128, -74.0060],  // New York
        [51.5074, -0.1278],   // London
        [19.0760, 72.8777],   // Mumbai
        [35.6762, 139.6503],  // Tokyo
        [-33.8688, 151.2093], // Sydney
        [-23.5505, -46.6333], // Sao Paulo
        [30.0444, 31.2357],   // Cairo
        [55.7558, 37.6173],   // Moscow
        [39.9042, 116.4074],  // Beijing
        [37.7749, -122.4194], // San Francisco
        [1.3521, 103.8198],   // Singapore
        [-33.9249, 18.4241],  // Cape Town
        [43.6532, -79.3832],  // Toronto
        [25.2048, 55.2708],   // Dubai
        [52.5200, 13.4050],   // Berlin
        [28.6139, 77.2090],   // Delhi
        [31.2304, 121.4737],  // Shanghai
        [22.3193, 114.1694],  // Hong Kong
        [37.5665, 126.9780],  // Seoul
        [-6.2088, 106.8456],  // Jakarta
        [13.7563, 100.5018],  // Bangkok
        [19.4326, -99.1332],  // Mexico City
        [-34.6037, -58.3816], // Buenos Aires
        [6.5244, 3.3792],     // Lagos
        [-1.2921, 36.8219],   // Nairobi
        [41.0082, 28.9784],   // Istanbul
        [48.8566, 2.3522],    // Paris
        [40.4168, -3.7038],   // Madrid
        [41.9028, 12.4964],   // Rome
        [34.0522, -118.2437], // Los Angeles

        // Additional nodes for fuller coverage: Arctic, Pacific, Antarctica-adjacent,
        // Central Asia, and deeper Africa/South America spread
        [64.1466, -21.9426],  // Reykjavik
        [61.2181, -149.9003], // Anchorage
        [64.1836, -51.7214],  // Nuuk
        [69.3558, 88.1893],   // Norilsk
        [60.1699, 24.9384],   // Helsinki
        [59.3293, 18.0686],   // Stockholm
        [37.9838, 23.7275],   // Athens
        [35.6892, 51.3890],   // Tehran
        [24.7136, 46.6753],   // Riyadh
        [33.3152, 44.3661],   // Baghdad
        [24.8607, 67.0011],   // Karachi
        [43.2220, 76.8512],   // Almaty
        [41.2995, 69.2401],   // Tashkent
        [47.8864, 106.9057],  // Ulaanbaatar
        [14.5995, 120.9842],  // Manila
        [10.8231, 106.6297],  // Ho Chi Minh City
        [-31.9505, 115.8605], // Perth
        [-36.8485, 174.7633], // Auckland
        [21.3069, -157.8583], // Honolulu
        [-18.1416, 178.4419], // Suva
        [9.0320, 38.7469],    // Addis Ababa
        [-4.4419, 15.2663],   // Kinshasa
        [5.6037, -0.1870],    // Accra
        [-26.2041, 28.0473],  // Johannesburg
        [-6.7924, 39.2083],   // Dar es Salaam
        [33.5731, -7.5898],   // Casablanca
        [4.7110, -74.0721],   // Bogota
        [-12.0464, -77.0428], // Lima
        [-33.4489, -70.6693], // Santiago
        [49.2827, -123.1207], // Vancouver
        [-54.8019, -68.3030], // Ushuaia
        [-53.1638, -70.9171], // Punta Arenas
        [-77.8419, 166.6863]  // McMurdo Station, Antarctica
    ];

    function latLonToVector3(lat, lon, radius) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);
        return new THREE.Vector3(
            -radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
        );
    }

    // The Y rotation that brings a given lat/lon to face the camera head-on
    // (i.e. onto the sphere's +Z point), using the same convention as latLonToVector3.
    function facingRotationY(lat, lon) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);
        const x = -Math.sin(phi) * Math.cos(theta);
        const z = Math.sin(phi) * Math.sin(theta);
        return -Math.atan2(x, z);
    }

    // Approximate geographic center of India (near Nagpur) - the globe starts facing here
    const INDIA_LAT = 21.15;
    const INDIA_LON = 79.09;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 13);
    camera.lookAt(0, 0, 0);

    // Anchor the whole assembly near the bottom of the viewport so only the globe's
    // upper hemisphere pokes into view, like a horizon/sunrise effect. The frustum's
    // vertical half-extent at a given depth depends only on vertical FOV + distance
    // (not aspect ratio), so this constant offset holds at any window size.
    const VERTICAL_OFFSET = camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const EXTRA_DROP = 1.8; // nudges it further down than the exact half-visible point
    scene.position.y = -(VERTICAL_OFFSET + EXTRA_DROP);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // Everything below rotates together as one unit
    const globeGroup = new THREE.Group();
    globeGroup.rotation.y = facingRotationY(INDIA_LAT, INDIA_LON);
    // Extra forward tilt so India's full latitude span (~8N to 37N) clears the
    // bottom-edge cutoff, not just the northern half - without this, the globe's
    // own equatorial plane sits below the visible area and cuts off the south.
    globeGroup.rotation.x = THREE.MathUtils.degToRad(-30);
    scene.add(globeGroup);

    // Solid dark core with a faint world-map overlay so nodes/arcs read clearly against it
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');

    const coreGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 0.985, 48, 48);
    const coreMaterial = new THREE.MeshBasicMaterial({
        map: textureLoader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg'),
        color: new THREE.Color(0x6d8ea3) // brighter tint so the landmass map reads clearly under the grid
    });
    globeGroup.add(new THREE.Mesh(coreGeometry, coreMaterial));

    // Teal latitude/longitude grid - built from clean rings (not a triangulated sphere wireframe)
    // so there are no diagonal lines, just horizontal latitude circles and vertical longitude circles
    const gridMaterial = new THREE.LineBasicMaterial({
        color: ACCENT_COLOR,
        transparent: true,
        opacity: 0.12
    });
    const gridRadius = GLOBE_RADIUS * 1.002;

    // Latitude rings (horizontal), skipping the poles
    for (let lat = -80; lat <= 80; lat += 20) {
        const latRad = lat * Math.PI / 180;
        const ringRadius = gridRadius * Math.cos(latRad);
        const y = gridRadius * Math.sin(latRad);
        const points = [];
        for (let i = 0; i <= 64; i++) {
            const theta = (i / 64) * Math.PI * 2;
            points.push(new THREE.Vector3(ringRadius * Math.cos(theta), y, ringRadius * Math.sin(theta)));
        }
        const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), gridMaterial);
        globeGroup.add(ring);
    }

    // Longitude lines (vertical, pole-to-pole great circles)
    for (let lon = 0; lon < 360; lon += 30) {
        const lonRad = lon * Math.PI / 180;
        const points = [];
        for (let i = 0; i <= 64; i++) {
            const phi = (i / 64) * Math.PI - Math.PI / 2;
            points.push(new THREE.Vector3(
                gridRadius * Math.cos(phi) * Math.cos(lonRad),
                gridRadius * Math.sin(phi),
                gridRadius * Math.cos(phi) * Math.sin(lonRad)
            ));
        }
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMaterial);
        globeGroup.add(line);
    }

    // Subtle outer atmosphere glow matching the site's accent color - thinner
    // shell and lower opacity than before, since at the globe's current larger
    // size this was reading as a distracting green ring rather than a subtle rim.
    const atmosphereGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 1.05, 48, 48);
    const atmosphereMaterial = new THREE.MeshBasicMaterial({
        color: ACCENT_COLOR,
        transparent: true,
        opacity: 0.05,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending
    });
    globeGroup.add(new THREE.Mesh(atmosphereGeometry, atmosphereMaterial));

    // Builds a small stylized satellite: an elongated body "bus", two dark
    // solar-panel wings with a cell-grid overlay for contrast, and a small
    // dish antenna - real satellites read as recognizable mainly through the
    // bright-body/dark-panel contrast, not fine geometric detail at this scale.
    const SOLAR_PANEL_COLOR = 0x16232e; // dark, contrasts against the bright amber body/antenna
    const SATELLITE_SCALE = 2; // uniform size multiplier for the whole satellite model

    function createSatelliteMesh() {
        const group = new THREE.Group();
        const bodyMaterial = new THREE.MeshBasicMaterial({ color: SATELLITE_COLOR });
        const panelMaterial = new THREE.MeshBasicMaterial({ color: SOLAR_PANEL_COLOR, side: THREE.DoubleSide });
        const panelGridMaterial = new THREE.LineBasicMaterial({
            color: SATELLITE_COLOR,
            transparent: true,
            opacity: 0.5
        });

        // Elongated bus rather than a plain cube - closer to real satellite proportions
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.065, 0.045), bodyMaterial);
        group.add(body);

        // Solar panel wings, each with a thin cell-grid line overlay for detail
        const panelGeometry = new THREE.BoxGeometry(0.11, 0.003, 0.05);
        const panelGridGeometry = new THREE.EdgesGeometry(panelGeometry);
        [-1, 1].forEach((side) => {
            const panel = new THREE.Mesh(panelGeometry, panelMaterial);
            panel.position.set(side * 0.095, 0, 0);
            group.add(panel);

            const grid = new THREE.LineSegments(panelGridGeometry, panelGridMaterial);
            grid.position.copy(panel.position);
            group.add(grid);
        });


        group.scale.setScalar(SATELLITE_SCALE);
        return group;
    }

    // Orbiting satellites - added to the scene (not globeGroup) so they keep orbiting
    // independently of the globe's own spin, like real satellites over a rotating Earth.
    const SATELLITE_COUNT = 3;
    const SATELLITE_ORBIT_RADIUS = GLOBE_RADIUS * 1.4;
    const satellites = [];

    for (let s = 0; s < SATELLITE_COUNT; s++) {
        // Static pivot that fixes this satellite's orbital plane (random tilt + orientation)
        const planePivot = new THREE.Object3D();
        planePivot.rotation.x = (Math.random() - 0.5) * Math.PI;
        planePivot.rotation.z = Math.random() * Math.PI * 2;
        scene.add(planePivot);

        // Rotating pivot that carries the satellite around the (fixed) orbital plane
        const motionPivot = new THREE.Object3D();
        motionPivot.rotation.y = Math.random() * Math.PI * 2;
        planePivot.add(motionPivot);

        const satMesh = createSatelliteMesh();
        satMesh.position.set(SATELLITE_ORBIT_RADIUS, 0, 0);
        motionPivot.add(satMesh);

        satellites.push({
            motionPivot,
            satMesh,
            speed: (0.0015 + Math.random() * 0.002) * (Math.random() < 0.5 ? 1 : -1)
        });
    }

    // City nodes - dim/small by default, only lighting up while an arc is connected to them
    const nodePositions = NODE_COORDS.map(([lat, lon]) => latLonToVector3(lat, lon, GLOBE_RADIUS * 1.01));
    const nodeActiveCount = new Array(nodePositions.length).fill(0);
    const nodeMeshes = nodePositions.map((pos, i) => {
        const nodeGeometry = new THREE.SphereGeometry(0.022, 8, 8);
        const nodeMaterial = new THREE.MeshBasicMaterial({
            color: ACCENT_COLOR,
            transparent: true,
            opacity: NODE_IDLE_OPACITY
        });
        const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
        node.position.copy(pos);
        node.userData.pulseOffset = i * 0.7;
        globeGroup.add(node);
        return node;
    });

    // Satellite downlink beams: each satellite keeps a permanent live connection to
    // whichever city node is currently nearest beneath it, tying the orbital layer
    // to the ground network. Rendered as a thin cylinder (not a THREE.Line) since
    // WebGL caps line thickness at ~1px regardless of linewidth - a real mesh is
    // what actually stays visible. Re-targets automatically as the satellite orbits
    // and the globe rotates, so the connection never has to restart from scratch.
    const BEAM_RADIUS = GLOBE_RADIUS * 0.008; // scales with globe size so it can't go paper-thin again
    const _tmpVecA = new THREE.Vector3();
    const _tmpVecB = new THREE.Vector3();
    const _upAxis = new THREE.Vector3(0, 1, 0);

    satellites.forEach((sat) => {
        // Unit-height cylinder: stretched via mesh.scale.y every frame in
        // updateDownlinkBeams so it can keep tracking both moving endpoints.
        const geometry = new THREE.CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, 1, 6, 1, true);
        const material = new THREE.MeshBasicMaterial({
            color: SATELLITE_COLOR,
            transparent: true,
            opacity: 0.55
        });
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        sat.beamMesh = mesh;
        sat.beamNodeIndex = -1; // currently-connected node, updated every frame
    });

    function updateDownlinkBeams() {
        satellites.forEach((sat) => {
            if (nodeMeshes.length === 0) return;

            const satWorldPos = sat.satMesh.getWorldPosition(_tmpVecA);

            let nearestIndex = -1;
            let nearestDist = Infinity;
            nodeMeshes.forEach((node, i) => {
                const dist = satWorldPos.distanceTo(node.getWorldPosition(_tmpVecB));
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestIndex = i;
                }
            });
            if (nearestIndex === -1) return;

            if (nearestIndex !== sat.beamNodeIndex) {
                if (sat.beamNodeIndex !== -1) nodeActiveCount[sat.beamNodeIndex]--;
                nodeActiveCount[nearestIndex]++;
                sat.beamNodeIndex = nearestIndex;
            }

            const nodeWorldPos = nodeMeshes[nearestIndex].getWorldPosition(_tmpVecB);
            const direction = new THREE.Vector3().subVectors(nodeWorldPos, satWorldPos);
            const length = direction.length();

            // satWorldPos/nodeWorldPos are true world-space (already include scene.position's
            // bottom-anchor offset), but beamMesh.position is interpreted relative to its
            // parent (scene) - subtract that offset once so it isn't double-applied.
            sat.beamMesh.position.copy(satWorldPos).add(nodeWorldPos).multiplyScalar(0.5).sub(scene.position);
            sat.beamMesh.quaternion.setFromUnitVectors(_upAxis, direction.normalize());
            sat.beamMesh.scale.set(1, length, 1);
        });
    }

    // Pulsing arcs animated between random node pairs
    const activeArcs = [];

    function spawnArc() {
        if (activeArcs.length >= MAX_ARCS || nodePositions.length < 2) return;

        let i = Math.floor(Math.random() * nodePositions.length);
        let j = Math.floor(Math.random() * nodePositions.length);
        if (i === j) return;

        const p1 = nodePositions[i];
        const p2 = nodePositions[j];
        const angle = p1.angleTo(p2);
        const bulge = GLOBE_RADIUS * (0.3 + (angle / Math.PI) * 0.6);

        const mid = p1.clone().add(p2).multiplyScalar(0.5).normalize().multiplyScalar(GLOBE_RADIUS + bulge);
        const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
        const points = curve.getPoints(48);

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: ACCENT_COLOR, // same accent hue for every arc - only brightness varies
            transparent: true,
            opacity: 0
        });
        const line = new THREE.Line(geometry, material);
        globeGroup.add(line);

        nodeActiveCount[i]++;
        nodeActiveCount[j]++;

        activeArcs.push({
            line,
            material,
            nodeA: i,
            nodeB: j,
            peakOpacity: 0.4 + Math.random() * 0.5, // random brightness per arc, same color
            startTime: performance.now(),
            lifetime: 3200 + Math.random() * 1600
        });

        triggerParticleRipple();
    }
    setInterval(spawnArc, ARC_SPAWN_INTERVAL);

    // Visual sync with the particles.js background: every so often a connection sends
    // a brief brightness ripple outward through the nearby particles, so the
    // globe reads as broadcasting into the surrounding data field.
    const RIPPLE_RADIUS_PX = 450;
    const RIPPLE_DURATION = 1500; // ms
    const RIPPLE_OPACITY_BOOST = 0.35;
    const RIPPLE_SIZE_BOOST = 3; // px added to particle radius at peak
    const RIPPLE_COOLDOWN = 2500; // ms - throttles how often a ripple can fire, independent of arc spawn rate
    const rippleMap = new Map(); // particle -> { falloff, startTime }
    let lastRippleTime = 0;

    function triggerParticleRipple() {
        const now = performance.now();
        if (now - lastRippleTime < RIPPLE_COOLDOWN) return;
        lastRippleTime = now;

        const pJSDom = window.pJSDom;
        if (!pJSDom || !pJSDom[0] || !pJSDom[0].pJS) return;
        const pJS = pJSDom[0].pJS;

        // Project the globe's actual on-screen position (it's anchored near the
        // bottom of the viewport now, not the center) so the ripple originates
        // from where the globe really is rather than the middle of the screen.
        const globeScreenPos = globeGroup.getWorldPosition(_tmpVecA).clone().project(camera);
        const cx = (globeScreenPos.x * 0.5 + 0.5) * window.innerWidth;
        const cy = (1 - (globeScreenPos.y * 0.5 + 0.5)) * window.innerHeight;

        pJS.particles.array.forEach((p) => {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > RIPPLE_RADIUS_PX) return;

            // Capture each particle's true resting state exactly once, so
            // repeated ripples never drift its baseline brightness/size up.
            if (!p._rippleBase) {
                p._rippleBase = { opacity: p.opacity, radius: p.radius };
            }

            rippleMap.set(p, {
                // sqrt curve keeps the falloff stronger across most of the radius,
                // instead of dropping off sharply right past the center
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

    // Continuously push nearby background particles away from each satellite's
    // current on-screen position, like the mouse-hover repulse effect but
    // following the satellites instead. Runs every frame (not event-triggered)
    // since it's a standing "field" around each satellite, not a one-off pulse.
    const SATELLITE_REPEL_RADIUS = 70; // px
    const SATELLITE_REPEL_STRENGTH = 6; // max px nudge per frame at closest range

    function repelParticlesFromSatellites() {
        const pJSDom = window.pJSDom;
        if (!pJSDom || !pJSDom[0] || !pJSDom[0].pJS) return;
        const pJS = pJSDom[0].pJS;

        const satScreenPositions = satellites.map((sat) => {
            const worldPos = sat.satMesh.getWorldPosition(_tmpVecA).clone().project(camera);
            return {
                x: (worldPos.x * 0.5 + 0.5) * window.innerWidth,
                y: (1 - (worldPos.y * 0.5 + 0.5)) * window.innerHeight
            };
        });

        pJS.particles.array.forEach((p) => {
            satScreenPositions.forEach((satPos) => {
                const dx = p.x - satPos.x;
                const dy = p.y - satPos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 0 && dist < SATELLITE_REPEL_RADIUS) {
                    const force = (1 - dist / SATELLITE_REPEL_RADIUS) * SATELLITE_REPEL_STRENGTH;
                    p.x += (dx / dist) * force;
                    p.y += (dy / dist) * force;
                }
            });
        });
    }

    function updateArcs(now) {
        for (let i = activeArcs.length - 1; i >= 0; i--) {
            const arc = activeArcs[i];
            const t = (now - arc.startTime) / arc.lifetime;
            if (t >= 1) {
                globeGroup.remove(arc.line);
                arc.line.geometry.dispose();
                arc.material.dispose();
                nodeActiveCount[arc.nodeA]--;
                nodeActiveCount[arc.nodeB]--;
                activeArcs.splice(i, 1);
                continue;
            }
            arc.material.opacity = Math.sin(Math.PI * t) * arc.peakOpacity;
        }
    }

    function onResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', onResize);

    // Drag-to-rotate: click/touch and drag spins the globe manually; releasing
    // lets it drift to a stop and then ease back into the slow auto-rotation.
    const AUTO_ROTATE_SPEED = 0.0018;
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
        document.body.classList.add('dragging-globe');
    }

    function pointerMove(x, y) {
        if (!isDragging) return;
        const deltaX = x - lastPointerX;
        const deltaY = y - lastPointerY;

        globeGroup.rotation.y += deltaX * DRAG_SENSITIVITY;
        globeGroup.rotation.x = Math.max(
            -MAX_TILT,
            Math.min(MAX_TILT, globeGroup.rotation.x + deltaY * DRAG_SENSITIVITY)
        );

        velocityX = deltaX * DRAG_SENSITIVITY;
        lastPointerX = x;
        lastPointerY = y;
    }

    function pointerUp() {
        if (!isDragging) return;
        isDragging = false;
        dragEndTime = performance.now();
        document.body.classList.remove('dragging-globe');
    }

    // Listen on window (not the globe canvas) since the visible globe sits
    // behind the page content in stacking order - the content's boxes would
    // otherwise swallow every mousedown before it reaches the canvas.
    // Real links/buttons are excluded so clicks and navigation still work.
    const INTERACTIVE_SELECTOR = 'a, button, input, textarea, select';

    window.addEventListener('mousedown', (e) => {
        if (e.target.closest(INTERACTIVE_SELECTOR)) return;
        e.preventDefault(); // avoid dragging also selecting page text
        pointerDown(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => pointerMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', pointerUp);

    function animate() {
        requestAnimationFrame(animate);
        const now = performance.now();

        if (isDragging) {
            // rotation already applied directly in pointerMove
        } else if (Math.abs(velocityX) > 0.00005) {
            globeGroup.rotation.y += velocityX;
            velocityX *= VELOCITY_DAMPING;
        } else if (now - dragEndTime > 600) {
            globeGroup.rotation.y += AUTO_ROTATE_SPEED;
        }

        satellites.forEach((sat) => {
            sat.motionPivot.rotation.y += sat.speed;
            // Counter-rotate the satellite itself so it doesn't tumble as it
            // orbits - the wings/body keep a fixed orientation relative to the
            // orbital plane instead of spinning through every position.
            sat.satMesh.rotation.y = -sat.motionPivot.rotation.y;
        });

        updateArcs(now); // updates nodeActiveCount before nodes read it below
        updateDownlinkBeams(); // also updates nodeActiveCount before nodes read it below

        nodeMeshes.forEach((node, i) => {
            const isActive = nodeActiveCount[i] > 0;
            const targetOpacity = isActive ? NODE_ACTIVE_OPACITY : NODE_IDLE_OPACITY;
            node.material.opacity += (targetOpacity - node.material.opacity) * 0.08;

            const scale = isActive
                ? 1 + 0.35 * Math.sin(now * 0.0025 + node.userData.pulseOffset)
                : 1;
            node.scale.setScalar(scale);
        });

        updateParticleRipples(now);
        repelParticlesFromSatellites();
        renderer.render(scene, camera);
    }
    animate();
})();
