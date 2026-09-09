(function () {
    "use strict";

    if (!window.THREE) {
        console.error("Three.js is not loaded.");
        return;
    }

    const container = document.getElementById("manifold-bg");

    if (!container) {
        console.error("Cannot find #manifold-bg.");
        return;
    }

    /* =========================================================
       SCENE
       ========================================================= */

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
        40,
        window.innerWidth / window.innerHeight,
        0.1,
        100
    );

    camera.position.set(0, 2.8, 13);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
    });

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, 1.5)
    );

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    renderer.setClearColor(0x000000, 0);

    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.pointerEvents = "none";

    container.appendChild(renderer.domElement);

    /* =========================================================
       MANIFOLD GROUP
       ========================================================= */

    const manifold = new THREE.Group();

    manifold.position.set(
        0,
        -0.25,
        0
    );

    manifold.rotation.x = -0.45;

    scene.add(manifold);

    /* =========================================================
       MANIFOLD RESOLUTION
       ========================================================= */

    const COLS = 72;
    const ROWS = 20;

    const WIDTH = 21;
    const DEPTH = 7.5;

    const vertexCount = COLS * ROWS;

    const positions = new Float32Array(
        vertexCount * 3
    );

    const basePositions = new Float32Array(
        vertexCount * 3
    );

    const colors = new Float32Array(
        vertexCount * 3
    );

    const indices = [];

    /* =========================================================
       COLORS
       ========================================================= */

    const blue = new THREE.Color("#4f789b");
    const indigo = new THREE.Color("#656487");
    const violet = new THREE.Color("#8b6c87");
    const orange = new THREE.Color("#bf8d55");

    function gradientColor(t) {

        const c = new THREE.Color();

        if (t < 0.4) {

            c.lerpColors(
                blue,
                indigo,
                t / 0.4
            );

        } else if (t < 0.72) {

            c.lerpColors(
                indigo,
                violet,
                (t - 0.4) / 0.32
            );

        } else {

            c.lerpColors(
                violet,
                orange,
                (t - 0.72) / 0.28
            );
        }

        return c;
    }

    /* =========================================================
       PARAMETRIC HYPERBOLIC MANIFOLD
       ========================================================= */

    function getSurface(u, v) {

        /*
         * Asymmetric hyperbolic opening.
         */

        const funnel =
            1 +
            1.15 *
            Math.exp(
                -Math.pow(
                    (u + 6.4) / 2.5,
                    2
                )
            );

        const y =
            v * funnel;

        /*
         * Hyperbolic saddle component.
         */

        let z =
            0.31 *
            (
                (y * y) / 2.9
                -
                0.07 * u * u
            );

        /*
         * Large flowing waves.
         */

        z +=
            0.24 *
            Math.sin(
                u * 0.64
            ) *
            (
                0.32 +
                0.68 *
                Math.abs(v) /
                (DEPTH / 2)
            );

        /*
         * Small irregularity.
         */

        z +=
            0.045 *
            Math.cos(
                u * 0.32 +
                v * 1.15
            );

        return {
            x: u,
            y: y,
            z: z
        };
    }

    /* =========================================================
       CREATE VERTICES
       ========================================================= */

    let vertex = 0;

    for (let i = 0; i < COLS; i++) {

        const u =
            -WIDTH / 2 +
            WIDTH *
            i /
            (COLS - 1);

        const color =
            gradientColor(
                i /
                (COLS - 1)
            );

        for (let j = 0; j < ROWS; j++) {

            const v =
                -DEPTH / 2 +
                DEPTH *
                j /
                (ROWS - 1);

            const p =
                getSurface(
                    u,
                    v
                );

            const k =
                vertex * 3;

            positions[k] =
                basePositions[k] =
                p.x;

            positions[k + 1] =
                basePositions[k + 1] =
                p.y;

            positions[k + 2] =
                basePositions[k + 2] =
                p.z;

            colors[k] =
                color.r;

            colors[k + 1] =
                color.g;

            colors[k + 2] =
                color.b;

            vertex++;
        }
    }

    /* =========================================================
       TRIANGLES
       ========================================================= */

    for (let i = 0; i < COLS - 1; i++) {

        for (let j = 0; j < ROWS - 1; j++) {

            const a =
                i * ROWS + j;

            const b =
                (i + 1) * ROWS + j;

            const c =
                (i + 1) *
                ROWS +
                j + 1;

            const d =
                i * ROWS +
                j + 1;

            indices.push(
                a, b, d,
                b, c, d
            );
        }
    }

    const geometry =
        new THREE.BufferGeometry();

    geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
            positions,
            3
        )
    );

    geometry.setAttribute(
        "color",
        new THREE.BufferAttribute(
            colors,
            3
        )
    );

    geometry.setIndex(
        indices
    );

    /* =========================================================
       SURFACE
       ========================================================= */

    const surfaceMaterial =
        new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.035,
            side: THREE.DoubleSide,
            depthWrite: false
        });

    const surface =
        new THREE.Mesh(
            geometry,
            surfaceMaterial
        );

    manifold.add(surface);

    /* =========================================================
       LIVE WIREFRAME
       =========================================================

       IMPORTANT:
       Do NOT use THREE.WireframeGeometry here.

       We create the wireframe ourselves so that the
       exact same animated vertices are used.
       ========================================================= */

    const wirePositions = [];

    function addLine(a, b) {

        wirePositions.push(
            a.x, a.y, a.z,
            b.x, b.y, b.z
        );
    }

    /*
     * Horizontal lines.
     */

    for (let i = 0; i < COLS; i++) {

        for (let j = 0; j < ROWS - 1; j++) {

            const a =
                i * ROWS + j;

            const b =
                i * ROWS + j + 1;

            wirePositions.push(
                positions[a * 3],
                positions[a * 3 + 1],
                positions[a * 3 + 2],

                positions[b * 3],
                positions[b * 3 + 1],
                positions[b * 3 + 2]
            );
        }
    }

    /*
     * Vertical lines.
     */

    for (let i = 0; i < COLS - 1; i++) {

        for (let j = 0; j < ROWS; j++) {

            const a =
                i * ROWS + j;

            const b =
                (i + 1) * ROWS + j;

            wirePositions.push(
                positions[a * 3],
                positions[a * 3 + 1],
                positions[a * 3 + 2],

                positions[b * 3],
                positions[b * 3 + 1],
                positions[b * 3 + 2]
            );
        }
    }

    const wireArray =
        new Float32Array(
            wirePositions
        );

    const wireGeometry =
        new THREE.BufferGeometry();

    wireGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
            wireArray,
            3
        )
    );

    const wireMaterial =
        new THREE.LineBasicMaterial({
            color: 0x59636d,
            transparent: true,
            opacity: 0.16,
            depthWrite: false
        });

    const wireframe =
        new THREE.LineSegments(
            wireGeometry,
            wireMaterial
        );

    manifold.add(
        wireframe
    );

    /* =========================================================
       MOUSE
       ========================================================= */

    const mouse =
        new THREE.Vector2(
            0,
            0
        );

    const targetMouse =
        new THREE.Vector2(
            0,
            0
        );

    window.addEventListener(
        "mousemove",
        function (event) {

            targetMouse.x =
                (
                    event.clientX /
                    window.innerWidth
                ) * 2 - 1;

            targetMouse.y =
                -(
                    event.clientY /
                    window.innerHeight
                ) * 2 + 1;

        },
        {
            passive: true
        }
    );

    /* =========================================================
       RESIZE
       ========================================================= */

    function resize() {

        const width =
            window.innerWidth;

        const height =
            window.innerHeight;

        camera.aspect =
            width / height;

        camera.updateProjectionMatrix();

        renderer.setSize(
            width,
            height,
            false
        );

        /*
         * Oversize the manifold so that
         * it fills the entire screen.
         */

        const scale =
            width < 600
                ? 0.90
                : 1.10;

        manifold.scale.set(
            scale,
            scale,
            scale
        );
    }

    window.addEventListener(
        "resize",
        resize
    );

    resize();

    /* =========================================================
       ANIMATION
       ========================================================= */

    const clock =
        new THREE.Clock();

    function animate() {

        requestAnimationFrame(
            animate
        );

        const time =
            clock.getElapsedTime();

        /* -----------------------------------------------------
           Smooth mouse
           ----------------------------------------------------- */

        mouse.lerp(
            targetMouse,
            0.055
        );

        /* -----------------------------------------------------
           CONTINUOUS DEFAULT MOTION
           ----------------------------------------------------- */

        const idleY =
            Math.sin(
                time * 0.24
            ) * 0.17;

        const idleX =
            Math.sin(
                time * 0.17
            ) * 0.025;

        const idleZ =
            Math.cos(
                time * 0.15
            ) * 0.025;

        /* -----------------------------------------------------
           MOUSE ROTATION

           This is intentionally strong enough to be obvious.
           ----------------------------------------------------- */

        const mouseY =
            mouse.x * 0.38;

        const mouseX =
            mouse.y * 0.16;

        const mouseZ =
            mouse.x * 0.07;

        manifold.rotation.y =
            idleY +
            mouseY;

        manifold.rotation.x =
            -0.45 +
            idleX +
            mouseX;

        manifold.rotation.z =
            idleZ +
            mouseZ;

        /* -----------------------------------------------------
           DEFAULT TRANSLATION
           ----------------------------------------------------- */

        manifold.position.x =
            Math.sin(
                time * 0.12
            ) * 0.30;

        manifold.position.y =
            -0.25 +
            Math.cos(
                time * 0.16
            ) * 0.045;

        /* -----------------------------------------------------
           MOUSE-DRIVEN SURFACE WARP
           ----------------------------------------------------- */

        const px =
            mouse.x *
            WIDTH *
            0.48;

        const py =
            mouse.y *
            DEPTH *
            0.45;

        /*
         * First update the manifold vertices.
         */

        for (
            let i = 0;
            i < vertexCount;
            i++
        ) {

            const k =
                i * 3;

            const x =
                basePositions[k];

            const y =
                basePositions[k + 1];

            const dx =
                x - px;

            const dy =
                y - py;

            const distance =
                Math.sqrt(
                    dx * dx +
                    dy * dy
                );

            /*
             * Large interaction radius.
             */

            const influence =
                Math.exp(
                    -(
                        distance *
                        distance
                    ) / 4.0
                );

            /*
             * Strong travelling wave.
             */

            const ripple =
                Math.sin(
                    distance * 2.7 -
                    time * 3.2
                )
                *
                0.16
                *
                influence;

            /*
             * Strong upward deformation.
             */

            const lift =
                0.48 *
                influence
                +
                ripple;

            /*
             * Small horizontal displacement.
             */

            const sideShift =
                0.10 *
                influence;

            positions[k] =
                x +
                dx *
                sideShift;

            positions[k + 1] =
                y +
                dy *
                sideShift;

            positions[k + 2] =
                basePositions[k + 2]
                +
                lift;
        }

        /* -----------------------------------------------------
           UPDATE SURFACE
           ----------------------------------------------------- */

        geometry
            .attributes
            .position
            .needsUpdate = true;

        /* -----------------------------------------------------
           UPDATE WIREFRAME

           The wireframe receives the exact same animated
           positions as the surface.
           ----------------------------------------------------- */

        let wp = 0;

        /* Horizontal */

        for (
            let i = 0;
            i < COLS;
            i++
        ) {

            for (
                let j = 0;
                j < ROWS - 1;
                j++
            ) {

                const a =
                    i * ROWS + j;

                const b =
                    i * ROWS +
                    j + 1;

                const ak =
                    a * 3;

                const bk =
                    b * 3;

                wireArray[wp++] =
                    positions[ak];

                wireArray[wp++] =
                    positions[ak + 1];

                wireArray[wp++] =
                    positions[ak + 2];

                wireArray[wp++] =
                    positions[bk];

                wireArray[wp++] =
                    positions[bk + 1];

                wireArray[wp++] =
                    positions[bk + 2];
            }
        }

        /* Vertical */

        for (
            let i = 0;
            i < COLS - 1;
            i++
        ) {

            for (
                let j = 0;
                j < ROWS;
                j++
            ) {

                const a =
                    i * ROWS + j;

                const b =
                    (i + 1) *
                    ROWS + j;

                const ak =
                    a * 3;

                const bk =
                    b * 3;

                wireArray[wp++] =
                    positions[ak];

                wireArray[wp++] =
                    positions[ak + 1];

                wireArray[wp++] =
                    positions[ak + 2];

                wireArray[wp++] =
                    positions[bk];

                wireArray[wp++] =
                    positions[bk + 1];

                wireArray[wp++] =
                    positions[bk + 2];
            }
        }

        wireGeometry
            .attributes
            .position
            .needsUpdate = true;

        /* -----------------------------------------------------
           RENDER
           ----------------------------------------------------- */

        renderer.render(
            scene,
            camera
        );
    }

    animate();

})();
