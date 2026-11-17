// Home hero 3D studio (DEC-245). Source of `apps/web-app/public/hero-studio-3d.min.js`; rebuild with
//   pnpm exec esbuild apps/worker/src/brand/hero/hero-studio-3d.src.js --minify --target=es2019 \
//     --outfile=apps/web-app/public/hero-studio-3d.min.js
// Copy rules: no invented claims — the discount is a merchant-side value set per gerai (DEC-230/233), customers pay the
// publish tariff, onboarding is a team review (no KYC scan), services are Reguler/Ekonomi/Kargo only.
// Motion rules: the pause control and `prefers-reduced-motion` freeze the whole scene clock, not only the timeline.
(function(){
"use strict";

        function stageMetrics() {
            const wrapper = document.getElementById("stageWrapper");
            const w = wrapper ? Math.max(280, wrapper.clientWidth) : (window.innerWidth || 1280);
            const h = wrapper ? Math.max(360, wrapper.clientHeight) : (window.innerHeight || 720);
            const hdr = document.querySelector(".hdr");
            const bottomHud = document.getElementById("hudControls");
            const hdrH = hdr ? hdr.getBoundingClientRect().height : 68;
            const botH = bottomHud ? bottomHud.getBoundingClientRect().height : 68;
            const isMobile = w < 640;
            // On mobile, spatialCallout sits below header; give extra top clearance so 3D Hub never touches callout
            const topSafe = hdrH + (isMobile ? 104 : 52);
            const bottomSafe = botH + 18;
            const centerY = (topSafe + (h - bottomSafe)) * 0.5;
            const viewOffsetY = (h * 0.5) - centerY;
            return { w, h, isStacked: isMobile, viewOffsetX: 0, viewOffsetY };
        }
        let stageVisible = true;

        // 1. STORYBOARD & STATE CONFIGURATION
        // ---------------------------------------------------------------------
        const LOOP_SECONDS = 16.0;
        const ACTS = [
            {
                start: 0.0,
                end: 3.8,
                badge: "01 • DAFTAR",
                metric: "Online",
                title: "Daftar Akun Pemilik",
                desc: "Buat akun pemilik dan ajukan titik jemput gerai secara online.",
                camAzimuth: 0.36,
                camPolar: 1.06,
                camDist: 10.8,
                lookAt: [0.55, 1.55, -2.05]
            },
            {
                start: 3.8,
                end: 7.6,
                badge: "02 • TINJAUAN",
                metric: "Ditinjau Tim",
                title: "Tinjauan Pengajuan Gerai",
                desc: "Tim kami meninjau data gerai dan titik jemput, lalu akun Mengantar gerai dihubungkan.",
                camAzimuth: 0.12,
                camPolar: 1.08,
                camDist: 10.4,
                lookAt: [0.75, 1.65, -2.0]
            },
            {
                start: 7.6,
                end: 11.4,
                badge: "03 • BUKA GERAI",
                metric: "Multi-Kurir",
                title: "Satu Gerai, Banyak Ekspedisi",
                desc: "Bandingkan tarif 9 ekspedisi mitra Mengantar dalam satu meja kasir.",
                camAzimuth: -0.22,
                camPolar: 0.88,
                camDist: 15.6,
                lookAt: [-0.05, 1.25, -0.75]
            },
            {
                start: 11.4,
                end: 16.0,
                badge: "04 • KIRIM & UNTUNG",
                metric: "Diskon Mitra",
                title: "Jangkau Seluruh Indonesia",
                desc: "Pelanggan bayar tarif publik; gerai mendapat diskon mitra sesuai akun Mengantar-nya.",
                camAzimuth: 0.02,
                camPolar: 0.70,
                camDist: 19.8,
                lookAt: [0.0, 0.55, 1.25]
            }
        ];

        // Geographic Projection Helper: Real Longitude/Latitude -> Studio (X, Z)
        // Center Longitude = 118°E (Selat Makassar), Equator 0° -> Z = 1.95
        function lonLatToXZ(lon, lat) {
            const x = (lon - 118.0) * 0.345;
            const z = 1.95 - lat * 0.345;
            return [x, z];
        }

        let scene, camera, renderer;
        let isPlaying = true;
        let timeline = 0;
        let currentAct = -1;
        let lastTick = performance.now();
        // Scene clock: advances only while playing, so pause and reduced motion freeze every animation (DEC-245).
        let sceneClock = 0;
        // While paused, frames are drawn until both the deadline and a minimum frame count are spent (the camera eases
        // to its framing at the same speed on slow GPUs), then drawing stops.
        let settleUntil = 0;
        let settleFrames = 0;
        const settle = (ms, frames) => {
            settleUntil = Math.max(settleUntil, performance.now() + ms);
            settleFrames = Math.max(settleFrames, frames);
        };
        let renderCount = 0;

        // Interactive Camera Orbit Offsets (Mouse & Touch)
        let isDragging = false;
        let dragStartX = 0, dragStartY = 0;
        let pointerDownX = 0, pointerDownY = 0;
        let userAzimuthOffset = 0;
        let userPolarOffset = 0;
        let smoothAzimuth = ACTS[0].camAzimuth;
        let smoothPolar = ACTS[0].camPolar;
        let smoothDist = ACTS[0].camDist;
        const smoothLookAt = new THREE.Vector3(...ACTS[0].lookAt);

        // 3D Rig References
        const rig = {
            hubGroup: null,
            shutterDoor: null,
            scannerBeamMesh: null,
            FloatingBadge25: null,
            expeditionOrbitGroup: null,
            expeditionPods: [],
            beltChevrons: [],
            conveyorParcels: [],
            character: {},
            kycRing: null,
            kycRingTop: null,
            radarSweep: null,
            mapPins: [],
            arcRoutes: [],
            shockwaves: [],
            cuanTokens: [],
            ambientDots: null
        };

        // ---------------------------------------------------------------------
        // 2. CRISP PROCEDURAL CANVAS TEXTURES (NO Z-FIGHTING, MIPMAP SMOOTHED)
        // ---------------------------------------------------------------------
        function makeSignTexture(w, h, drawFn) {
            const c = document.createElement("canvas");
            c.width = w;
            c.height = h;
            const ctx = c.getContext("2d");
            drawFn(ctx, w, h);
            const tex = new THREE.CanvasTexture(c);
            if (renderer) {
                tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
            }
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.needsUpdate = true;
            return tex;
        }

        // High-Contrast Architectural Cartography Surface for Nusantara Map
        function createIndonesiaCartographyTexture() {
            return makeSignTexture(2048, 1024, (ctx, w, h) => {
                ctx.clearRect(0, 0, w, h);

                // Rounded Stadium Sea Basin
                const pad = 28;
                const grad = ctx.createLinearGradient(0, pad, 0, h - pad);
                grad.addColorStop(0, "#E6F0FF");
                grad.addColorStop(0.5, "#DCEAFE");
                grad.addColorStop(1, "#E8F2FF");

                ctx.fillStyle = grad;
                roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 160);
                ctx.fill();

                ctx.save();
                roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 160);
                ctx.clip();

                // Crisp Blueprint Coordinate Grid (Garis Bujur & Lintang)
                ctx.strokeStyle = "rgba(0, 82, 255, 0.09)";
                ctx.lineWidth = 2;
                for (let x = 128; x < w; x += 128) {
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, h);
                    ctx.stroke();
                }
                for (let y = 128; y < h; y += 128) {
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(w, y);
                    ctx.stroke();
                }

                // True Equator Line (0° Garis Khatulistiwa sits at Z=1.95 on deck centered at Z=2.85, height=7.4 -> y ratio ~ 0.378)
                const eqY = Math.round(h * 0.378);
                ctx.strokeStyle = "rgba(0, 82, 255, 0.32)";
                ctx.lineWidth = 3;
                ctx.setLineDash([16, 12]);
                ctx.beginPath();
                ctx.moveTo(pad + 40, eqY);
                ctx.lineTo(w - pad - 40, eqY);
                ctx.stroke();
                ctx.setLineDash([]);

                // Subtle Architectural Cartographic Labels
                ctx.fillStyle = "rgba(0, 82, 255, 0.48)";
                ctx.font = "700 22px Inter, sans-serif";
                ctx.textAlign = "left";
                ctx.fillText("0° GARIS KHATULISTIWA", pad + 90, eqY - 12);

                ctx.fillStyle = "rgba(15, 23, 42, 0.28)";
                ctx.font = "800 26px Inter, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("JANGKAUAN PENGIRIMAN SELURUH INDONESIA • SABANG — MERAUKE", w / 2, h - 68);

                ctx.fillStyle = "rgba(37, 99, 235, 0.26)";
                ctx.font = "700 20px Inter, sans-serif";
                ctx.fillText("LAUT JAWA", w * 0.40, h * 0.61);
                ctx.fillText("LAUT BANDA", w * 0.69, h * 0.58);
                ctx.fillText("SAMUDRA HINDIA", w * 0.26, h * 0.82);

                ctx.restore();

                // Crisp Architectural Double Border
                ctx.strokeStyle = "#93C5FD";
                ctx.lineWidth = 6;
                roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 160);
                ctx.stroke();
            });
        }

        function createFasciaTexture() {
            return makeSignTexture(1024, 200, (ctx, w, h) => {
                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(0, 0, w, h);

                // Subtle bottom border accent inside sign
                ctx.fillStyle = "#EFF6FF";
                ctx.fillRect(0, h - 10, w, 10);

                // Official GE Brand Tile
                ctx.fillStyle = "#F8FAFC";
                roundRect(ctx, 40, 36, 136, 128, 28);
                ctx.fill();
                ctx.strokeStyle = "#CBD5E1";
                ctx.lineWidth = 3;
                ctx.stroke();

                ctx.strokeStyle = "#00A6FE";
                ctx.lineWidth = 7;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.arc(106, 112, 54, Math.PI * 1.02, Math.PI * 1.84);
                ctx.stroke();

                ctx.fillStyle = "#012676";
                ctx.font = "italic 900 62px Inter, Arial, sans-serif";
                ctx.fillText("G", 56, 126);
                ctx.fillStyle = "#0060FE";
                ctx.fillText("E", 106, 126);

                // Brand Title
                ctx.fillStyle = "#0F172A";
                ctx.font = "800 66px Inter, sans-serif";
                ctx.fillText("GERAI EXPRESS", 200, 110);

                ctx.fillStyle = "#64748B";
                ctx.font = "600 26px Inter, sans-serif";
                ctx.fillText("AGEN KIRIM PAKET MULTI-EKSPEDISI", 204, 150);

                // Right partner pill
                ctx.fillStyle = "#EFF6FF";
                roundRect(ctx, 762, 52, 218, 96, 48);
                ctx.fill();
                ctx.strokeStyle = "#93C5FD";
                ctx.lineWidth = 4;
                ctx.stroke();

                ctx.fillStyle = "#0052FF";
                ctx.font = "800 40px Inter, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("MITRA", 871, 114);
            });
        }

        function createBackwallTexture() {
            return makeSignTexture(1024, 512, (ctx, w, h) => {
                ctx.fillStyle = "#F8FAFC";
                ctx.fillRect(0, 0, w, h);

                ctx.strokeStyle = "#E2E8F0";
                ctx.lineWidth = 2;
                for (let x = 64; x < w; x += 64) {
                    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
                }

                const tiers = [
                    { label: "REGULER", sub: "Paket Harian", col: "#0052FF" },
                    { label: "EKONOMI", sub: "Rute Tertentu", col: "#1D4ED8" },
                    { label: "COD", sub: "Bayar di Tujuan", col: "#2563EB" },
                    { label: "KARGO", sub: "Mulai 5 kg", col: "#0F172A" }
                ];

                tiers.forEach((t, idx) => {
                    const x = 64 + idx * 230;
                    ctx.fillStyle = "#FFFFFF";
                    roundRect(ctx, x, 68, 204, 150, 24);
                    ctx.fill();
                    ctx.strokeStyle = "#CBD5E1";
                    ctx.lineWidth = 3;
                    ctx.stroke();

                    ctx.fillStyle = t.col;
                    roundRect(ctx, x + 22, 92, 68, 18, 9);
                    ctx.fill();

                    ctx.fillStyle = "#0F172A";
                    ctx.font = "800 30px Inter, sans-serif";
                    ctx.fillText(t.label, x + 22, 154);

                    ctx.fillStyle = "#64748B";
                    ctx.font = "600 22px Inter, sans-serif";
                    ctx.fillText(t.sub, x + 22, 190);
                });
            });
        }

        function createTabletTexture(verified = false) {
            return makeSignTexture(256, 340, (ctx, w, h) => {
                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(0, 0, w, h);

                ctx.fillStyle = "#0052FF";
                ctx.fillRect(0, 0, w, 58);

                ctx.fillStyle = "#FFFFFF";
                ctx.font = "800 22px Inter, sans-serif";
                ctx.fillText("MITRA GERAI", 24, 37);

                if (!verified) {
                    ctx.fillStyle = "#E2E8F0";
                    roundRect(ctx, 24, 86, 208, 28, 10); ctx.fill();
                    roundRect(ctx, 24, 130, 176, 28, 10); ctx.fill();
                    roundRect(ctx, 24, 174, 208, 28, 10); ctx.fill();

                    ctx.fillStyle = "#0052FF";
                    roundRect(ctx, 24, 242, 208, 54, 27); ctx.fill();
                    ctx.fillStyle = "#FFFFFF";
                    ctx.font = "800 22px Inter, sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText("DAFTAR", 128, 277);
                } else {
                    ctx.fillStyle = "#EFF6FF";
                    ctx.beginPath();
                    ctx.arc(128, 168, 62, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.strokeStyle = "#0052FF";
                    ctx.lineWidth = 14;
                    ctx.lineCap = "round";
                    ctx.lineJoin = "round";
                    ctx.beginPath();
                    ctx.moveTo(98, 168);
                    ctx.lineTo(120, 190);
                    ctx.lineTo(162, 144);
                    ctx.stroke();

                    ctx.fillStyle = "#0F172A";
                    ctx.font = "800 24px Inter, sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText("DISETUJUI", 128, 278);
                }
            });
        }

        function createBadge25Texture() {
            return makeSignTexture(256, 256, (ctx) => {
                ctx.fillStyle = "#0052FF";
                ctx.beginPath();
                ctx.arc(128, 128, 116, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = "#FFFFFF";
                ctx.lineWidth = 8;
                ctx.beginPath();
                ctx.arc(128, 128, 100, 0, Math.PI * 2);
                ctx.stroke();

                ctx.fillStyle = "#FFFFFF";
                ctx.font = "800 66px Inter, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("9", 128, 134);

                ctx.font = "700 24px Inter, sans-serif";
                ctx.fillText("EKSPEDISI", 128, 174);
            });
        }

        function createCityPillSprite(cityName) {
            const tex = makeSignTexture(310, 88, (ctx, w, h) => {
                ctx.clearRect(0, 0, w, h);
                ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
                roundRect(ctx, 8, 10, w - 16, h - 20, 34);
                ctx.fill();

                ctx.strokeStyle = "#60A5FA";
                ctx.lineWidth = 4;
                ctx.stroke();

                ctx.fillStyle = "#38BDF8";
                ctx.beginPath();
                ctx.arc(42, h / 2, 10, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = "#FFFFFF";
                ctx.font = "800 31px Inter, sans-serif";
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillText(cityName, 64, h / 2 + 1);
            });
            const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(1.38, 0.39, 1);
            return sprite;
        }

        function createCarrierTagSprite(label, accentHex) {
            const tex = makeSignTexture(240, 76, (ctx, w, h) => {
                ctx.clearRect(0, 0, w, h);
                ctx.fillStyle = "#FFFFFF";
                roundRect(ctx, 6, 6, w - 12, h - 12, 30);
                ctx.fill();
                ctx.strokeStyle = accentHex;
                ctx.lineWidth = 5;
                ctx.stroke();

                ctx.fillStyle = accentHex;
                ctx.font = "800 28px Inter, sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(label, w / 2, h / 2 + 1);
            });
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
            sprite.scale.set(1.05, 0.33, 1);
            return sprite;
        }

        function roundRect(ctx, x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        }

        // ---------------------------------------------------------------------
        // 3. BUILD 3D SCENE, LIGHTING & ARCHITECTURAL STUDIO
        // ---------------------------------------------------------------------
        function initScene() {
            const canvas = document.getElementById("webglCanvas");
            scene = new THREE.Scene();
            scene.fog = new THREE.Fog("#F4F7FB", 28, 60);

            const initM = stageMetrics();
            camera = new THREE.PerspectiveCamera(36, initM.w / initM.h, 0.2, 110);

            try {
                renderer = new THREE.WebGLRenderer({
                    canvas,
                    antialias: true,
                    alpha: true,
                    powerPreference: "high-performance"
                });
            } catch {
                return false;
            }
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.setSize(initM.w, initM.h, false);
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            renderer.outputEncoding = THREE.sRGBEncoding;

            // Clean Daylight Studio Illumination
            const hemiLight = new THREE.HemisphereLight(0xFFFFFF, 0xDBEAFE, 0.94);
            hemiLight.position.set(0, 22, 0);
            scene.add(hemiLight);

            const keyLight = new THREE.DirectionalLight(0xFFFFFF, 0.85);
            keyLight.position.set(10, 20, 13);
            keyLight.castShadow = true;
            keyLight.shadow.mapSize.width = 2048;
            keyLight.shadow.mapSize.height = 2048;
            keyLight.shadow.camera.near = 2;
            keyLight.shadow.camera.far = 50;
            const d = 15;
            keyLight.shadow.camera.left = -d;
            keyLight.shadow.camera.right = d;
            keyLight.shadow.camera.top = d;
            keyLight.shadow.camera.bottom = -d;
            keyLight.shadow.bias = -0.0004;
            scene.add(keyLight);

            const blueRimLight = new THREE.DirectionalLight(0x60A5FA, 0.40);
            blueRimLight.position.set(-12, 10, -10);
            scene.add(blueRimLight);

            buildStudioFloorAndIndonesiaMap();
            buildGeraiExpressHub();
            buildPartnerCharacter();
            buildLogisticsRoutes();
            buildAmbientParticles();
            setupInteractions();
            handleResize();
            return true;
        }

        // ---------------------------------------------------------------------
        // 4. PRECISION GEOGRAPHIC 3D INDONESIA MAP & HIGH-CONTRAST PINS
        // ---------------------------------------------------------------------
        function buildDetailedIsland3D(lonLatCoords, mats) {
            const group = new THREE.Group();
            const ptsXZ = lonLatCoords.map(([lon, lat]) => lonLatToXZ(lon, lat));

            const shape = new THREE.Shape();
            ptsXZ.forEach(([x, z], idx) => {
                if (idx === 0) shape.moveTo(x, -z);
                else shape.lineTo(x, -z);
            });
            shape.closePath();

            // 1. Shallow Coastal Reef Shelf (Soft Azure Halo for instant silhouette separation)
            const shelfGeo = new THREE.ExtrudeGeometry(shape, {
                depth: 0.04,
                bevelEnabled: true,
                bevelThickness: 0.02,
                bevelSize: 0.085,
                bevelSegments: 2
            });
            const shelfMesh = new THREE.Mesh(shelfGeo, mats.shelfMat);
            shelfMesh.rotation.x = -Math.PI / 2;
            shelfMesh.position.y = 0.045;
            shelfMesh.receiveShadow = true;
            group.add(shelfMesh);

            // 2. High-Contrast Brand Blue 3D Island Relief (Top Azure + Royal Cliff Sides)
            const landGeo = new THREE.ExtrudeGeometry(shape, {
                depth: 0.21,
                bevelEnabled: true,
                bevelThickness: 0.032,
                bevelSize: 0.024,
                bevelSegments: 3
            });
            const landMesh = new THREE.Mesh(landGeo, [mats.landTopMat, mats.landSideMat]);
            landMesh.rotation.x = -Math.PI / 2;
            landMesh.position.y = 0.075;
            landMesh.castShadow = true;
            landMesh.receiveShadow = true;
            group.add(landMesh);

            // 3. Crisp White Top Coastline Contour Line (Makes every peninsula & island unmistakable)
            const contourPts = shape.getPoints(32).map((p) => new THREE.Vector3(p.x, 0.322, -p.y));
            if (contourPts.length > 0) {
                contourPts.push(contourPts[0].clone());
            }
            const contourGeo = new THREE.BufferGeometry().setFromPoints(contourPts);
            const contourLine = new THREE.Line(contourGeo, mats.coastOutlineMat);
            group.add(contourLine);

            return group;
        }

        function create3DLocationPin(cityLabel) {
            const pinRoot = new THREE.Group();

            // Glossy Pure White Pin Body for Maximum Contrast Against Brand-Blue Islands
            const pinWhiteMat = new THREE.MeshStandardMaterial({
                color: 0xFFFFFF,
                roughness: 0.16,
                metalness: 0.06
            });
            const coreBlueMat = new THREE.MeshStandardMaterial({
                color: 0x0052FF,
                roughness: 0.2,
                emissive: 0x0038B8,
                emissiveIntensity: 0.28
            });

            // Animated Bounce Wrapper
            const body = new THREE.Group();
            pinRoot.add(body);

            // Teardrop Pin: Glossy White Sphere + Inverted Cone
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 24), pinWhiteMat);
            bulb.position.y = 0.56;
            bulb.castShadow = true;
            body.add(bulb);

            const tipCone = new THREE.Mesh(new THREE.ConeGeometry(0.198, 0.44, 24), pinWhiteMat);
            tipCone.rotation.x = Math.PI;
            tipCone.position.y = 0.24;
            tipCone.castShadow = true;
            body.add(tipCone);

            // Crisp Brand-Blue Center Dot (Visible Front & Back)
            const coreDot = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.46, 20), coreBlueMat);
            coreDot.rotation.x = Math.PI / 2;
            coreDot.position.y = 0.56;
            body.add(coreDot);

            // High-Contrast Dark-Slate & Cyan City Pill Above Pin
            const labelSprite = createCityPillSprite(cityLabel);
            labelSprite.position.y = 1.04;
            body.add(labelSprite);

            // Crisp White + Cyan Ground Target Beacon Ring Under Pin
            const baseRing = new THREE.Mesh(
                new THREE.RingGeometry(0.20, 0.34, 32),
                new THREE.MeshBasicMaterial({
                    color: 0xFFFFFF,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.88
                })
            );
            baseRing.rotation.x = -Math.PI / 2;
            baseRing.position.y = 0.03;
            pinRoot.add(baseRing);

            return { pinRoot, body, baseRing };
        }

        function buildStudioFloorAndIndonesiaMap() {
            // Infinite Shadow-Catching White Studio Floor
            const floor = new THREE.Mesh(
                new THREE.PlaneGeometry(130, 130),
                new THREE.ShadowMaterial({ opacity: 0.085 })
            );
            floor.rotation.x = -Math.PI / 2;
            floor.position.y = 0;
            floor.receiveShadow = true;
            scene.add(floor);

            // Subtle Studio Polar Grid
            const polarGrid = new THREE.PolarGridHelper(17, 16, 6, 64, 0xCBD5E1, 0xE2E8F0);
            polarGrid.position.y = 0.006;
            scene.add(polarGrid);

            // Architectural Plinth under Gerai Express Hub (Positioned cleanly North of Archipelago)
            const plinthMat = new THREE.MeshStandardMaterial({
                color: 0xFFFFFF,
                roughness: 0.24,
                metalness: 0.04
            });
            const hubPlinth = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.45, 0.20, 64), plinthMat);
            hubPlinth.position.set(0, 0.10, -3.10);
            hubPlinth.receiveShadow = true;
            hubPlinth.castShadow = true;
            scene.add(hubPlinth);

            const hubRing = new THREE.Mesh(
                new THREE.RingGeometry(3.50, 3.58, 64),
                new THREE.MeshBasicMaterial({ color: 0x0052FF, side: THREE.DoubleSide, transparent: true, opacity: 0.32 })
            );
            hubRing.rotation.x = -Math.PI / 2;
            hubRing.position.set(0, 0.014, -3.10);
            scene.add(hubRing);

            // Framed Cartographic Sea Basin for Kepulauan Indonesia (Spans 94°E to 142°E, 7°N to 12°S)
            const cartographyPlane = new THREE.Mesh(
                new THREE.PlaneGeometry(17.8, 7.5),
                new THREE.MeshBasicMaterial({
                    map: createIndonesiaCartographyTexture(),
                    transparent: true,
                    polygonOffset: true,
                    polygonOffsetFactor: -1,
                    polygonOffsetUnits: -1
                })
            );
            cartographyPlane.rotation.x = -Math.PI / 2;
            cartographyPlane.position.set(0.0, 0.022, 2.85);
            scene.add(cartographyPlane);

            // Rotating Radar Sweep Across Nusantara Map
            const radarGroup = new THREE.Group();
            radarGroup.position.set(0.0, 0.055, 2.65);
            const radarWedge = new THREE.Mesh(
                new THREE.CircleGeometry(8.2, 36, 0, Math.PI * 0.20),
                new THREE.MeshBasicMaterial({
                    color: 0x0052FF,
                    transparent: true,
                    opacity: 0.08,
                    side: THREE.DoubleSide,
                    depthWrite: false
                })
            );
            radarWedge.rotation.x = -Math.PI / 2;
            radarGroup.add(radarWedge);
            scene.add(radarGroup);
            rig.radarSweep = radarGroup;

            // High-Contrast Brand-Blue Island Materials + Crisp White Coastline Contour
            const islandMats = {
                shelfMat: new THREE.MeshStandardMaterial({
                    color: 0x93C5FD,
                    roughness: 0.35,
                    metalness: 0.02
                }),
                landTopMat: new THREE.MeshStandardMaterial({
                    color: 0x1D4ED8,
                    roughness: 0.26,
                    metalness: 0.06,
                    emissive: 0x002680,
                    emissiveIntensity: 0.14
                }),
                landSideMat: new THREE.MeshStandardMaterial({
                    color: 0x003BB5,
                    roughness: 0.34,
                    metalness: 0.08
                }),
                coastOutlineMat: new THREE.LineBasicMaterial({
                    color: 0xFFFFFF,
                    transparent: true,
                    opacity: 0.88
                })
            };

            // Authentic Geographic Silhouettes (Longitude °E, Latitude °N/-°S) — Sabang to Merauke
            const indonesiaGeoIslands = [
                // 1. SUMATRA (Aceh NW -> Medan -> Riau -> Palembang -> Lampung SE)
                [
                    [95.2, 5.6], [97.5, 5.2], [98.9, 3.8], [100.0, 2.2], [101.6, 0.9],
                    [103.6, -0.8], [104.9, -2.3], [105.9, -4.4], [105.8, -5.9], [104.5, -5.8],
                    [103.6, -4.8], [102.1, -3.5], [100.4, -1.2], [99.1, 0.4], [97.8, 2.0], [96.2, 4.1]
                ],
                // Pulau Nias & Mentawai (Siberut)
                [[97.0, 1.6], [97.9, 1.1], [97.8, 0.5], [96.9, 1.0]],
                [[98.5, -0.9], [99.3, -1.4], [99.1, -2.0], [98.4, -1.5]],
                // Kepulauan Riau (Batam & Bintan)
                [[103.8, 1.25], [104.7, 1.15], [104.6, 0.65], [103.8, 0.75]],
                // Pulau Bangka & Belitung
                [[105.1, -1.5], [106.2, -1.9], [106.7, -2.9], [105.9, -3.15], [105.7, -2.4], [105.1, -2.1]],
                [[107.4, -2.5], [108.3, -2.6], [108.2, -3.25], [107.4, -3.15]],

                // 2. JAWA (Banten -> Jakarta -> Semarang -> Surabaya -> Banyuwangi)
                [
                    [105.2, -6.7], [106.0, -5.9], [106.9, -6.0], [108.4, -6.3], [109.7, -6.85],
                    [110.9, -6.5], [111.9, -6.8], [112.8, -7.2], [114.4, -7.7], [114.5, -8.65],
                    [113.4, -8.5], [112.1, -8.3], [110.4, -8.05], [108.6, -7.7], [106.5, -7.4]
                ],
                // Pulau Madura
                [[112.7, -6.85], [114.1, -6.9], [114.0, -7.25], [112.7, -7.18]],

                // 3. BALI & KEPULAUAN NUSA TENGGARA (Bali, Lombok, Sumbawa, Flores, Sumba, Timor)
                [[114.5, -8.08], [115.65, -8.2], [115.7, -8.8], [115.05, -8.82], [114.55, -8.4]],
                [[115.9, -8.22], [116.68, -8.32], [116.62, -8.92], [115.9, -8.85]],
                [[116.85, -8.38], [117.7, -8.15], [118.4, -8.32], [119.15, -8.5], [119.05, -8.98], [117.9, -8.92], [116.85, -9.02]],
                [[119.8, -8.32], [121.2, -8.38], [122.4, -8.22], [123.35, -8.25], [123.25, -8.72], [121.8, -8.88], [119.9, -8.82]],
                [[118.95, -9.35], [120.25, -9.58], [120.85, -10.15], [120.2, -10.4], [119.05, -9.82]],
                [[123.5, -10.2], [124.5, -9.3], [125.7, -8.85], [126.9, -8.45], [127.05, -8.9], [125.3, -9.65], [123.7, -10.48]],

                // 4. KALIMANTAN (Pontianak, Tarakan, Semenanjung Mangkalihat, Balikpapan, Banjarmasin)
                [
                    [108.9, 0.8], [109.6, 2.0], [111.4, 2.8], [113.3, 3.3], [115.4, 4.25],
                    [117.7, 4.15], [117.9, 3.25], [117.5, 2.1], [118.95, 1.0], [117.6, 0.3],
                    [116.85, -1.3], [116.3, -2.85], [115.9, -3.65], [114.5, -4.15], [113.3, -3.4],
                    [111.8, -3.55], [110.15, -2.9], [109.9, -1.6], [109.05, -0.3]
                ],

                // 5. SULAWESI (4-Arm Iconic Orchid K-Silhouette + Pulau Buton)
                [
                    [119.8, 0.85], [120.9, 1.3], [123.2, 0.92], [125.15, 1.65], [125.25, 1.08],
                    [123.5, 0.38], [121.0, 0.48], [120.2, -0.4], [120.8, -1.18], [122.4, -0.78],
                    [123.55, -0.88], [123.35, -1.52], [121.6, -1.82], [122.15, -3.1], [123.05, -4.1],
                    [122.4, -4.82], [121.5, -4.4], [120.9, -2.82], [120.42, -3.4], [120.55, -5.55],
                    [119.38, -5.62], [119.48, -4.0], [118.78, -3.4], [118.78, -2.3], [119.3, -1.1]
                ],
                [[122.5, -4.55], [123.25, -4.5], [123.05, -5.55], [122.42, -5.52]],

                // 6. KEPULAUAN MALUKU (Halmahera, Buru, Seram & Ambon, Kepulauan Aru)
                [
                    [127.45, 2.15], [128.05, 2.2], [128.05, 1.3], [128.75, 1.55], [128.65, 0.9],
                    [128.0, 0.7], [128.75, 0.2], [128.3, -0.25], [127.8, 0.28], [127.9, -0.82],
                    [127.38, -0.75], [127.4, 0.9]
                ],
                [[125.95, -3.08], [127.22, -3.18], [127.12, -3.85], [125.95, -3.72]],
                [[127.8, -2.78], [130.65, -2.98], [130.85, -3.65], [127.95, -3.55]],
                [[134.15, -5.35], [134.85, -5.45], [134.75, -6.85], [134.1, -6.75]],

                // 7. PAPUA (Kepala Burung Sorong, Teluk Cenderawasih, Jayapura & Merauke + Raja Ampat & Biak)
                [
                    [130.85, -0.9], [132.4, -0.38], [134.15, -0.82], [134.3, -2.1], [134.9, -3.1],
                    [136.2, -2.1], [138.25, -1.68], [140.95, -2.58], [141.02, -9.12], [139.6, -8.4],
                    [137.85, -8.3], [138.4, -7.45], [137.5, -5.35], [135.2, -4.4], [134.3, -3.7],
                    [133.45, -4.02], [132.15, -2.9], [133.45, -2.4], [131.85, -1.6]
                ],
                [[130.15, -0.05], [131.2, -0.08], [131.1, -0.48], [130.15, -0.42]],
                [[135.45, -0.85], [136.55, -1.08], [136.45, -1.45], [135.45, -1.22]]
            ];

            indonesiaGeoIslands.forEach((coords) => {
                const islandObj = buildDetailedIsland3D(coords, islandMats);
                scene.add(islandObj);
            });

            // 8 Strategic Nationwide Location Pins Mapped to Exact Geographic Cities
            const pinCities = [
                { city: "Medan", lon: 98.35, lat: 3.35 },
                { city: "Jakarta", lon: 106.85, lat: -6.55 },
                { city: "Surabaya", lon: 112.65, lat: -7.65 },
                { city: "Denpasar", lon: 115.15, lat: -8.48 },
                { city: "Balikpapan", lon: 116.05, lat: -1.25 },
                { city: "Makassar", lon: 119.95, lat: -4.85 },
                { city: "Ambon", lon: 129.25, lat: -3.22 },
                { city: "Jayapura", lon: 139.85, lat: -3.45 }
            ];

            pinCities.forEach((loc, idx) => {
                const [px, pz] = lonLatToXZ(loc.lon, loc.lat);
                const { pinRoot, body, baseRing } = create3DLocationPin(loc.city);
                pinRoot.position.set(px, 0.32, pz);
                scene.add(pinRoot);

                rig.mapPins.push({
                    city: loc.city,
                    pinRoot,
                    body,
                    baseRing,
                    targetPoint: new THREE.Vector3(px, 0.58, pz),
                    bounceVel: 0,
                    bounceY: 0,
                    phase: idx * 0.85
                });
            });

            // Subtle Inter-Island Backbone Network Connecting West -> Central -> East Indonesia
            const backboneOrder = [0, 1, 2, 3, 4, 5, 6, 7];
            const netPoints = backboneOrder.map((i) => {
                const p = rig.mapPins[i].pinRoot.position;
                return new THREE.Vector3(p.x, 0.34, p.z);
            });
            const netCurve = new THREE.CatmullRomCurve3(netPoints);
            const netGeo = new THREE.TubeGeometry(netCurve, 72, 0.014, 6, false);
            const netMesh = new THREE.Mesh(
                netGeo,
                new THREE.MeshBasicMaterial({ color: 0x60A5FA, transparent: true, opacity: 0.45 })
            );
            scene.add(netMesh);
        }

        // ---------------------------------------------------------------------
        // 5. ARCHITECTURAL "GERAI EXPRESS" SMART HUB (ZERO GLITCH SIGNAGE)
        // ---------------------------------------------------------------------
        function buildGeraiExpressHub() {
            const hub = new THREE.Group();
            hub.position.set(-0.45, 0.20, -3.35);
            rig.hubGroup = hub;

            const whiteShellMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.22, metalness: 0.04 });
            const brandBlueMat = new THREE.MeshStandardMaterial({ color: 0x0052FF, roughness: 0.24, metalness: 0.08 });
            const slateTrimMat = new THREE.MeshStandardMaterial({ color: 0x0F172A, roughness: 0.35, metalness: 0.15 });
            const softInteriorMat = new THREE.MeshStandardMaterial({ color: 0xF1F5F9, roughness: 0.5 });

            // Back & Side Architectural Walls
            const backWall = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.75, 0.22), whiteShellMat);
            backWall.position.set(0, 1.375, -1.1);
            backWall.castShadow = true;
            backWall.receiveShadow = true;
            hub.add(backWall);

            // Multi-Expedition Graphic Panel Inside Back Wall (Clean offset + polygonOffset)
            const wallGraphic = new THREE.Mesh(
                new THREE.PlaneGeometry(3.32, 1.62),
                new THREE.MeshBasicMaterial({
                    map: createBackwallTexture(),
                    polygonOffset: true,
                    polygonOffsetFactor: -1,
                    polygonOffsetUnits: -1
                })
            );
            wallGraphic.position.set(0, 1.65, -0.96);
            hub.add(wallGraphic);

            const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 2.75, 2.2), whiteShellMat);
            leftPillar.position.set(-1.77, 1.375, -0.1);
            leftPillar.castShadow = true;
            leftPillar.receiveShadow = true;
            hub.add(leftPillar);

            const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 2.75, 2.2), whiteShellMat);
            rightPillar.position.set(1.77, 1.375, -0.1);
            rightPillar.castShadow = true;
            rightPillar.receiveShadow = true;
            hub.add(rightPillar);

            // Interior Parcel Rack & Neat Kraft Boxes
            const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.65), softInteriorMat);
            shelf.position.set(0, 0.85, -0.68);
            hub.add(shelf);

            for (let i = 0; i < 4; i++) {
                const p = createKraftParcel(0.42, 0.34, 0.38);
                p.position.set(-1.05 + i * 0.7, 1.06, -0.65);
                hub.add(p);
            }

            // Cantilevered Modern Roof Fascia (Non-overlapping geometry -> ZERO Z-fighting!)
            const roof = new THREE.Mesh(new THREE.BoxGeometry(4.32, 0.84, 2.60), whiteShellMat);
            roof.position.set(0, 3.04, 0.02);
            roof.castShadow = true;
            roof.receiveShadow = true;
            hub.add(roof);

            // Signature Blue Architectural Crown Trim (Seated cleanly ABOVE roof top y=3.46)
            const blueCrown = new THREE.Mesh(new THREE.BoxGeometry(4.38, 0.12, 2.66), brandBlueMat);
            blueCrown.position.set(0, 3.53, 0.02);
            blueCrown.castShadow = true;
            hub.add(blueCrown);

            // Raised Signboard Architectural Bezel Frame in Front of Roof (z=1.35)
            const fasciaFrame = new THREE.Mesh(new THREE.BoxGeometry(4.02, 0.72, 0.08), slateTrimMat);
            fasciaFrame.position.set(0, 3.04, 1.35);
            hub.add(fasciaFrame);

            // Crisp Fascia Signboard Seated Cleanly in Front of Frame (z=1.402, well below blueCrown)
            const fasciaSign = new THREE.Mesh(
                new THREE.PlaneGeometry(3.92, 0.64),
                new THREE.MeshBasicMaterial({
                    map: createFasciaTexture(),
                    polygonOffset: true,
                    polygonOffsetFactor: -2,
                    polygonOffsetUnits: -2
                })
            );
            fasciaSign.position.set(0, 3.04, 1.402);
            hub.add(fasciaSign);

            // Orbiting Multi-Expedition Carrier Badges Above Roof
            const orbitGroup = new THREE.Group();
            orbitGroup.position.set(0, 4.02, 0.02);
            const carriers = [
                { name: "REGULER", col: "#0052FF" },
                { name: "EKONOMI", col: "#1D4ED8" },
                { name: "COD", col: "#0284C7" },
                { name: "KARGO", col: "#0F172A" }
            ];
            carriers.forEach((c, i) => {
                const ang = (i / carriers.length) * Math.PI * 2;
                const spr = createCarrierTagSprite(c.name, c.col);
                spr.position.set(Math.cos(ang) * 1.85, 0, Math.sin(ang) * 1.05);
                orbitGroup.add(spr);
                rig.expeditionPods.push({ sprite: spr, baseAngle: ang });
            });
            hub.add(orbitGroup);
            rig.expeditionOrbitGroup = orbitGroup;

            // Motorized Clean Architectural Shutter
            const shutterGroup = new THREE.Group();
            shutterGroup.position.set(0, 1.42, 0.85);
            const shutterPanel = new THREE.Mesh(
                new THREE.BoxGeometry(3.26, 2.40, 0.08),
                new THREE.MeshStandardMaterial({ color: 0xF8FAFC, roughness: 0.3, metalness: 0.08 })
            );
            shutterPanel.castShadow = true;
            shutterGroup.add(shutterPanel);

            for (let s = -0.9; s <= 0.9; s += 0.3) {
                const groove = new THREE.Mesh(
                    new THREE.BoxGeometry(2.9, 0.025, 0.11),
                    new THREE.MeshBasicMaterial({ color: 0xCBD5E1 })
                );
                groove.position.y = s;
                shutterGroup.add(groove);
            }
            rig.shutterDoor = shutterGroup;
            hub.add(shutterGroup);

            // Floating Spinning -25% Medallion Sign Beside Roof
            const badgeGroup = new THREE.Group();
            badgeGroup.position.set(-2.55, 2.65, 0.65);
            const badgeCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.1, 36), brandBlueMat);
            badgeCyl.rotation.x = Math.PI / 2;
            badgeCyl.castShadow = true;
            badgeGroup.add(badgeCyl);

            const badgeTexMat = new THREE.MeshBasicMaterial({ map: createBadge25Texture(), transparent: true });
            const badgeFaceF = new THREE.Mesh(new THREE.CircleGeometry(0.5, 36), badgeTexMat);
            badgeFaceF.position.z = 0.058;
            badgeGroup.add(badgeFaceF);
            const badgeFaceB = new THREE.Mesh(new THREE.CircleGeometry(0.5, 36), badgeTexMat);
            badgeFaceB.rotation.y = Math.PI;
            badgeFaceB.position.z = -0.058;
            badgeGroup.add(badgeFaceB);

            rig.FloatingBadge25 = badgeGroup;
            hub.add(badgeGroup);

            // Sleek Magnetic Smart Conveyor Extending Forward
            const conveyorGroup = new THREE.Group();
            conveyorGroup.position.set(0.45, 0.45, 1.52);

            const counterBody = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.85, 0.95), whiteShellMat);
            counterBody.castShadow = true;
            counterBody.receiveShadow = true;
            conveyorGroup.add(counterBody);

            const blueFrontStripe = new THREE.Mesh(new THREE.BoxGeometry(3.83, 0.12, 0.98), brandBlueMat);
            blueFrontStripe.position.y = 0.24;
            conveyorGroup.add(blueFrontStripe);

            const beltSurface = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 0.68), slateTrimMat);
            beltSurface.position.y = 0.45;
            conveyorGroup.add(beltSurface);

            // Illuminated Moving Chevrons Along Conveyor Belt
            for (let c = 0; c < 6; c++) {
                const chev = new THREE.Mesh(
                    new THREE.BoxGeometry(0.16, 0.015, 0.34),
                    new THREE.MeshBasicMaterial({ color: 0x3B82F6, transparent: true, opacity: 0.65 })
                );
                chev.position.set(-1.5 + c * 0.6, 0.498, 0);
                conveyorGroup.add(chev);
                rig.beltChevrons.push({ mesh: chev, offset: c / 6 });
            }

            // Optical Blue Scanner Arch Over Conveyor
            const archFrame = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.98, 0.88), brandBlueMat);
            archFrame.position.set(0.35, 0.94, 0);
            archFrame.castShadow = true;
            conveyorGroup.add(archFrame);

            const beamGeo = new THREE.ConeGeometry(0.46, 0.84, 24, 1, true);
            const beamMat = new THREE.MeshBasicMaterial({
                color: 0x0052FF,
                transparent: true,
                opacity: 0.0,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            const beam = new THREE.Mesh(beamGeo, beamMat);
            beam.position.set(0.35, 0.88, 0);
            rig.scannerBeamMesh = beam;
            conveyorGroup.add(beam);

            // Conveyor Sliding Parcels with Squash & Stretch
            for (let i = 0; i < 3; i++) {
                const parcel = createKraftParcel(0.46, 0.36, 0.42);
                parcel.position.set(-1.4 + i * 1.25, 0.68, 0);
                conveyorGroup.add(parcel);
                rig.conveyorParcels.push({
                    mesh: parcel,
                    progress: i / 3,
                    dispatched: false
                });
            }

            hub.add(conveyorGroup);
            scene.add(hub);
        }

        function createKraftParcel(w, h, d) {
            const g = new THREE.Group();
            const boxMat = new THREE.MeshStandardMaterial({ color: 0xDDA36A, roughness: 0.52 });
            const tapeMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.3 });
            const labelMat = new THREE.MeshBasicMaterial({
                color: 0x0052FF,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1
            });

            const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat);
            box.castShadow = true;
            box.receiveShadow = true;
            g.add(box);

            const tape = new THREE.Mesh(new THREE.BoxGeometry(w * 0.24, h + 0.016, d + 0.016), tapeMat);
            g.add(tape);

            const shippingTag = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.40, h * 0.34), labelMat);
            shippingTag.position.set(w * 0.20, 0, d / 2 + 0.012);
            g.add(shippingTag);

            return g;
        }

        // ---------------------------------------------------------------------
        // 6. EXPRESSIVE 3D PARTNER CHARACTER RIG (LIVELIER MOTION & SCANNER)
        // ---------------------------------------------------------------------
        function buildPartnerCharacter() {
            const charRoot = new THREE.Group();
            charRoot.position.set(1.42, 0.20, -2.02);
            charRoot.rotation.y = 0.24;

            const skinMat = new THREE.MeshStandardMaterial({ color: 0xF6C29F, roughness: 0.36 });
            const blueVestMat = new THREE.MeshStandardMaterial({ color: 0x0052FF, roughness: 0.28 });
            const whiteShirtMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.3 });
            const darkNavyMat = new THREE.MeshStandardMaterial({ color: 0x0F172A, roughness: 0.4 });

            // Legs / Trousers
            const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.78, 20), darkNavyMat);
            leftLeg.position.set(-0.16, 0.39, 0);
            leftLeg.castShadow = true;
            charRoot.add(leftLeg);

            const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.78, 20), darkNavyMat);
            rightLeg.position.set(0.16, 0.39, 0);
            rightLeg.castShadow = true;
            charRoot.add(rightLeg);

            // Clean White Studio Sneakers
            const shoeGeo = new THREE.BoxGeometry(0.22, 0.12, 0.34);
            const leftShoe = new THREE.Mesh(shoeGeo, whiteShirtMat);
            leftShoe.position.set(-0.16, 0.06, 0.06);
            charRoot.add(leftShoe);
            const rightShoe = new THREE.Mesh(shoeGeo, whiteShirtMat);
            rightShoe.position.set(0.16, 0.06, 0.06);
            charRoot.add(rightShoe);

            // Upper Body Group (Breathing & Hop Pivot)
            const bodyPivot = new THREE.Group();
            bodyPivot.position.y = 0.76;
            charRoot.add(bodyPivot);

            // Tailored Brand Blue Partner Jacket/Vest
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.34, 0.78, 28), blueVestMat);
            torso.position.y = 0.39;
            torso.castShadow = true;
            bodyPivot.add(torso);

            // Crisp White Inner Shirt Placket
            const shirtFront = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.12), whiteShirtMat);
            shirtFront.position.set(0, 0.39, 0.28);
            bodyPivot.add(shirtFront);

            // KYC ID Badge on Chest
            const idBadge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.19, 0.03), whiteShirtMat);
            idBadge.position.set(0.18, 0.52, 0.33);
            bodyPivot.add(idBadge);

            // Sculpted Head Pivot
            const headPivot = new THREE.Group();
            headPivot.position.set(0, 0.96, 0);
            bodyPivot.add(headPivot);

            const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.33, 32, 32), skinMat);
            headSphere.position.y = 0.22;
            headSphere.castShadow = true;
            headPivot.add(headSphere);

            // Crisp Expressive Eyes + Friendly Smile Arc
            const eyesGroup = new THREE.Group();
            eyesGroup.position.set(0, 0.24, 0.305);
            const eyeGeo = new THREE.SphereGeometry(0.038, 16, 16);
            const leftEye = new THREE.Mesh(eyeGeo, darkNavyMat);
            leftEye.position.x = -0.11;
            const rightEye = new THREE.Mesh(eyeGeo, darkNavyMat);
            rightEye.position.x = 0.11;
            eyesGroup.add(leftEye, rightEye);
            headPivot.add(eyesGroup);

            const smileArc = new THREE.Mesh(
                new THREE.TorusGeometry(0.075, 0.016, 12, 24, Math.PI * 0.85),
                darkNavyMat
            );
            smileArc.position.set(0, 0.17, 0.31);
            smileArc.rotation.z = Math.PI * 1.075;
            headPivot.add(smileArc);

            // Modern Electric Blue Partner Cap
            const capCrown = new THREE.Mesh(
                new THREE.SphereGeometry(0.348, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52),
                blueVestMat
            );
            capCrown.position.y = 0.25;
            capCrown.castShadow = true;
            headPivot.add(capCrown);

            const capVisor = new THREE.Mesh(
                new THREE.CylinderGeometry(0.35, 0.35, 0.045, 24, 1, false, -Math.PI * 0.38, Math.PI * 0.76),
                darkNavyMat
            );
            capVisor.position.set(0, 0.34, 0.14);
            capVisor.rotation.x = 0.18;
            headPivot.add(capVisor);

            // Left Arm Holding Sleek Partner Tablet
            const leftArmPivot = new THREE.Group();
            leftArmPivot.position.set(-0.38, 0.68, 0);
            bodyPivot.add(leftArmPivot);

            const leftArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.56, 18), blueVestMat);
            leftArmMesh.position.set(0, -0.22, 0.16);
            leftArmMesh.rotation.x = -0.85;
            leftArmMesh.castShadow = true;
            leftArmPivot.add(leftArmMesh);

            const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), skinMat);
            leftHand.position.set(0, -0.39, 0.36);
            leftArmPivot.add(leftHand);

            // Partner OS Tablet
            const texRegister = createTabletTexture(false);
            const texVerified = createTabletTexture(true);
            const tabletGroup = new THREE.Group();
            tabletGroup.position.set(0.08, -0.34, 0.52);
            tabletGroup.rotation.set(-0.55, 0.2, 0);

            const tabletBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.03), darkNavyMat);
            tabletBody.castShadow = true;
            tabletGroup.add(tabletBody);

            const tabletScreen = new THREE.Mesh(
                new THREE.PlaneGeometry(0.38, 0.51),
                new THREE.MeshBasicMaterial({
                    map: texRegister,
                    polygonOffset: true,
                    polygonOffsetFactor: -1,
                    polygonOffsetUnits: -1
                })
            );
            tabletScreen.position.z = 0.02;
            tabletGroup.add(tabletScreen);
            leftArmPivot.add(tabletGroup);

            // Right Arm Holding Cordless Express Barcode Scanner
            const rightArmPivot = new THREE.Group();
            rightArmPivot.position.set(0.38, 0.68, 0);
            bodyPivot.add(rightArmPivot);

            const rightArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.56, 18), blueVestMat);
            rightArmMesh.position.set(0, -0.22, 0.16);
            rightArmMesh.rotation.x = -0.75;
            rightArmMesh.castShadow = true;
            rightArmPivot.add(rightArmMesh);

            const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), skinMat);
            rightHand.position.set(0, -0.39, 0.35);
            rightArmPivot.add(rightHand);

            // Sleek Handheld Scanner Gun
            const scannerGun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.22), whiteShirtMat);
            scannerGun.position.set(0, -0.40, 0.45);
            rightArmPivot.add(scannerGun);

            // Dual Optical KYC Biometric Rings Around Character (Act 2)
            const kycRing = new THREE.Mesh(
                new THREE.TorusGeometry(0.68, 0.024, 16, 48),
                new THREE.MeshBasicMaterial({ color: 0x0052FF, transparent: true, opacity: 0 })
            );
            kycRing.rotation.x = Math.PI / 2;
            kycRing.position.y = 1.2;
            charRoot.add(kycRing);
            rig.kycRing = kycRing;

            const kycRingTop = new THREE.Mesh(
                new THREE.TorusGeometry(0.54, 0.016, 16, 48),
                new THREE.MeshBasicMaterial({ color: 0x60A5FA, transparent: true, opacity: 0 })
            );
            kycRingTop.rotation.x = Math.PI / 2;
            kycRingTop.position.y = 1.5;
            charRoot.add(kycRingTop);
            rig.kycRingTop = kycRingTop;

            scene.add(charRoot);

            rig.character = {
                root: charRoot,
                baseY: 0.20,
                bodyPivot,
                headPivot,
                eyesGroup,
                leftArmPivot,
                rightArmPivot,
                tabletScreen,
                texRegister,
                texVerified
            };
        }

        // ---------------------------------------------------------------------
        // 7. FLYING 3D PARCELS & NATIONWIDE LOGISTICS ROUTES TO ALL PINS
        // ---------------------------------------------------------------------
        function createWingedExpressParcel() {
            const grp = new THREE.Group();
            const miniBox = createKraftParcel(0.28, 0.22, 0.26);
            grp.add(miniBox);

            const wingMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide });
            const wingGeo = new THREE.BoxGeometry(0.24, 0.02, 0.12);

            const leftWing = new THREE.Mesh(wingGeo, wingMat);
            leftWing.position.set(-0.22, 0.05, 0);
            grp.add(leftWing);

            const rightWing = new THREE.Mesh(wingGeo, wingMat);
            rightWing.position.set(0.22, 0.05, 0);
            grp.add(rightWing);

            const glow = new THREE.Mesh(
                new THREE.SphereGeometry(0.24, 14, 14),
                new THREE.MeshBasicMaterial({ color: 0x38BDF8, transparent: true, opacity: 0.26, depthWrite: false })
            );
            grp.add(glow);

            return { grp, leftWing, rightWing };
        }

        function buildLogisticsRoutes() {
            // Launch directly from the Gerai Express Optical Scanner Arch
            const hubLaunchOrigin = new THREE.Vector3(0.35, 1.58, -1.83);

            rig.mapPins.forEach((pin, idx) => {
                const mid = hubLaunchOrigin.clone().lerp(pin.targetPoint, 0.5);
                const dist = hubLaunchOrigin.distanceTo(pin.targetPoint);
                mid.y = 2.45 + dist * 0.22;

                const curve = new THREE.QuadraticBezierCurve3(hubLaunchOrigin, mid, pin.targetPoint);

                // Clean Glowing Trajectory Arc
                const tubeGeo = new THREE.TubeGeometry(curve, 52, 0.024, 8, false);
                const tubeMat = new THREE.MeshBasicMaterial({
                    color: 0x0052FF,
                    transparent: true,
                    opacity: 0.16
                });
                const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
                scene.add(tubeMesh);

                // Winged Express Parcel Flying Along Each Route
                const flyer = createWingedExpressParcel();
                scene.add(flyer.grp);

                rig.arcRoutes.push({
                    curve,
                    tubeMat,
                    flyer,
                    pinIndex: idx,
                    u: idx / rig.mapPins.length,
                    speed: 0.34 + (idx % 3) * 0.06
                });
            });
        }

        function buildAmbientParticles() {
            const count = 46;
            const geo = new THREE.BufferGeometry();
            const positions = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
                positions[i * 3] = (Math.random() - 0.5) * 17;
                positions[i * 3 + 1] = 0.4 + Math.random() * 4.2;
                positions[i * 3 + 2] = -3.8 + Math.random() * 10.0;
            }
            geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
            const mat = new THREE.PointsMaterial({
                color: 0x3B82F6,
                size: 0.09,
                transparent: true,
                opacity: 0.45
            });
            const pts = new THREE.Points(geo, mat);
            scene.add(pts);
            rig.ambientDots = pts;
        }

        function spawnPinShockwave(pos) {
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(0.18, 0.32, 32),
                new THREE.MeshBasicMaterial({
                    color: 0xFFFFFF,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.9,
                    depthWrite: false
                })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(pos.x, 0.34, pos.z);
            scene.add(ring);
            rig.shockwaves.push({ mesh: ring, life: 0, maxLife: 0.75 });
        }

        // Spawn Rising Blue/White Profit ("Cuan") Coins
        function spawnProfitToken(pos) {
            const grp = new THREE.Group();
            grp.position.copy(pos);

            const coinMat = new THREE.MeshStandardMaterial({
                color: 0x0052FF,
                roughness: 0.18,
                metalness: 0.25
            });
            const rimMat = new THREE.MeshStandardMaterial({
                color: 0xFFFFFF,
                roughness: 0.2
            });

            const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 24), coinMat);
            disc.rotation.z = Math.PI / 2;
            grp.add(disc);

            const core = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.072, 24), rimMat);
            core.rotation.z = Math.PI / 2;
            grp.add(core);

            scene.add(grp);
            rig.cuanTokens.push({
                mesh: grp,
                vy: 1.75 + Math.random() * 0.55,
                vx: (Math.random() - 0.5) * 0.65,
                vz: (Math.random() - 0.5) * 0.65,
                life: 0,
                maxLife: 1.35
            });
        }

        function triggerNationwideBurst() {
            spawnProfitToken(new THREE.Vector3(0.35, 1.75, -1.83));
            spawnProfitToken(new THREE.Vector3(1.35, 2.05, -1.95));
            rig.mapPins.forEach((pin, idx) => {
                pin.bounceVel = 2.6 + (idx % 3) * 0.35;
                spawnPinShockwave(pin.pinRoot.position);
            });
        }

        // ---------------------------------------------------------------------
        // 8. INTERACTION: SMOOTH CAMERA DRAG (MOUSE + TOUCH) & CLICK BURST
        // ---------------------------------------------------------------------
        function setupInteractions() {
            const wrapper = document.getElementById("stageWrapper");

            const onPointerDown = (x, y) => {
                isDragging = true;
                dragStartX = x;
                dragStartY = y;
                pointerDownX = x;
                pointerDownY = y;
            };

            const onPointerMove = (x, y) => {
                if (!isDragging) return;
                const dx = x - dragStartX;
                const dy = y - dragStartY;
                dragStartX = x;
                dragStartY = y;

                userAzimuthOffset = THREE.MathUtils.clamp(userAzimuthOffset - dx * 0.0055, -1.15, 1.15);
                userPolarOffset = THREE.MathUtils.clamp(userPolarOffset - dy * 0.004, -0.38, 0.28);
            };

            const onPointerUp = (x, y) => {
                if (!isDragging) return;
                isDragging = false;
                const moved = Math.hypot(x - pointerDownX, y - pointerDownY);
                if (moved < 6) {
                    triggerNationwideBurst();
                }
            };

            wrapper.addEventListener("mousedown", (e) => {
                if (e.target.closest("#hudControls, #heroOverlayCard, #spatialCallout, a, button")) return;
                onPointerDown(e.clientX, e.clientY);
            });
            window.addEventListener("mousemove", (e) => onPointerMove(e.clientX, e.clientY));
            window.addEventListener("mouseup", (e) => onPointerUp(e.clientX, e.clientY));

            wrapper.addEventListener("touchstart", (e) => {
                if (e.target.closest("#hudControls, #heroOverlayCard, #spatialCallout, a, button") || !e.touches[0]) return;
                onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
            }, { passive: true });
            window.addEventListener("touchmove", (e) => {
                if (!e.touches[0]) return;
                onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
            }, { passive: true });
            window.addEventListener("touchend", (e) => {
                const t = e.changedTouches[0];
                onPointerUp(t ? t.clientX : dragStartX, t ? t.clientY : dragStartY);
            }, { passive: true });

            window.addEventListener("resize", handleResize);
        }

        function handleResize() {
            if (!camera || !renderer) return;
            const m = stageMetrics();
            const aspect = m.w / m.h;
            camera.aspect = aspect;
            // Smooth responsive FOV from ultrawide (33deg) -> desktop (36deg) -> tablet (43deg) -> phone (50deg)
            camera.fov = aspect > 2.0 ? 33 : aspect > 1.35 ? 36 : aspect > 0.95 ? 41 : aspect > 0.65 ? 46 : 50;
            camera.setViewOffset(m.w, m.h, m.viewOffsetX, m.viewOffsetY, m.w, m.h);
            camera.updateProjectionMatrix();
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            renderer.setSize(m.w, m.h, false);
            // setSize clears the drawing buffer: while paused, let the camera settle to the new framing (the scene clock
            // stays frozen) and repaint now — but only on-screen; an off-screen stage repaints when it becomes visible.
            if (!isPlaying && scene) {
                settle(800, 40);
                if (stageVisible) renderFrame();
            }
        }

        // ---------------------------------------------------------------------
        // 9. UI SYNCHRONIZATION (CLEAN STUDIO HUD CALLOUT)
        // ---------------------------------------------------------------------
        function applyActUI(idx) {
            currentAct = idx;
            const act = ACTS[idx];

            const callout = document.getElementById("spatialCallout");
            if (callout) {
                callout.style.transform = "translate3d(0, -4px, 0) scale(0.98)";
                setTimeout(() => {
                    callout.style.transform = "translate3d(0, 0, 0) scale(1)";
                }, 60);
            }

            document.getElementById("calloutBadge").textContent = act.badge;
            document.getElementById("calloutMetric").textContent = act.metric;
            document.getElementById("calloutTitle").textContent = act.title;
            document.getElementById("calloutDesc").textContent = act.desc;

            document.querySelectorAll(".step-tab").forEach((btn, i) => {
                btn.classList.toggle("active", i === idx);
            });

            if (rig.character.tabletScreen) {
                rig.character.tabletScreen.material.map = (idx >= 1)
                    ? rig.character.texVerified
                    : rig.character.texRegister;
                rig.character.tabletScreen.material.needsUpdate = true;
            }
        }

        function selectAct(idx, ev) {
            if (ev) ev.stopPropagation();
            timeline = ACTS[idx].start + 0.05;
            settle(1500, 60);
            userAzimuthOffset *= 0.25;
            userPolarOffset *= 0.25;
            applyActUI(idx);
        }

        // Mirrors the play state into the DOM (button label + `data-playing`) for assistive tech and browser tests.
        function syncPlayState() {
            const btn = document.getElementById("togglePlayBtn");
            if (btn) {
                btn.setAttribute("aria-pressed", isPlaying ? "false" : "true");
                btn.setAttribute("aria-label", isPlaying ? "Jeda animasi 3D" : "Putar animasi 3D");
            }
            const wrap = document.getElementById("stageWrapper");
            if (wrap) {
                wrap.setAttribute("data-playing", isPlaying ? "1" : "0");
                wrap.setAttribute("data-clock", sceneClock.toFixed(3));
            }
        }

        function togglePlayback(ev) {
            if (ev) ev.stopPropagation();
            isPlaying = !isPlaying;
            settle(0, 1);
            document.getElementById("iconPause").classList.toggle("hidden", !isPlaying);
            document.getElementById("iconPlay").classList.toggle("hidden", isPlaying);
            syncPlayState();
        }

        // ---------------------------------------------------------------------
        // 10. MAIN 60FPS CHOREOGRAPHY LOOP
        // ---------------------------------------------------------------------
        function animate() {
            requestAnimationFrame(animate);
            if (!stageVisible || !renderer) return;

            const now = performance.now();
            const realDt = Math.min((now - lastTick) / 1000, 0.05);
            lastTick = now;
            // Paused: render a short settle (camera eases to the selected act) and then stop drawing entirely.
            if (!isPlaying && !isDragging) {
                if (now > settleUntil && settleFrames <= 0) return;
                settleFrames -= 1;
            }
            const dt = isPlaying ? realDt : 0;
            const easeDt = isPlaying || isDragging ? realDt : 0.05;
            sceneClock += dt;

            if (isPlaying) {
                timeline = (timeline + dt) % LOOP_SECONDS;
            }

            const progressEl = document.getElementById("progressFill");
            if (progressEl) {
                progressEl.style.width = `${((timeline / LOOP_SECONDS) * 100).toFixed(1)}%`;
            }

            // Determine Current Act
            let actIdx = 0;
            for (let i = 0; i < ACTS.length; i++) {
                if (timeline >= ACTS[i].start && timeline < ACTS[i].end) {
                    actIdx = i;
                    break;
                }
            }
            if (actIdx !== currentAct) {
                applyActUI(actIdx);
            }

            const act = ACTS[actIdx];
            const t = sceneClock;

            if (!isDragging) {
                userAzimuthOffset = THREE.MathUtils.lerp(userAzimuthOffset, 0, easeDt * 0.65);
                userPolarOffset = THREE.MathUtils.lerp(userPolarOffset, 0, easeDt * 0.65);
            }

            // Smooth Choreographed Camera Interpolation
            const mNow = stageMetrics();
            const asp = mNow.w / mNow.h;
            const baseScale = asp < 0.52 ? 1.44 : asp < 0.72 ? 1.30 : asp < 1.05 ? 1.18 : asp > 2.2 ? 1.06 : 1.15;
            const mapBoost = (actIdx >= 2 && asp < 0.75) ? 1.08 : 1.0;
            const aspectScale = baseScale * mapBoost;
            const targetAz = act.camAzimuth + Math.sin(t * 0.42) * 0.06 + userAzimuthOffset;
            const targetPol = THREE.MathUtils.clamp(act.camPolar + userPolarOffset, 0.42, 1.38);
            const targetDist = act.camDist * aspectScale;

            smoothAzimuth = THREE.MathUtils.lerp(smoothAzimuth, targetAz, easeDt * 2.6);
            smoothPolar = THREE.MathUtils.lerp(smoothPolar, targetPol, easeDt * 2.6);
            smoothDist = THREE.MathUtils.lerp(smoothDist, targetDist, easeDt * 2.4);
            smoothLookAt.lerp(new THREE.Vector3(...act.lookAt), easeDt * 2.8);

            camera.position.x = smoothLookAt.x + smoothDist * Math.sin(smoothPolar) * Math.sin(smoothAzimuth);
            camera.position.y = smoothLookAt.y + smoothDist * Math.cos(smoothPolar);
            camera.position.z = smoothLookAt.z + smoothDist * Math.sin(smoothPolar) * Math.cos(smoothAzimuth);
            camera.lookAt(smoothLookAt);

            // A. Mechanical Gerai Shutter, Orbiting Expedition Badges & -25% Medallion
            if (rig.shutterDoor) {
                const openTargetScale = (actIdx >= 2) ? 0.05 : 1.0;
                const openTargetY = (actIdx >= 2) ? 2.55 : 1.42;
                rig.shutterDoor.scale.y = THREE.MathUtils.lerp(rig.shutterDoor.scale.y, openTargetScale, easeDt * 5.0);
                rig.shutterDoor.position.y = THREE.MathUtils.lerp(rig.shutterDoor.position.y, openTargetY, easeDt * 5.0);
            }

            if (rig.FloatingBadge25) {
                rig.FloatingBadge25.rotation.y = Math.sin(t * 1.8) * 0.55;
                rig.FloatingBadge25.position.y = 2.65 + Math.sin(t * 2.8) * 0.11;
            }

            if (rig.expeditionOrbitGroup) {
                const targetScale = (actIdx >= 2) ? 1.0 : 0.01;
                const s = THREE.MathUtils.lerp(rig.expeditionOrbitGroup.scale.x, targetScale, easeDt * 4.5);
                rig.expeditionOrbitGroup.scale.setScalar(s);
                rig.expeditionOrbitGroup.visible = s > 0.03;

                rig.expeditionPods.forEach((pod, i) => {
                    const ang = pod.baseAngle + t * 0.65;
                    pod.sprite.position.set(
                        Math.cos(ang) * 1.95,
                        Math.sin(t * 2.6 + i * 1.4) * 0.12,
                        Math.sin(ang) * 1.05
                    );
                });
            }

            // B. Lively Partner Character Articulation & KYC Scan Rings
            const ch = rig.character;
            if (ch.bodyPivot) {
                const joyHop = (actIdx === 1 || actIdx === 3) ? Math.abs(Math.sin(t * 4.4)) * 0.065 : 0;
                ch.root.position.y = ch.baseY + joyHop;
                ch.bodyPivot.position.y = 0.76 + Math.sin(t * 3.4) * 0.026;
                ch.bodyPivot.rotation.z = Math.sin(t * 2.2) * 0.035;

                const blink = (t % 3.4 > 3.26) ? 0.1 : 1.0;
                ch.eyesGroup.scale.y = blink;

                if (actIdx === 0) {
                    ch.headPivot.rotation.set(0.22, -0.18 + Math.sin(t * 2.4) * 0.06, 0);
                    ch.leftArmPivot.rotation.x = -0.18 + Math.sin(t * 2.6) * 0.05;
                    ch.rightArmPivot.rotation.set(-0.48 + Math.sin(t * 8.5) * 0.14, -0.35, 0);
                } else if (actIdx === 1) {
                    ch.headPivot.rotation.set(0.02, Math.sin(t * 2.2) * 0.12, 0);
                    ch.leftArmPivot.rotation.x = -0.28;
                    ch.rightArmPivot.rotation.set(-0.85 + Math.sin(t * 5.0) * 0.15, 0.15, -0.2);
                } else {
                    ch.headPivot.rotation.set(0.06, -0.25 + Math.sin(t * 2.8) * 0.18, 0);
                    ch.leftArmPivot.rotation.x = -0.05 + Math.sin(t * 3.2) * 0.06;
                    ch.rightArmPivot.rotation.set(-0.42 + Math.sin(t * 6.4) * 0.20, 0.25, 0);
                }
            }

            if (rig.kycRing && rig.kycRingTop) {
                const targetOpacity = (actIdx === 1) ? 0.85 : 0.0;
                rig.kycRing.material.opacity = THREE.MathUtils.lerp(rig.kycRing.material.opacity, targetOpacity, easeDt * 6);
                rig.kycRing.position.y = 1.15 + Math.sin(t * 4.8) * 0.72;

                rig.kycRingTop.material.opacity = THREE.MathUtils.lerp(rig.kycRingTop.material.opacity, targetOpacity * 0.7, easeDt * 6);
                rig.kycRingTop.position.y = 1.15 - Math.sin(t * 4.8) * 0.65;
            }

            // C. Conveyor Chevrons, Squash-Stretch Parcels & Optical Scanner Beam
            const beltActive = actIdx >= 2;
            rig.beltChevrons.forEach((c) => {
                const p = (c.offset + t * (beltActive ? 0.55 : 0.12)) % 1;
                c.mesh.position.x = -1.65 + p * 3.3;
                c.mesh.material.opacity = beltActive ? 0.8 : 0.22;
            });

            if (rig.scannerBeamMesh) {
                const pulseBeam = beltActive ? (0.18 + Math.max(0, Math.sin(t * 8.0)) * 0.26) : 0.0;
                rig.scannerBeamMesh.material.opacity = THREE.MathUtils.lerp(rig.scannerBeamMesh.material.opacity, pulseBeam, easeDt * 8);
            }

            rig.conveyorParcels.forEach((p) => {
                p.mesh.visible = beltActive;
                if (!beltActive) return;

                p.progress += dt * (actIdx === 3 ? 0.42 : 0.26);
                if (p.progress >= 1) {
                    p.progress -= 1;
                    p.dispatched = false;
                }

                const localX = -1.55 + p.progress * 3.1;
                p.mesh.position.x = localX;

                const distToScan = Math.abs(localX - 0.35);
                const squash = distToScan < 0.28 ? (1 - distToScan / 0.28) * 0.22 : 0;
                p.mesh.scale.set(1 + squash, 1 - squash * 0.8, 1 + squash);
                p.mesh.position.y = 0.68 + (p.progress > 0.82 ? Math.pow((p.progress - 0.82) / 0.18, 2) * 0.45 : 0);

                if (actIdx >= 2 && !p.dispatched && localX > 0.34) {
                    p.dispatched = true;
                    spawnProfitToken(new THREE.Vector3(0.35, 1.72, -1.83));
                }
            });

            // D. Indonesia Radar, Bouncing 3D Map Pins & Flying Express Parcels
            if (rig.radarSweep) {
                rig.radarSweep.rotation.y = -t * 0.75;
            }

            rig.mapPins.forEach((pin) => {
                pin.bounceY += pin.bounceVel * dt;
                pin.bounceVel -= 14.0 * dt;
                if (pin.bounceY <= 0) {
                    pin.bounceY = 0;
                    pin.bounceVel = 0;
                }

                const idleFloat = Math.sin(t * 3.0 + pin.phase) * 0.035;
                pin.body.position.y = idleFloat + pin.bounceY;

                const stretch = 1 + Math.min(0.25, pin.bounceY * 0.5);
                pin.body.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));

                const ringScale = 1 + Math.sin(t * 4.2 + pin.phase) * 0.22;
                pin.baseRing.scale.set(ringScale, ringScale, 1);
            });

            rig.arcRoutes.forEach((route) => {
                const activeFlight = actIdx >= 2;
                const targetTubeAlpha = (actIdx === 3) ? 0.48 : (actIdx === 2 ? 0.28 : 0.09);
                route.tubeMat.opacity = THREE.MathUtils.lerp(route.tubeMat.opacity, targetTubeAlpha, easeDt * 3.5);

                route.flyer.grp.visible = activeFlight;
                if (activeFlight) {
                    const prevU = route.u;
                    route.u = (route.u + dt * (actIdx === 3 ? route.speed * 1.3 : route.speed * 0.85)) % 1;

                    if (route.u < prevU) {
                        const targetPin = rig.mapPins[route.pinIndex];
                        if (targetPin) {
                            targetPin.bounceVel = 2.35;
                            spawnPinShockwave(targetPin.pinRoot.position);
                        }
                    }

                    const pos = route.curve.getPointAt(route.u);
                    const lookPos = route.curve.getPointAt(Math.min(1, route.u + 0.03));
                    route.flyer.grp.position.copy(pos);
                    route.flyer.grp.lookAt(lookPos);

                    const flap = Math.sin(t * 24 + route.pinIndex) * 0.42;
                    route.flyer.leftWing.rotation.z = flap;
                    route.flyer.rightWing.rotation.z = -flap;
                }
            });

            // E. Animate Map Shockwaves, Ambient Particles & Profit ("Cuan") Coins
            for (let i = rig.shockwaves.length - 1; i >= 0; i--) {
                const sw = rig.shockwaves[i];
                sw.life += dt;
                if (sw.life >= sw.maxLife) {
                    scene.remove(sw.mesh);
                    rig.shockwaves.splice(i, 1);
                    continue;
                }
                const prog = sw.life / sw.maxLife;
                const sc = 1 + prog * 2.8;
                sw.mesh.scale.set(sc, sc, 1);
                sw.mesh.material.opacity = (1 - prog) * 0.82;
            }

            if (rig.ambientDots) {
                rig.ambientDots.rotation.y = Math.sin(t * 0.2) * 0.08;
                rig.ambientDots.position.y = Math.sin(t * 1.2) * 0.12;
            }

            for (let i = rig.cuanTokens.length - 1; i >= 0; i--) {
                const tk = rig.cuanTokens[i];
                tk.life += dt;
                if (tk.life >= tk.maxLife) {
                    scene.remove(tk.mesh);
                    rig.cuanTokens.splice(i, 1);
                    continue;
                }
                tk.mesh.position.y += tk.vy * dt;
                tk.mesh.position.x += tk.vx * dt;
                tk.mesh.position.z += tk.vz * dt;
                tk.vy *= 0.96;
                tk.mesh.rotation.y += dt * 6.2;

                const fade = 1 - Math.pow(tk.life / tk.maxLife, 2);
                tk.mesh.scale.setScalar(Math.max(0.01, fade));
            }

            renderFrame();
        }

        // Draws one frame and mirrors the clock / frame count into the DOM (browser tests read them).
        function renderFrame() {
            renderer.render(scene, camera);
            renderCount += 1;
            const wrapEl = document.getElementById("stageWrapper");
            if (wrapEl) {
                wrapEl.setAttribute("data-clock", sceneClock.toFixed(3));
                wrapEl.setAttribute("data-frames", String(renderCount));
            }
        }

        function bootStudio() {
            const wrapper = document.getElementById("stageWrapper");
            if (!wrapper || typeof THREE === "undefined") return;

            const playBtn = document.getElementById("togglePlayBtn");
            if (playBtn) playBtn.addEventListener("click", togglePlayback);

            wrapper.querySelectorAll(".step-tab[data-act]").forEach((btn) => {
                btn.addEventListener("click", (ev) => {
                    const idx = Number(btn.getAttribute("data-act") || "0");
                    selectAct(idx, ev);
                });
            });

            if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                isPlaying = false;
                timeline = ACTS[2].start + 0.2;
                const ip = document.getElementById("iconPause");
                const ipl = document.getElementById("iconPlay");
                if (ip) ip.classList.add("hidden");
                if (ipl) ipl.classList.remove("hidden");
                settle(1500, 60);
            }
            syncPlayState();

            const ok = initScene();
            applyActUI(isPlaying ? 0 : 2);
            if (!ok) {
                wrapper.setAttribute("data-webgl", "fallback");
                return;
            }

            if (typeof ResizeObserver !== "undefined") {
                const ro = new ResizeObserver(() => handleResize());
                ro.observe(wrapper);
                const heroHud = document.getElementById("heroOverlayCard");
                if (heroHud) ro.observe(heroHud);
            }
            if (window.visualViewport) {
                window.visualViewport.addEventListener("resize", handleResize);
            }
            if (typeof IntersectionObserver !== "undefined") {
                const io = new IntersectionObserver((entries) => {
                    if (!entries[0]) return;
                    stageVisible = entries[0].isIntersecting;
                    if (stageVisible) {
                        lastTick = performance.now();
                        // A resize while off-screen cleared the buffer: redraw (and finish settling) on return.
                        if (!isPlaying) settle(800, 40);
                    }
                }, { threshold: 0.05 });
                io.observe(wrapper);
            }

            lastTick = performance.now();
            animate();
        }

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", bootStudio);
        } else {
            bootStudio();
        }
    
})();
