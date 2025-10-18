// ========== VARIABLES GLOBALES ==========

// General
let renderer, scene, camera, miniCamera, playerMarker, p_pos;
let angulo = 0;
const mapSize = 100;
const sensitivity = 0.002;
let clock = new THREE.Clock();

// Movimientos del jugador y colisiones
let pitch = 0;
const pitchMin = -Math.PI / 3;
const pitchMax = Math.PI / 3;
const moveSpeed = 5;
const keys = { W: false, A: false, S: false, D: false };
const walls = [];
const raycaster = new THREE.Raycaster();

// Estadísticas
let gameTime = 0;
let zombiesKilled = 0;
const stats = new Stats();
stats.showPanel(0);
stats.dom.style.position = 'absolute';
stats.dom.style.top = '10px';
stats.dom.style.left = '';
stats.dom.style.right = '10px';

// Enemigos y la propia vida del jugador
const enemies = [];
const enemyMixers = [];
const enemyMarkers = [];
let playerHealth = 100;
const enemyAssets = {
    modelLoaded: false,
    baseModel: null,
    animations: {},
    loadPromise: null
};
let spawnTimer = 0;
let spawnInterval = 5;
let zombiesPerSpawn = 1;
let maxZombies = 50;
const difficultyIncreaseInterval = 60;
let lastDifficultyIncrease = 0;

// Coche
let vehicle = null;
let isInVehicle = false;
let vehicleHealth = 200;
const vehicleMaxHealth = 200;
let vehicleRespawnTimer = 0;
const vehicleSpeed = 7.5;
const vehicleRotationSpeed = 1.5;
const vehicleInteractionDistance = 5;
let vehicleCamera = null;
const cameraDistance = 15;
const cameraHeight = 8;


// Cuando el jugador muere
let isGameOver = false;
let animationFrameId = null;

// ========== FUNCIONES DE ESTADÍSTICAS ==========

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateStatsUI() {
    const zombiesEl = document.getElementById('zombiesKilled');
    const timeEl = document.getElementById('gameTime');

    zombiesEl.textContent = zombiesKilled;

    timeEl.textContent = `${formatTime(gameTime)}`;
}

// ========== GESTIÓN DEL VEHÍCULO ==========

class Vehicle {
    constructor(x, z) {
        this.mesh = null;
        this.position = new THREE.Vector3(x, 0, z);
        this.rotation = 0;
        this.health = vehicleMaxHealth;
        this.loadModel();
    }

    loadModel() {
        const loader = new THREE.FBXLoader();
        loader.load(
            'models/car/Gaz.fbx',
            (object) => {
                this.mesh = object;
                this.mesh.scale.set(0.02, 0.02, 0.02);
                this.mesh.position.copy(this.position);
                scene.add(this.mesh);

                this.mesh.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
            }
        );
    }

    update() {
        if (!this.mesh) return;

        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.rotation;

    }

    takeDamage(damage) {
        this.health -= damage;
        this.health = Math.max(0, this.health);
        updateVehicleHealthUI();

        if (this.health <= 0) {
            this.explode();
        }
    }

    explode() {
        exitVehicle();
        scene.remove(this.mesh);
        isInVehicle = false;
        vehicle = null;
        scheduleVehicleRespawn();
    }
}

function spawnVehicle() {
    const minDistFromCenter = 20;

    let x, z, validPosition = false;
    let attempts = 0;

    while (!validPosition && attempts < 50) {
        x = THREE.MathUtils.randFloat(-mapSize, mapSize);
        z = THREE.MathUtils.randFloat(-mapSize, mapSize);

        const distFromCenter = Math.sqrt(x * x + z * z);
        if (distFromCenter < minDistFromCenter) {
            attempts++;
            continue;
        }

        const testPos = new THREE.Vector3(x, 5, z);
        raycaster.set(testPos, new THREE.Vector3(0, -1, 0));
        const hits = raycaster.intersectObjects(walls);

        if (hits.length === 0 || (hits.length === 1 && hits[0].distance > 4)) {
            validPosition = true;
        }

        attempts++;
    }

    if (!validPosition) {
        x = THREE.MathUtils.randFloat(-50, 50);
        z = THREE.MathUtils.randFloat(-50, 50);
    }

    vehicle = new Vehicle(x, z);
    vehicleHealth = vehicleMaxHealth;
    updateVehicleHealthUI();
}

function scheduleVehicleRespawn() {
    const respawnTime = THREE.MathUtils.randInt(30, 60);
    vehicleRespawnTimer = respawnTime;

    updateRespawnTimerUI();

    const timerInterval = setInterval(() => {
        vehicleRespawnTimer--;
        updateRespawnTimerUI();

        if (vehicleRespawnTimer <= 0) {
            clearInterval(timerInterval);
            spawnVehicle();
            updateVehicleHealthUI();
        }
    }, 1000);
}

function checkVehicleInteraction() {
    if (!vehicle || !vehicle.mesh || isInVehicle) return false;

    const distance = p_pos.distanceTo(vehicle.position);
    return distance <= vehicleInteractionDistance;
}

function enterVehicle() {
    isInVehicle = true;
    crosshair = document.getElementById('crosshair')
    crosshair.style.visibility = 'hidden';

    if (!vehicleCamera) {
        vehicleCamera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        vehicleCamera.layers.enable(0);
    }

    camera.children.forEach(child => {
        if (child.type === 'Group') child.visible = false;
    });
}

function exitVehicle() {
    isInVehicle = false;

    crosshair = document.getElementById('crosshair');
    crosshair.style.visibility = 'visible';

    p_pos.copy(vehicle.position);
    p_pos.y = 2.6;
    camera.position.copy(p_pos);

    camera.rotation.order = 'YXZ';
    camera.rotation.x = pitch;
    camera.rotation.y = angulo;

    camera.children.forEach(child => {
        if (child.type === 'Group') child.visible = true;
    });
}

function updateVehicleHealthUI() {
    const container = document.getElementById('vehicleHealthContainer');
    const fill = document.getElementById('vehicleHealthFill');
    const text = document.getElementById('vehicleHealthText');

    if (vehicle && vehicle.health > 0) {
        container.style.display = 'block';

        const healthPercent = (vehicle.health / vehicleMaxHealth) * 100;
        fill.style.width = healthPercent + '%';

        if (healthPercent > 60) {
            fill.style.background = 'linear-gradient(to right, #00ff00, #88ff88)';
        } else if (healthPercent > 30) {
            fill.style.background = 'linear-gradient(to right, #ffaa00, #ffcc44)';
        } else {
            fill.style.background = 'linear-gradient(to right, #ff0000, #ff4444)';
        }

        text.textContent = `${Math.ceil(vehicle.health)} / ${vehicleMaxHealth} HP 🚗`;

    } else {
        container.style.display = 'none';
    }
}

function updateRespawnTimerUI() {
    const respawnUI = document.getElementById('vehicleRespawnUI');
    const healthContainer = document.getElementById('vehicleHealthContainer');

    if (vehicleRespawnTimer > 0 && !vehicle) {
        healthContainer.style.display = 'none';
        respawnUI.style.display = 'block';
        respawnUI.innerHTML = `
            <div style="font-size: 16px; font-weight: bold; margin-bottom: 5px;">
                🚗 VEHÍCULO DESTRUIDO
            </div>
            <div style="font-size: 24px; color: #ff6666;">
                ${vehicleRespawnTimer}s
            </div>
            <div style="font-size: 12px; margin-top: 5px;">
                hasta el respawn
            </div>
        `;
    } else {
        respawnUI.style.display = 'none';
    }
}

// ========== GESTION DE LOS ENEMIGOS ==========

class Enemy {
    constructor(x, z) {
        this.mesh = null;
        this.mixer = null;
        this.actions = {};
        this.currentAction = null;
        this.position = new THREE.Vector3(x, 0, z);
        this.speed = 2.5;
        this.attackRange = 4;
        this.state = 'idle';
        this.attackCooldown = 0;
        this.attackInterval = 2;
        this.health = 60;
        this.marker = null;
        this.isDying = false;

        this.createInstance();
    }

    createInstance() {
        if (!enemyAssets.baseModel) {
            console.error('Modelo base no cargado aún');
            return;
        }

        this.mesh = THREE.SkeletonUtils.clone(enemyAssets.baseModel);
        this.mesh.scale.set(0.02, 0.02, 0.02);
        this.mesh.position.copy(this.position);
        scene.add(this.mesh);

        this.mixer = new THREE.AnimationMixer(this.mesh);
        enemyMixers.push(this.mixer);

        for (const [name, clip] of Object.entries(enemyAssets.animations)) {
            const action = this.mixer.clipAction(clip);
            this.actions[name] = action;
        }

        this.playAnimation('idle');

        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        this.marker = new THREE.Mesh(
            new THREE.ConeGeometry(3, 4, 3),
            new THREE.MeshBasicMaterial({ color: 0x00ff00 })
        );
        this.marker.rotation.x = -Math.PI / 2;
        this.marker.layers.set(1);
        scene.add(this.marker);
        enemyMarkers.push(this.marker);
    }

    playAnimation(name) {
        if (!this.actions[name]) return;

        if (this.currentAction) {
            this.currentAction.fadeOut(0.3);
        }
        this.currentAction = this.actions[name];
        this.currentAction.reset().fadeIn(0.3).play();
    }

    update(delta) {

        if (!this.mesh) return;

        if (this.mixer) {
            this.mixer.update(delta);
        }

        if (this.isDying) return;

        if (this.attackCooldown > 0) {
            this.attackCooldown -= delta;
        }

        if (this.marker) {
            this.marker.position.set(this.position.x, 10, this.position.z);
        }

        const distanceToPlayer = this.position.distanceTo(p_pos);

        if (distanceToPlayer <= this.attackRange) {
            if (this.state !== 'attacking') {
                this.state = 'attacking';
                this.playAnimation('attacking');
            }

            var lookTarget = p_pos.clone();
            lookTarget.y = this.position.y;
            this.mesh.lookAt(lookTarget);

            if (this.attackCooldown <= 0) {
                this.attack();
                this.attackCooldown = this.attackInterval;
            }
        } else {
            if (this.state !== 'walking') {
                this.state = 'walking';
                this.playAnimation('walking');
            }
            this.moveTowardsPlayer(delta);
        }
    }

    moveTowardsPlayer(delta) {
        const direction = new THREE.Vector3();
        direction.subVectors(p_pos, this.position).normalize();
        direction.y = 0;

        const movement = direction.multiplyScalar(this.speed * delta);
        const newPos = this.position.clone().add(movement);

        raycaster.set(this.position, direction);
        const hits = raycaster.intersectObjects(walls);


        if (hits.length > 0 && hits[0].distance < 4) {
            const side = Math.random() < 0.5 ? 1 : -1;
            const perpendicular = new THREE.Vector3(-direction.z * side, 0, direction.x * side);
            const altMovement = perpendicular.multiplyScalar(this.speed * delta);
            newPos.copy(this.position).add(altMovement);
        }

        this.position.copy(newPos);
        this.mesh.position.copy(this.position);

        var lookTarget = p_pos.clone();
        lookTarget.y = this.position.y;
        this.mesh.lookAt(lookTarget);
    }

    attack() {
        if (isInVehicle && vehicle) {
            vehicle.takeDamage(15);
        } else {
            playerHealth -= 10;
            updatePlayerHealthUI();
            showDamageEffect();
        }
    }

    takeDamage(damage) {
        this.health -= damage;

        if (this.health <= 0) {
            this.die();
        }
    }

    die() {
        if (this.isDying) return;
        this.isDying = true;
        this.state = 'dying';
        this.speed = 0;

        this.playAnimation('die');
        this.actions['die'].setLoop(THREE.LoopOnce, 1);
        this.actions['die'].clampWhenFinished = true;

        setTimeout(() => {
            if (this.mesh) {
                scene.remove(this.mesh);
            }
            if (this.marker) {
                scene.remove(this.marker);
                const markerIndex = enemyMarkers.indexOf(this.marker);
                if (markerIndex > -1) {
                    enemyMarkers.splice(markerIndex, 1);
                }
            }
            const index = enemies.indexOf(this);
            if (index > -1) {
                enemies.splice(index, 1);
            }
            const mixerIndex = enemyMixers.indexOf(this.mixer);
            if (mixerIndex > -1) {
                enemyMixers.splice(mixerIndex, 1);
            }

            zombiesKilled++;
        }, 2000);
    }
}

function loadEnemyAssets() {
    if (enemyAssets.loadPromise) {
        return enemyAssets.loadPromise;
    }

    enemyAssets.loadPromise = new Promise((resolve, reject) => {
        const loader = new THREE.FBXLoader();
        let loadedCount = 0;
        const totalAssets = 5;

        loader.load(
            'models/zombie/Zombie.fbx',
            (object) => {
                enemyAssets.baseModel = object;
                loadedCount++;
                if (loadedCount === totalAssets) resolve();
            },
            undefined,
            reject
        );

        const animFiles = [
            { name: 'idle', file: 'models/zombie/animations/Zombie_Idle.fbx' },
            { name: 'walking', file: 'models/zombie/animations/Zombie_Walk.fbx' },
            { name: 'attacking', file: 'models/zombie/animations/Zombie_Attack.fbx' },
            { name: 'die', file: 'models/zombie/animations/Zombie_Death.fbx' }
        ];

        animFiles.forEach((anim) => {
            loader.load(
                anim.file,
                (animData) => {
                    if (animData.animations && animData.animations[0]) {
                        enemyAssets.animations[anim.name] = animData.animations[0];
                        loadedCount++;
                        if (loadedCount === totalAssets) resolve();
                    }
                },
                undefined,
                reject
            );
        });
    });

    return enemyAssets.loadPromise;
}

async function spawnEnemy(x, z) {
    await loadEnemyAssets();
    const enemy = new Enemy(x, z);
    enemies.push(enemy);
}

function updateProgressiveSpawn(delta) {
    if (enemies.length >= maxZombies) return;

    spawnTimer += delta;

    if (gameTime - lastDifficultyIncrease >= difficultyIncreaseInterval) {
        lastDifficultyIncrease = gameTime;
        spawnInterval = Math.max(3, spawnInterval - 0.5);
        if (gameTime % 120 === 0 && zombiesPerSpawn < 3) {
            zombiesPerSpawn++;
        }
        maxZombies = Math.min(100, maxZombies + 5);
    }

    if (spawnTimer >= spawnInterval) {
        spawnTimer = 0;

        for (let i = 0; i < zombiesPerSpawn; i++) {
            spawnZombieAtRandomPosition();
        }
    }
}

function spawnZombieAtRandomPosition() {
    const minDistance = 25;
    const maxDistance = 80;

    let x, z, attempts = 0;
    let validPosition = false;

    while (!validPosition && attempts < 50) {
        const angle = Math.random() * Math.PI * 2;
        const distance = THREE.MathUtils.randFloat(minDistance, maxDistance);

        x = p_pos.x + Math.cos(angle) * distance;
        z = p_pos.z + Math.sin(angle) * distance;

        if (Math.abs(x) > mapSize - 5 || Math.abs(z) > mapSize - 5) {
            attempts++;
            continue;
        }

        const testPos = new THREE.Vector3(x, 5, z);
        raycaster.set(testPos, new THREE.Vector3(0, -1, 0));
        const hits = raycaster.intersectObjects(walls);

        if (hits.length === 0 || hits[0].distance > 4) {
            validPosition = true;
        }

        attempts++;
    }

    if (validPosition) {
        spawnEnemy(x, z);
    }
}

function showDamageEffect() {
    let overlay = document.getElementById('damageOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'damageOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(255, 0, 0, 0.17);
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.1s;
        `;
        document.body.appendChild(overlay);
    }

    overlay.style.opacity = '1';
    setTimeout(() => {
        overlay.style.opacity = '0';
    }, 100);
}

function isDescendant(parent, child) {
    let node = child.parent;
    while (node) {
        if (node === parent) return true;
        node = node.parent;
    }
    return false;
}

function updatePlayerHealthUI() {
    const container = document.getElementById('playerHealthContainer');
    const fill = document.getElementById('playerHealthFill');
    const text = document.getElementById('playerHealthText');

    const healthPercent = (playerHealth / 100) * 100;
    fill.style.width = healthPercent + '%';

    if (healthPercent > 60) {
        fill.style.background = 'linear-gradient(to right, #00ff00, #88ff88)';
    } else if (healthPercent > 30) {
        fill.style.background = 'linear-gradient(to right, #ffaa00, #ffcc44)';
    } else {
        fill.style.background = 'linear-gradient(to right, #ff0000, #ff4444)';
    }

    text.textContent = `${Math.ceil(playerHealth)} / 100 HP 🧔‍♂️`;

    if (playerHealth <= 0 && !isGameOver) {
        showGameOver();
    }
}

// ========== SISTEMA DE DISPARO ==========

function createBulletImpact(position) {
    const geometry = new THREE.SphereGeometry(0.2, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const impact = new THREE.Mesh(geometry, material);
    impact.position.copy(position);
    scene.add(impact);

    setTimeout(() => {
        scene.remove(impact);
    }, 500);
}

function shoot() {
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);

    raycaster.set(camera.position, direction);

    const enemyMeshes = enemies.map(e => e.mesh).filter(m => m !== null);
    const enemyHits = raycaster.intersectObjects(enemyMeshes, true);

    if (enemyHits.length > 0) {
        const hitMesh = enemyHits[0].object;
        const enemy = enemies.find(e => {
            if (!e.mesh) return false;
            return e.mesh === hitMesh || e.mesh.children.includes(hitMesh) ||
                hitMesh.parent === e.mesh || isDescendant(e.mesh, hitMesh);
        });

        if (enemy) {
            enemy.takeDamage(25);
            createBulletImpact(enemyHits[0].point);
            return;
        }
    }

    const hits = raycaster.intersectObjects(walls, false);
    if (hits.length > 0) {
        const hitPoint = hits[0].point;
        createBulletImpact(hitPoint);
    }
}

// ========== FUNCIONES PARA EL INIT ==========

function generateWorld() {

    const textureLoader = new THREE.TextureLoader();

    const groundTexture = textureLoader.load('textures/ground.jpg');
    groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(10, 10);

    const groundGeo = new THREE.PlaneGeometry(mapSize * 2, mapSize * 2);
    const groundMat = new THREE.MeshStandardMaterial({
        map: groundTexture,
        roughness: 0.9,
        metalness: 0.0,
        side: THREE.DoubleSide
    });

    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Limites del mapa
    const wallHeight = 50;
    const wallThickness = 3;

    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0xc2b280,
        roughness: 0.9,
        metalness: 0.0,
        side: THREE.DoubleSide
    });

    const longWallGeo = new THREE.BoxGeometry(2 * mapSize + wallThickness, wallHeight, wallThickness);
    const shortWallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, 2 * mapSize + wallThickness);

    const wallConfigs = [
        { geo: longWallGeo, pos: [0, wallHeight / 2, mapSize] },
        { geo: longWallGeo, pos: [0, wallHeight / 2, -mapSize] },
        { geo: shortWallGeo, pos: [mapSize, wallHeight / 2, 0] },
        { geo: shortWallGeo, pos: [-mapSize, wallHeight / 2, 0] }
    ];

    wallConfigs.forEach(config => {
        const wall = new THREE.Mesh(config.geo, wallMaterial);
        wall.position.fromArray(config.pos);
        scene.add(wall);
        walls.push(wall);
    });

    // Rocas
    function hash(x, y, z) {
        let h = Math.sin(x * 12.9898 + y * 78.233 + z * 45.164) * 43758.5453;
        return h - Math.floor(h);
    }

    function perlinNoise(x, y, z) {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const zi = Math.floor(z);

        const xf = x - xi;
        const yf = y - yi;
        const zf = z - zi;

        const u = xf * xf * (3.0 - 2.0 * xf);
        const v = yf * yf * (3.0 - 2.0 * yf);
        const w = zf * zf * (3.0 - 2.0 * zf);

        const n000 = hash(xi, yi, zi);
        const n100 = hash(xi + 1, yi, zi);
        const n010 = hash(xi, yi + 1, zi);
        const n110 = hash(xi + 1, yi + 1, zi);
        const n001 = hash(xi, yi, zi + 1);
        const n101 = hash(xi + 1, yi, zi + 1);
        const n011 = hash(xi, yi + 1, zi + 1);
        const n111 = hash(xi + 1, yi + 1, zi + 1);

        const nx0 = n000 * (1 - u) + n100 * u;
        const nx1 = n010 * (1 - u) + n110 * u;
        const ny0 = nx0 * (1 - v) + nx1 * v;

        const nx0z = n001 * (1 - u) + n101 * u;
        const nx1z = n011 * (1 - u) + n111 * u;
        const ny1 = nx0z * (1 - v) + nx1z * v;

        return ny0 * (1 - w) + ny1 * w;
    }

    function createRockGeometry(size) {
        const geometry = new THREE.IcosahedronGeometry(size / 2, 4);

        const positionAttribute = geometry.getAttribute('position');
        const positions = positionAttribute.array;

        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];

            let noise = 0;
            let amplitude = 1;
            let frequency = 1;
            let maxValue = 0;

            for (let j = 0; j < 4; j++) {
                noise += perlinNoise(x * frequency * 0.5, y * frequency * 0.5, z * frequency * 0.5) * amplitude;
                maxValue += amplitude;
                amplitude *= 0.5;
                frequency *= 2;
            }

            noise /= maxValue;
            noise = noise * 0.6 + 0.5;

            const length = Math.sqrt(x * x + y * y + z * z);
            const factor = noise * 0.4 + 0.7;

            positions[i] = (x / length) * length * factor;
            positions[i + 1] = (y / length) * length * factor;
            positions[i + 2] = (z / length) * length * factor;
        }

        positionAttribute.needsUpdate = true;
        geometry.computeVertexNormals();

        return geometry;
    }

    const rockTexture1 = textureLoader.load('textures/base_rock.jpg');
    const rockTexture2 = textureLoader.load('textures/brown_rock.jpg');
    rockTexture1.wrapS = rockTexture1.wrapT = THREE.RepeatWrapping;
    rockTexture2.wrapS = rockTexture2.wrapT = THREE.RepeatWrapping;

    const rockMaterial1 = new THREE.MeshStandardMaterial({
        map: rockTexture1,
        roughness: 0.9,
        metalness: 0.05,
        side: THREE.FrontSide
    });

    const rockMaterial2 = new THREE.MeshStandardMaterial({
        map: rockTexture2,
        roughness: 0.85,
        metalness: 0.1,
        side: THREE.FrontSide
    });

    const rockMaterials = [rockMaterial1, rockMaterial2];

    function generateRocks(count) {
        const rocks = [];
        const groundLimit = mapSize - 10;
        const minDist = 8;

        for (let i = 0; i < count; i++) {
            let x, z, size;
            let tries = 0;
            let valid = false;

            while (!valid && tries < 100) {
                size = THREE.MathUtils.randFloat(4, 10);
                x = THREE.MathUtils.randFloat(-groundLimit, groundLimit);
                z = THREE.MathUtils.randFloat(-groundLimit, groundLimit);
                valid = true;

                for (const r of rocks) {
                    const dx = Math.abs(x - r.x);
                    const dz = Math.abs(z - r.z);
                    if (dx < (size + r.size) / 2 + minDist && dz < (size + r.size) / 2 + minDist) {
                        valid = false;
                        break;
                    }
                }
                tries++;
            }

            if (valid) {
                const materialIndex = Math.floor(Math.random() * rockMaterials.length);
                rocks.push({ x, z, size, materialIndex });
            }
        }
        return rocks;
    }

    const rockPositions = generateRocks(40);

    rockPositions.forEach(pos => {
        const geo = createRockGeometry(pos.size);
        const material = rockMaterials[pos.materialIndex];
        const mesh = new THREE.Mesh(geo, material);

        mesh.rotation.x = Math.random() * Math.PI;
        mesh.rotation.y = Math.random() * Math.PI;
        mesh.rotation.z = Math.random() * Math.PI;

        mesh.position.set(pos.x, pos.size / 2, pos.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        scene.add(mesh);
        walls.push(mesh);

        const collider = new THREE.Mesh(
            new THREE.SphereGeometry(pos.size * 1.2 / 1.5, 8, 8),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        collider.position.copy(mesh.position);
        scene.add(collider);
        walls.push(collider);
    });

}

function setupControls() {

    window.addEventListener('keydown', (e) => {
        const k = e.key.toUpperCase();
        if (k in keys) keys[k] = true;
    });
    window.addEventListener('keyup', (e) => {
        const k = e.key.toUpperCase();
        if (k in keys) keys[k] = false;
    });
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        miniCamera.aspect = window.innerWidth / window.innerHeight;
        miniCamera.updateProjectionMatrix();

        if (vehicleCamera) {
            vehicleCamera.aspect = window.innerWidth / window.innerHeight;
            vehicleCamera.updateProjectionMatrix();
        }
    });
    window.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            shoot();
        }
    });

    let lastMouseY = window.innerHeight / 2;

    window.addEventListener('mousemove', (e) => {
        const deltaY = e.clientY - lastMouseY;
        lastMouseY = e.clientY;

        pitch -= deltaY * sensitivity;
        pitch = Math.max(pitchMin, Math.min(pitchMax, pitch));
    });

    window.addEventListener('keydown', (e) => {
        const k = e.key.toUpperCase();
        if (k in keys) keys[k] = true;

        if (e.key === ' ') {
            if (!isInVehicle && checkVehicleInteraction()) {
                enterVehicle();
            } else if (isInVehicle) {
                exitVehicle();
            }
        }
    });
}

function setupCameras() {
    // Cámara principal
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    p_pos = new THREE.Vector3(0, 2.6, 0);
    camera.position.copy(p_pos);
    camera.layers.enable(0);
    scene.add(camera)

    // Camara del mini mapa
    let mapRange = mapSize / 2
    miniCamera = new THREE.OrthographicCamera(
        -mapRange, mapRange,
        mapRange, -mapRange,
        10, 101
    );
    miniCamera.position.set(0, 100, 0);
    miniCamera.lookAt(0, 0, 0);
    miniCamera.layers.enable(1); // Para poder ver la marca de los zombies
}

function setupLights() {

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(50, 80, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
    scene.add(sun);
}

// ========== GAME OVER Y REINICIO ==========

function showGameOver() {
    isGameOver = true;

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    let gameOverUI = document.getElementById('gameOverUI');
    if (!gameOverUI) {
        gameOverUI = document.createElement('div');
        gameOverUI.id = 'gameOverUI';
        gameOverUI.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            font-family: Arial, sans-serif;
            color: white;
        `;
        document.body.appendChild(gameOverUI);
    }

    gameOverUI.innerHTML = `
        <div style="text-align: center; animation: fadeIn 0.5s;">
            <h1 style="font-size: 72px; color: #ff3333; margin: 0; text-shadow: 0 0 20px #ff0000;">
                GAME OVER
            </h1>
            <div style="font-size: 18px; margin: 20px 0; color: #aaa;">
                <div style="margin: 10px 0;">⏱️ Tiempo: ${formatTime(gameTime)}</div>
                <div style="margin: 10px 0;">🧟 Zombies eliminados: ${zombiesKilled}</div>
            </div>
            <button id="restartBtn" style="
                margin-top: 40px;
                padding: 15px 40px;
                font-size: 20px;
                background: linear-gradient(to bottom, #00cc00, #009900);
                color: white;
                border: 3px solid #00ff00;
                border-radius: 10px;
                cursor: pointer;
                font-weight: bold;
                text-shadow: 0 2px 4px rgba(0,0,0,0.5);
                box-shadow: 0 4px 15px rgba(0,255,0,0.3);
                transition: all 0.3s;
            " onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 6px 20px rgba(0,255,0,0.5)';" 
               onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 15px rgba(0,255,0,0.3)';">
                🔄 REINICIAR JUEGO
            </button>
        </div>
        <style>
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-50px); }
                to { opacity: 1; transform: translateY(0); }
            }
        </style>
    `;

    gameOverUI.style.display = 'flex';

    document.getElementById('restartBtn').addEventListener('click', restartGame);
}

function restartGame() {
    const gameOverUI = document.getElementById('gameOverUI');
    if (gameOverUI) {
        gameOverUI.style.display = 'none';
    }

    clock = new THREE.Clock();

    isGameOver = false;
    playerHealth = 100;
    gameTime = 0;
    zombiesKilled = 0;
    isInVehicle = false;
    vehicleRespawnTimer = 0;
    angulo = 0;
    pitch = 0;
    spawnTimer = 0;
    spawnInterval = 5;
    zombiesPerSpawn = 1;
    maxZombies = 50;
    lastDifficultyIncrease = 0;

    p_pos.set(0, 2.6, 0);
    camera.position.copy(p_pos);
    camera.rotation.set(0, 0, 0);

    enemies.forEach(enemy => {
        if (enemy.mesh) {
            scene.remove(enemy.mesh);
        }
        if (enemy.marker) {
            scene.remove(enemy.marker);
        }
    });
    enemies.length = 0;
    enemyMixers.length = 0;
    enemyMarkers.length = 0;

    if (vehicle && vehicle.mesh) {
        scene.remove(vehicle.mesh);
    }
    vehicle = null;
    vehicleHealth = vehicleMaxHealth;

    updatePlayerHealthUI();
    updateVehicleHealthUI();
    updateStatsUI();

    const crosshair = document.getElementById('crosshair');
    if (crosshair) crosshair.style.visibility = 'visible';

    setTimeout(() => {
        spawnInitialEnemies(10);
    }, 500);

    setTimeout(() => {
        spawnVehicle();
    }, 1000);

    animate();
}

// ========== INIT, UPDATE Y ANIMATE ==========

function init() {
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0xd2b48c);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('container').appendChild(renderer.domElement);
    document.getElementById('container').appendChild(stats.domElement);

    // Escena
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xc2a87c, 0.017);

    // Marca del jugador
    playerMarker = new THREE.Mesh(
        new THREE.CircleGeometry(2, 16),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    playerMarker.rotation.x = -Math.PI / 2;
    scene.add(playerMarker);
    playerMarker.layers.set(1);

    // Arma
    const loader = new THREE.FBXLoader();
    loader.load(
        'models/gun/gun.fbx',
        function (object) {
            object.scale.set(0.3, 0.3, 0.3);
            object.position.set(0.6, -0.7, -0.4);

            object.rotation.y = Math.PI;
            object.rotation.x = Math.PI / 2;

            camera.add(object);

            object.traverse((child) => {
                if (child.isMesh) {
                    if (child.material) {
                        child.material.needsUpdate = true;
                    }
                }
            });
        },
        undefined,
        function (error) {
            console.error('Error al cargar el modelo del arma:', error);
        }
    );

    // Construccion del mundo
    generateWorld()
    setupControls()
    setupLights()
    setupCameras()

    // Cargar los assets de los enemigos
    setTimeout(() => {
        loadEnemyAssets();
    }, 100);

    // Spawneo del coche
    setTimeout(() => {
        loadEnemyAssets();
        spawnVehicle();
    }, 3000);
}

function update() {
    stats.update();
    const delta = clock.getDelta();

    updateProgressiveSpawn(delta);

    if (isInVehicle && vehicle) {
        if (keys.A) vehicle.rotation += vehicleRotationSpeed * delta;
        if (keys.D) vehicle.rotation -= vehicleRotationSpeed * delta;

        const direction = new THREE.Vector3(
            Math.sin(vehicle.rotation),
            0,
            Math.cos(vehicle.rotation)
        );

        let move = new THREE.Vector3();
        if (keys.W) move.add(direction.multiplyScalar(vehicleSpeed * delta));
        if (keys.S) move.sub(direction.multiplyScalar(vehicleSpeed * delta * 0.5));

        if (move.length() > 0) {
            raycaster.set(vehicle.position, move.normalize());
            const wallHits = raycaster.intersectObjects(walls);

            let canMove = true;
            if (wallHits.length > 0 && wallHits[0].distance < 3) {
                canMove = false;
            }

            if (canMove) {
                vehicle.position.add(move);
                p_pos.copy(vehicle.position);
                p_pos.y = 2.6;
            }
        }

        const camOffset = new THREE.Vector3(
            -Math.sin(vehicle.rotation) * cameraDistance,
            cameraHeight,
            -Math.cos(vehicle.rotation) * cameraDistance
        );

        const desiredCamPos = vehicle.position.clone().add(camOffset);

        const camDirection = camOffset.clone().normalize();
        raycaster.set(vehicle.position, camDirection);
        const camHits = raycaster.intersectObjects(walls);

        if (camHits.length > 0 && camHits[0].distance < cameraDistance) {
            const safeDistance = camHits[0].distance - 1;
            const adjustedOffset = camDirection.multiplyScalar(safeDistance);
            adjustedOffset.y = cameraHeight;
            vehicleCamera.position.copy(vehicle.position).add(adjustedOffset);
        } else {
            vehicleCamera.position.copy(desiredCamPos);
        }

        vehicleCamera.lookAt(vehicle.position);
        vehicle.update();

        enemies.forEach(enemy => {
            if (!enemy.mesh) return;
            const dist = vehicle.position.distanceTo(enemy.position);
            if (dist < 3) {
                enemy.takeDamage(50);
                vehicle.takeDamage(15);

                const knockback = enemy.position.clone().sub(vehicle.position).normalize();
                knockback.y = 0;
                enemy.position.add(knockback.multiplyScalar(12));

                // raycaster.set(enemy.position, new THREE.Vector3(0, -1, 0));
                // const groundHits = raycaster.intersectObjects(walls);
                // if (groundHits.length > 0) {
                //     enemy.position.y = 0;
                // }
            }
        })

    } else {
        const speed = moveSpeed * delta;

        if (keys.A) angulo += 2 * delta;
        if (keys.D) angulo -= 2 * delta;

        const direction = new THREE.Vector3(
            -Math.sin(angulo),
            0,
            -Math.cos(angulo)
        );

        let move = new THREE.Vector3();
        if (keys.W) move.add(direction);
        if (keys.S) move.sub(direction);
        if (move.length() > 0) move.normalize().multiplyScalar(speed);

        if (move.length() > 0) {
            raycaster.set(p_pos, move.clone().normalize());
            const hits = raycaster.intersectObjects(walls);
            let canMove = true;
            if (hits.length > 0 && hits[0].distance < 0.5) {
                canMove = false;
            }
            if (canMove) {
                p_pos.add(move);
            }
        }

        camera.position.copy(p_pos);
        camera.rotation.order = 'YXZ';
        camera.rotation.y = angulo;
        camera.rotation.x = pitch;
    }

    playerMarker.position.set(p_pos.x, 10, p_pos.z);
    miniCamera.position.set(p_pos.x, 100, p_pos.z);
    miniCamera.lookAt(p_pos.x, 0, p_pos.z);

    const canInteract = checkVehicleInteraction();
    document.getElementById('interactionMsg').style.display = canInteract ? 'block' : 'none';

    enemies.forEach(enemy => {
        enemy.update(delta);
    });

    updateVehicleHealthUI();
    updateRespawnTimerUI();

    gameTime += delta;
    updateStatsUI()
}

function animate() {
    requestAnimationFrame(animate);

    if (isGameOver) {
        return;
    }

    update();

    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    const activeCamera = isInVehicle ? vehicleCamera : camera;
    renderer.render(scene, activeCamera);

    const originalFog = scene.fog;
    scene.fog = null;

    const dim = Math.min(window.innerWidth, window.innerHeight) / 4;
    const x = 10;
    const y = 10;

    renderer.setViewport(x, y, dim, dim);
    renderer.setScissor(x, y, dim, dim);
    renderer.setScissorTest(true);
    renderer.render(scene, miniCamera);

    renderer.setScissorTest(false);
    scene.fog = originalFog;
}

init();
animate();
