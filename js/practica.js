var renderer, scene, camera;
var cameraControls, miniCamera;

const clock = new THREE.Clock();

var controls = {
  giroBase: 0,
  giroBrazo: 0,
  giroAntebrazoY: 0,
  giroAntebrazoZ: 0,
  giroPinza: 0,
  separacionPinza: 10,
  alambrico: false,
  irArriba: false,
  irAbajo: false,
  irIzquierda: false,
  irDerecha: false
};

var gui = new dat.GUI();

var guiControles = gui.addFolder('Controles');
var guiControlRobot = guiControles.addFolder('Control Robot')

guiControlRobot.add(controls, 'giroBase', -180, 180).name("Giro Base")
guiControlRobot.add(controls, 'giroBrazo', -45, 45).name("Giro Brazo")
guiControlRobot.add(controls, 'giroAntebrazoY', -180, 180).name("Giro Antebrazo Y")
guiControlRobot.add(controls, 'giroAntebrazoZ', -90, 90).name("Giro Antebrazo Z")
guiControlRobot.add(controls, 'giroPinza', -40, 220).name("Giro Pinza")
guiControlRobot.add(controls, 'separacionPinza', 0, 15).name("Separación Pinza")
guiControlRobot.add(controls, 'alambrico').name("Alambres")
guiControlRobot.add({ animaRobot }, 'animaRobot').name("Anima");

document.addEventListener('keyup', (event) => {
  switch (event.code) {
    case 'ArrowUp':
      controls.irArriba = false;
      break;
    case 'ArrowDown':
      controls.irAbajo = false;
      break;
    case 'ArrowLeft':
      controls.irIzquierda = false;
      break;
    case 'ArrowRight':
      controls.irDerecha = false;
      break;
  }
});

document.addEventListener('keydown', (event) => {
  switch (event.code) {
    case 'ArrowUp':
      controls.irArriba = true;
      break;
    case 'ArrowDown':
      controls.irAbajo = true;
      break;
    case 'ArrowLeft':
      controls.irIzquierda = true;
      break;
    case 'ArrowRight':
      controls.irDerecha = true;
      break;
  }
});

// Materiales, los pongos globales pq tengo que hacer lo del wireframe (alambres)
let materialBase, materialBrazo, materialAntebrazo, materialMano, materialPinza, materialRotula, materialSuelo;

// El robot y las piezas que se animan, por eso las pongo globales
let robot, pinzaIzquierda, pinzaDerecha, brazo, antebrazo, base, mano;

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(new THREE.Color(0x87CEEB));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('container').appendChild(renderer.domElement);

  scene = new THREE.Scene();

  var aspectRatio = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(50, aspectRatio, 1, 2000);
  camera.position.set(500, 200, 200);

  cameraControls = new THREE.OrbitControls(camera, renderer.domElement);
  cameraControls.target.set(0, 0, 0);

  miniCamera = new THREE.OrthographicCamera(
    -200, 200, 200, -200, 0.1, 500
  );
  miniCamera.position.set(0, 300, 0);
  miniCamera.lookAt(0, 0, 0);

  window.addEventListener('resize', updateAspectRatio);

  enchufarLuces();
  crearMateriales();
  crearHabitacion();
}

function enchufarLuces() {
  const luzAmbiente = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(luzAmbiente);

  // Luz direccional
  const luzDireccional = new THREE.DirectionalLight(0xffffff, 0.6);
  luzDireccional.position.set(200, 300, 200);
  luzDireccional.castShadow = true;
  luzDireccional.shadow.camera.left = -300;
  luzDireccional.shadow.camera.right = 300;
  luzDireccional.shadow.camera.top = 300;
  luzDireccional.shadow.camera.bottom = -300;
  luzDireccional.shadow.camera.near = 0.1;
  luzDireccional.shadow.camera.far = 1000;
  luzDireccional.shadow.mapSize.width = 2048;
  luzDireccional.shadow.mapSize.height = 2048;
  scene.add(luzDireccional);

  // Luz focal
  const luzFocal = new THREE.SpotLight(0xffffff, 0.8);
  luzFocal.position.set(-200, 400, 100);
  luzFocal.angle = Math.PI / 3;
  luzFocal.penumbra = 0.3;
  luzFocal.decay = 2;
  luzFocal.distance = 700;
  luzFocal.castShadow = true;
  luzFocal.shadow.mapSize.width = 1024;
  luzFocal.shadow.mapSize.height = 1024;
  scene.add(luzFocal);

  // Luz hemisférica
  const luzHemisferica = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
  luzHemisferica.position.set(0, 200, 0);
  scene.add(luzHemisferica);
}

function crearMateriales() {

  const textureLoader = new THREE.TextureLoader().setPath('images/');

  const baseTexture = textureLoader.load('metal_128.jpg');
  const brazoTexture = textureLoader.load('metal_128.jpg');
  const antebrazoTexture = textureLoader.load('wood512.jpg');
  const manoTexture = textureLoader.load('wood512.jpg');
  const sueloTexture = textureLoader.load('pisometalico_1024.jpg');

  baseTexture.wrapS = THREE.RepeatWrapping;
  baseTexture.wrapT = THREE.RepeatWrapping;
  baseTexture.repeat.set(2, 2);

  let cubeLoader = new THREE.CubeTextureLoader().setPath('images/');

  let envMap = cubeLoader.load([
    'posx.jpg', 'negx.jpg',
    'posy.jpg', 'negy.jpg',
    'posz.jpg', 'negz.jpg',
  ])

  materialBase = new THREE.MeshPhongMaterial({
    map: baseTexture,
    shininess: 80,
    specular: 0x555555,
    color: 0x807979,
  });

  materialBrazo = new THREE.MeshLambertMaterial({
    map: brazoTexture,
    color: 0x807979,
  });

  materialAntebrazo = new THREE.MeshPhongMaterial({
    map: antebrazoTexture,
    shininess: 60,
    specular: 0x444444,
    color: 0xb8945a
  });

  materialMano = new THREE.MeshLambertMaterial({
    map: manoTexture,
    color: 0xb8945a
  });

  materialRotula = new THREE.MeshPhongMaterial({
    color: 0xffd700,
    envMap: envMap,
    reflectivity: 0.9,
    shininess: 100,
    specular: 0xffffaa
  });

  materialSuelo = new THREE.MeshLambertMaterial({
    map: sueloTexture,
    color: 0xbdc3c7
  });

}

function crearHabitacion() {

  const textureLoader = new THREE.TextureLoader().setPath('images/');

  const materiales = [
    new THREE.MeshBasicMaterial({ map: textureLoader.load('posx.jpg'), side: THREE.BackSide }),
    new THREE.MeshBasicMaterial({ map: textureLoader.load('negx.jpg'), side: THREE.BackSide }),
    new THREE.MeshBasicMaterial({ map: textureLoader.load('posy.jpg'), side: THREE.BackSide }),
    new THREE.MeshBasicMaterial({ map: textureLoader.load('negy.jpg'), side: THREE.BackSide }),
    new THREE.MeshBasicMaterial({ map: textureLoader.load('posz.jpg'), side: THREE.BackSide }),
    new THREE.MeshBasicMaterial({ map: textureLoader.load('negz.jpg'), side: THREE.BackSide }),
  ];

  const ancho = 800;
  const alto = 500;
  const profundo = 800;

  const gHabitacion = new THREE.BoxGeometry(ancho, alto, profundo);

  const habitacion = new THREE.Mesh(gHabitacion, materiales);
  habitacion.position.y = 249
  scene.add(habitacion);

}

function loadScene() {
  const axesHelper = new THREE.AxesHelper(200);
  scene.add(axesHelper);

  robot = new THREE.Object3D();
  brazo = new THREE.Object3D();
  antebrazo = new THREE.Object3D();
  mano = new THREE.Object3D();

  /* EL BRAZO */

  // La base del brazo
  const gBase = new THREE.CylinderGeometry(50, 50, 15, 20, 2);
  base = new THREE.Mesh(gBase, materialBase);
  base.castShadow = true;
  base.receiveShadow = true;

  // El eje
  const gEje = new THREE.CylinderGeometry(20, 20, 15, 18, 2);
  let eje = new THREE.Mesh(gEje, materialBrazo);
  eje.rotation.x = Math.PI / 2;
  eje.position.y = 4;
  eje.castShadow = true;
  eje.receiveShadow = true;

  // El esparrago
  const gEsparrago = new THREE.BoxGeometry(18, 120, 12);
  let esparrago = new THREE.Mesh(gEsparrago, materialBrazo);
  esparrago.position.y = 60;
  esparrago.castShadow = true;
  esparrago.receiveShadow = true;

  // La rotula con material reflectante
  const gRotula = new THREE.SphereGeometry(20, 20, 20);
  let rotula = new THREE.Mesh(gRotula, materialRotula);
  rotula.position.y = 120;
  rotula.castShadow = true;
  rotula.receiveShadow = true;

  /* EL ANTEBRAZO */

  // El disco
  const gDisco = new THREE.CylinderGeometry(22, 22, 6, 20, 4);
  let disco = new THREE.Mesh(gDisco, materialAntebrazo);
  disco.castShadow = true;
  disco.receiveShadow = true;

  // Los nervios
  const gNervio = new THREE.BoxGeometry(4, 80, 4);
  const posiciones = [
    [-8, -8],
    [8, -8],
    [-8, 8],
    [8, 8]
  ];
  let nervios = [];
  posiciones.forEach(([x, z]) => {
    let nervio = new THREE.Mesh(gNervio, materialAntebrazo);
    nervio.position.set(x, 40, z);
    nervio.castShadow = true;
    nervio.receiveShadow = true;
    nervios.push(nervio);
  });

  /* LA MANO */

  // La base
  const gBaseMano = new THREE.CylinderGeometry(15, 15, 40, 20, 2);
  let baseMano = new THREE.Mesh(gBaseMano, materialMano);
  baseMano.rotation.x = Math.PI / 2;
  baseMano.castShadow = true;
  baseMano.receiveShadow = true;

  materialPinza = new THREE.MeshPhongMaterial({
    map: null,
    color: 0x1a1a18,
    shininess: 50
  });

  const gPinza = new THREE.BoxGeometry(19, 20, 4);

  pinzaIzquierda = new THREE.Mesh(gPinza, materialPinza);
  pinzaDerecha = new THREE.Mesh(gPinza, materialPinza);

  [pinzaIzquierda, pinzaDerecha].forEach((pinza, index) => {
    pinza.position.x = 19 / 2;
    pinza.position.z = index === 0 ? -10 : 10;
    pinza.castShadow = true;
    pinza.receiveShadow = true;
  });

  // Los dedos
  function crearGeometriaDedo() {
    const gDedo = new THREE.BufferGeometry();

    const vertices = new Float32Array([
      0, 10, -2,
      0, 10, 2,
      0, -10, 2,
      0, -10, -2,
      19, 6, -1,
      19, 6, 1,
      19, -6, 1,
      19, -6, -1
    ]);

    gDedo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    const indices = new Uint16Array([
      0, 5, 4,
      0, 1, 5,
      1, 2, 5,
      2, 6, 5,
      2, 3, 6,
      3, 7, 6,
      0, 7, 3,
      0, 4, 7,
      4, 5, 6,
      6, 7, 4
    ]);

    gDedo.setIndex(new THREE.BufferAttribute(indices, 1));
    gDedo.computeVertexNormals();

    return gDedo;
  }

  const gDedo = crearGeometriaDedo();

  let dedo1 = new THREE.Mesh(gDedo, materialPinza);
  let dedo2 = new THREE.Mesh(gDedo, materialPinza);

  dedo1.position.x = 19 / 2;
  dedo2.position.x = 19 / 2;
  dedo1.castShadow = true;
  dedo1.receiveShadow = true;
  dedo2.castShadow = true;
  dedo2.receiveShadow = true;

  /* MONTAJE DEL ROBOT */

  // Montar la mano
  pinzaDerecha.add(dedo1);
  pinzaIzquierda.add(dedo2);
  mano.add(pinzaIzquierda, pinzaDerecha);
  mano.add(baseMano);

  // Montar el antebrazo
  antebrazo.add(disco);
  nervios.forEach((n) => {
    antebrazo.add(n);
  });
  mano.position.y = 80;
  antebrazo.add(mano);

  // Montar el brazo
  brazo.add(eje);
  brazo.add(esparrago);
  brazo.add(rotula);
  antebrazo.position.y = 120;
  brazo.add(antebrazo);

  // Montar el robot
  base.add(brazo);
  robot.add(base);

  // Añadir el suelo
  const gSuelo = new THREE.PlaneGeometry(1000, 1000);
  let suelo = new THREE.Mesh(gSuelo, materialSuelo);
  suelo.rotation.x = -Math.PI / 2;
  suelo.receiveShadow = true;

  scene.add(suelo);
  scene.add(robot);
}

function updateAspectRatio() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  miniCamera.aspect = window.innerWidth / window.innerHeight;
  miniCamera.updateProjectionMatrix();
}

function update() {
  cameraControls.update();

  materialBase.wireframe = controls.alambrico;
  materialBrazo.wireframe = controls.alambrico;
  materialAntebrazo.wireframe = controls.alambrico;
  materialMano.wireframe = controls.alambrico;
  materialRotula.wireframe = controls.alambrico;
  materialSuelo.wireframe = controls.alambrico;
  materialPinza.wireframe = controls.alambrico;


  base.rotation.y = controls.giroBase * (Math.PI / 180);
  brazo.rotation.z = controls.giroBrazo * (Math.PI / 180);
  antebrazo.rotation.y = controls.giroAntebrazoY * (Math.PI / 180);
  antebrazo.rotation.z = controls.giroAntebrazoZ * (Math.PI / 180);
  mano.rotation.z = controls.giroPinza * (Math.PI / 180);
  pinzaIzquierda.position.z = -controls.separacionPinza - 2;
  pinzaDerecha.position.z = controls.separacionPinza + 2;

  delta = clock.getDelta() * 60.0;

  if (controls.irIzquierda) {
    robot.position.x -= 2 * delta;
  }

  if (controls.irDerecha) {
    robot.position.x += 2 * delta;
  }

  if (controls.irArriba) {
    robot.position.z -= 2 * delta;
  }

  if (controls.irAbajo) {
    robot.position.z += 2 * delta;
  }
}

function render() {
  requestAnimationFrame(render);
  TWEEN.update();
  update();

  // Camara principal
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);

  // Camara mini
  const dim = Math.min(window.innerWidth, window.innerHeight) / 4;
  const x = 10;
  const y = window.innerHeight - dim - 10;

  renderer.setViewport(x, y, dim, dim);
  renderer.setScissor(x, y, dim, dim);
  renderer.setScissorTest(true);
  renderer.render(scene, miniCamera);

  renderer.setScissorTest(false);
}

function animaRobot() {
  // Estados iniciales
  const origen = {
    giroBase: controls.giroBase,
    giroBrazo: controls.giroBrazo,
    giroAntebrazoY: controls.giroAntebrazoY,
    giroAntebrazoZ: controls.giroAntebrazoZ,
    separacionPinza: controls.separacionPinza
  };

  // Estados finales
  const destino = {
    giroBase: 90,
    giroBrazo: 30,
    giroAntebrazoY: 45,
    giroAntebrazoZ: 20,
    separacionPinza: 2
  };

  const subir = new TWEEN.Tween(origen)
    .to(destino, 2000)
    .easing(TWEEN.Easing.Quadratic.Out)
    .onUpdate(() => {
      controls.giroBase = origen.giroBase;
      controls.giroBrazo = origen.giroBrazo;
      controls.giroAntebrazoY = origen.giroAntebrazoY;
      controls.giroAntebrazoZ = origen.giroAntebrazoZ;
      controls.separacionPinza = origen.separacionPinza;
    });

  const bajar = new TWEEN.Tween(origen)
    .to({
      giroBase: 0,
      giroBrazo: 0,
      giroAntebrazoY: 0,
      giroAntebrazoZ: 0,
      separacionPinza: 10
    }, 2000)
    .easing(TWEEN.Easing.Quadratic.In)
    .onUpdate(() => {
      controls.giroBase = origen.giroBase;
      controls.giroBrazo = origen.giroBrazo;
      controls.giroAntebrazoY = origen.giroAntebrazoY;
      controls.giroAntebrazoZ = origen.giroAntebrazoZ;
      controls.separacionPinza = origen.separacionPinza;
    });

  subir.chain(bajar);
  subir.start();
}

init();
loadScene();
render();