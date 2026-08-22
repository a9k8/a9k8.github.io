// Interactive 3D "embedding space" background (Three.js) - a navigable field of
// floating tensors (random-sized matrices of numbers, numpy-array style) drifting
// in space, standing in for the raw tensors a representation-learning model
// operates on. Replaces the previous rotating-globe background.

(function initEmbeddingSpace() {
    const container = document.getElementById('embedding-container');
    if (!container || typeof THREE === 'undefined') return;

    const TENSOR_COLORS = [0x4ec9b0, 0xf0a94e, 0xff6b9d, 0x6bb0ff];
    const TENSOR_COUNT = 14;
    const MIN_DIM = 2;
    const MAX_DIM = 5;
    const REFRESH_INTERVAL = 1500; // ms - how often one random tensor's values reroll

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 14);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // Everything rotates together as one unit, same drag/momentum model as the
    // previous globe background. Tensors are Sprites, which always face the
    // camera regardless of this group's rotation, so the numbers stay readable
    // no matter how the field is spun - only their position orbits.
    const sceneGroup = new THREE.Group();
    scene.add(sceneGroup);

    function randomValue() {
        return Math.random() * 4 - 2; // -2.00..2.00, activation-looking range
    }

    function formatValue(v) {
        return (v >= 0 ? ' ' : '') + v.toFixed(2); // leading space keeps columns aligned with negatives
    }

    function randomMatrix(rows, cols) {
        const values = [];
        for (let r = 0; r < rows; r++) {
            const row = [];
            for (let c = 0; c < cols; c++) row.push(randomValue());
            values.push(row);
        }
        return values;
    }

    const CELL_W = 60;
    const CELL_H = 30;
    const PAD_X = 30;
    const PAD_Y = 20;
    const LABEL_H = 26;

    function canvasSizeFor(rows, cols) {
        return {
            width: cols * CELL_W + PAD_X * 2,
            height: rows * CELL_H + PAD_Y * 2 + LABEL_H
        };
    }

    // Draws a numpy-print-style matrix (bracket outline + aligned values + a
    // small shape label) onto an existing canvas, so the same canvas/texture can
    // be reused across periodic re-rolls instead of allocating a new one each time.
    function drawTensor(ctx, width, height, values, colorHex) {
        const rows = values.length;
        const cols = values[0].length;
        const colorStr = '#' + colorHex.toString(16).padStart(6, '0');

        ctx.clearRect(0, 0, width, height);

        const bx0 = PAD_X - 14;
        const bx1 = width - PAD_X + 14;
        const by0 = PAD_Y - 6;
        const by1 = PAD_Y + rows * CELL_H + 6;

        ctx.strokeStyle = colorStr;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(bx0 + 8, by0); ctx.lineTo(bx0, by0); ctx.lineTo(bx0, by1); ctx.lineTo(bx0 + 8, by1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx1 - 8, by0); ctx.lineTo(bx1, by0); ctx.lineTo(bx1, by1); ctx.lineTo(bx1 - 8, by1);
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.fillStyle = colorStr;
        ctx.font = '20px Consolas, Menlo, Monaco, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                ctx.fillText(formatValue(values[r][c]), PAD_X + c * CELL_W, PAD_Y + r * CELL_H + CELL_H / 2);
            }
        }

        ctx.globalAlpha = 0.55;
        ctx.font = '14px Consolas, Menlo, Monaco, monospace';
        ctx.fillText(`(${rows}×${cols})`, PAD_X, by1 + LABEL_H / 2 + 2);
    }

    function createTensor() {
        const rows = MIN_DIM + Math.floor(Math.random() * (MAX_DIM - MIN_DIM + 1));
        const cols = MIN_DIM + Math.floor(Math.random() * (MAX_DIM - MIN_DIM + 1));
        const colorHex = TENSOR_COLORS[Math.floor(Math.random() * TENSOR_COLORS.length)];
        const { width, height } = canvasSizeFor(rows, cols);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const values = randomMatrix(rows, cols);
        drawTensor(ctx, width, height, values, colorHex);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.85,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(material);

        // World size scales with row count so bigger tensors physically read as
        // bigger, mirroring how a larger tensor "feels" larger.
        const worldHeight = 1.1 + rows * 0.22;
        sprite.scale.set(worldHeight * (width / height), worldHeight, 1);

        const basePosition = new THREE.Vector3(
            (Math.random() - 0.5) * 13,
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 6
        );
        sprite.position.copy(basePosition);

        return {
            sprite, canvas, ctx, texture, values, rows, cols, colorHex,
            baseScale: sprite.scale.clone(),
            basePosition,
            driftPhase: Math.random() * Math.PI * 2,
            glow: 0
        };
    }

    const tensors = [];
    for (let i = 0; i < TENSOR_COUNT; i++) {
        const t = createTensor();
        sceneGroup.add(t.sprite);
        tensors.push(t);
    }

    function pulseTensor(t, intensity) {
        t.glow = Math.max(t.glow, intensity);
    }

    function refreshRandomTensor() {
        const t = tensors[Math.floor(Math.random() * tensors.length)];
        t.values = randomMatrix(t.rows, t.cols);
        drawTensor(t.ctx, t.canvas.width, t.canvas.height, t.values, t.colorHex);
        t.texture.needsUpdate = true;
        pulseTensor(t, 1);
        triggerParticleRipple(t.basePosition);
    }
    setInterval(refreshRandomTensor, REFRESH_INTERVAL);

    // Sync with the particles.js background, same as the previous globe: a
    // tensor "updating" sends a brief brightness ripple outward through nearby
    // particles, tying the foreground/background layers together.
    const RIPPLE_RADIUS_PX = 420;
    const RIPPLE_DURATION = 1400;
    const RIPPLE_OPACITY_BOOST = 0.3;
    const RIPPLE_SIZE_BOOST = 3;
    const RIPPLE_COOLDOWN = 900;
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

    // Hover: raycast against the tensors to highlight (scale/brighten) whichever
    // one the cursor is over - lets a visitor "explore" the field. No caption.
    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2(-10, -10); // off-screen until first move

    window.addEventListener('mousemove', (e) => {
        pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
        pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    function updateHover() {
        raycaster.setFromCamera(pointerNDC, camera);
        const hits = raycaster.intersectObjects(tensors.map((t) => t.sprite));
        if (hits.length === 0) return;
        const hovered = tensors.find((t) => t.sprite === hits[0].object);
        if (hovered) pulseTensor(hovered, 1);
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

        tensors.forEach((t) => {
            // Gentle bob so idle tensors don't look frozen.
            t.sprite.position.y = t.basePosition.y + Math.sin(now * 0.0006 + t.driftPhase) * 0.18;

            if (t.glow > 0.001) {
                const s = 1 + 0.18 * t.glow;
                t.sprite.scale.set(t.baseScale.x * s, t.baseScale.y * s, 1);
                t.sprite.material.opacity = 0.85 + 0.15 * t.glow;
                t.glow *= 0.9;
            } else if (t.glow !== 0) {
                t.glow = 0;
                t.sprite.scale.copy(t.baseScale);
                t.sprite.material.opacity = 0.85;
            }
        });

        updateParticleRipples(now);
        renderer.render(scene, camera);
    }
    animate();
})();
