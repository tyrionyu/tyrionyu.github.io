(function () {
  'use strict';

  if (typeof THREE === 'undefined') {
    alert('3D 引擎加载失败：请确认 lib/three.min.js 存在。');
    return;
  }

  // 六个面（中英）与 3D 盒子材质索引的对应关系
  // BoxGeometry 材质顺序：0:+X 右 1:-X 左 2:+Y 上 3:-Y 下 4:+Z 前 5:-Z 后
  const FACE_INDEX = { right: 0, left: 1, top: 2, bottom: 3, front: 4, back: 5 };
  const FACE_LABEL = {
    front: '正面', back: '背面', left: '左侧',
    right: '右侧', top: '顶部', bottom: '底部',
  };

  const MM = 0.01; // 毫米 -> 场景单位
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const state = {
    W: 200, D: 150, H: 100,        // 毫米：长 / 宽 / 高
    base: '#e8e4dd',               // 盒子底色
    bg: '#f5f5f3',                 // 背景色
    sel: 'front',                  // 当前选中的面（贴图目标）
    imgs: { front: null, back: null, left: null, right: null, top: null, bottom: null },
    auto: false,
  };

  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const canvas = $('scene');

  // ---------- 渲染器 / 场景 / 相机 ----------
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    preserveDrawingBuffer: true, // 便于导出 PNG
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(state.bg);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.autoRotateSpeed = 2.0;
  controls.autoRotate = false;

  // ---------- 灯光 ----------
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe2ea, 0.45));

  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(5, 9, 6);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.near = 0.5;
  dir.shadow.camera.far = 60;
  dir.shadow.camera.left = -10;
  dir.shadow.camera.right = 10;
  dir.shadow.camera.top = 10;
  dir.shadow.camera.bottom = -10;
  dir.shadow.bias = -0.0004;
  scene.add(dir);

  const fill = new THREE.DirectionalLight(0xffffff, 0.22);
  fill.position.set(-6, 4, -5);
  scene.add(fill);

  // ---------- 盒子 ----------
  const unitGeo = new THREE.BoxGeometry(1, 1, 1);
  const materials = [0, 1, 2, 3, 4, 5].map(() =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(state.base),
      roughness: 0.82,
      metalness: 0.0,
    })
  );
  const box = new THREE.Mesh(unitGeo, materials);
  box.castShadow = true;
  box.receiveShadow = true;
  scene.add(box);

  // 边缘描边，提升设计工具质感
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(unitGeo),
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 })
  );
  box.add(edges);

  // 接触阴影承接面
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.ShadowMaterial({ opacity: 0.22 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------- 尺寸 / 相机 ----------
  function layout() {
    const L = clamp(state.W, 10, 2000);
    const D = clamp(state.D, 10, 2000);
    const H = clamp(state.H, 10, 2000);

    box.scale.set(L * MM, H * MM, D * MM);
    const yCenter = (H * MM) / 2;
    box.position.y = yCenter;
    ground.position.y = 0;
    controls.target.set(0, yCenter, 0);

    const diag = Math.sqrt(L * L + D * D + H * H) * MM;
    controls.minDistance = diag * 1.3 + 0.5;
    controls.maxDistance = diag * 9 + 5;

    controls.update();
    onResize();
  }

  function resetView() {
    const L = clamp(state.W, 10, 2000);
    const D = clamp(state.D, 10, 2000);
    const H = clamp(state.H, 10, 2000);
    const diag = Math.sqrt(L * L + D * D + H * H) * MM;
    const dist = diag * 2.6 + 2.5;

    camera.position.set(dist * 0.75, H * MM * 1.4 + dist * 0.35, dist * 0.85);
    controls.target.set(0, (H * MM) / 2, 0);
    controls.autoRotate = false;
    setAuto(false);
    controls.update();
  }

  // ---------- 颜色 ----------
  function setBg(hex) {
    state.bg = hex;
    scene.background.set(hex);
  }
  function setBase(hex) {
    state.base = hex;
    for (const f in FACE_INDEX) {
      if (!state.imgs[f]) materials[FACE_INDEX[f]].color.set(hex);
    }
  }

  // ---------- 贴图 ----------
  const texLoader = new THREE.TextureLoader();

  function applyTexture(face, dataURL) {
    texLoader.load(dataURL, (tex) => {
      tex.encoding = THREE.sRGBEncoding;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

      const m = materials[FACE_INDEX[face]];
      if (m.map) m.map.dispose();
      m.map = tex;
      m.color.set(0xffffff); // 贴图时还原真实色彩
      m.needsUpdate = true;

      state.imgs[face] = dataURL;
      syncFaceButtons();
    });
  }

  function clearFace(face) {
    const m = materials[FACE_INDEX[face]];
    if (m.map) { m.map.dispose(); m.map = null; }
    m.color.set(state.base);
    m.needsUpdate = true;
    state.imgs[face] = null;
    syncFaceButtons();
  }

  // ---------- 选中面 ----------
  function selectFace(id) {
    if (!FACE_INDEX[id]) return;
    state.sel = id;
    document.querySelectorAll('.face-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.face === id)
    );
    $('curFaceLabel').textContent = FACE_LABEL[id];
  }
  function syncFaceButtons() {
    document.querySelectorAll('.face-btn').forEach((b) => {
      b.classList.toggle('has-img', !!state.imgs[b.dataset.face]);
    });
  }

  // ---------- 图片处理 ----------
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

  function handleFile(file, face) {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      alert('仅支持 JPG / PNG / WebP 格式的图片');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => applyTexture(face, reader.result);
    reader.readAsDataURL(file);
  }

  // ---------- 自动旋转 ----------
  function setAuto(on) {
    state.auto = on;
    controls.autoRotate = on;
    const btn = $('autoBtn');
    btn.textContent = '自动旋转：' + (on ? '开' : '关');
    btn.classList.toggle('on', on);
  }

  // ---------- 下载效果图 ----------
  function download() {
    renderer.render(scene, camera); // 确保捕获当前帧
    const url = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = '俞征佳-包装样机-' + Date.now() + '.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ---------- 面板控件 ----------
  const clampNum = (v, min, max, fb) => {
    let n = parseFloat(v);
    if (isNaN(n)) n = fb;
    return clamp(n, min, max);
  };

  $('dimW').addEventListener('input', (e) => { state.W = clampNum(e.target.value, 10, 2000, 200); layout(); });
  $('dimD').addEventListener('input', (e) => { state.D = clampNum(e.target.value, 10, 2000, 150); layout(); });
  $('dimH').addEventListener('input', (e) => { state.H = clampNum(e.target.value, 10, 2000, 100); layout(); });

  $('baseColor').addEventListener('input', (e) => setBase(e.target.value));
  $('bgColor').addEventListener('input', (e) => setBg(e.target.value));

  document.querySelectorAll('.face-btn').forEach((b) =>
    b.addEventListener('click', () => selectFace(b.dataset.face))
  );

  $('pickBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) handleFile(f, state.sel);
    e.target.value = '';
  });

  const dropZone = $('dropZone');
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('over');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f, state.sel);
  });

  // 拖拽到预览区 -> 应用到当前选中面
  stage.addEventListener('dragover', (e) => { e.preventDefault(); });
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f, state.sel);
  });

  $('removeBtn').addEventListener('click', () => clearFace(state.sel));
  $('autoBtn').addEventListener('click', () => setAuto(!state.auto));
  $('resetBtn').addEventListener('click', resetView);
  $('downloadBtn').addEventListener('click', download);

  // ---------- 自适应尺寸 ----------
  function onResize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  if (window.ResizeObserver) {
    new ResizeObserver(onResize).observe(stage);
  } else {
    window.addEventListener('resize', onResize);
  }

  // ---------- 渲染循环 ----------
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  // ---------- 初始化 ----------
  selectFace('front');
  syncFaceButtons();
  layout();
  resetView();
  onResize();
  animate();
})();
