(function () {
  'use strict';

  // 六个面及其中文标签
  const FACES = [
    { id: 'front',  label: '正面' },
    { id: 'back',   label: '背面' },
    { id: 'left',   label: '左侧' },
    { id: 'right',  label: '右侧' },
    { id: 'top',    label: '顶部' },
    { id: 'bottom', label: '底部' },
  ];

  const DEFAULT_VIEW = { rx: -22, ry: 30 };

  const state = {
    W: 200, D: 150, H: 100,           // 毫米：长 / 宽 / 高
    base: '#e8e4dd',                  // 盒子底色
    bg: '#f5f5f3',                    // 背景色
    sel: 'front',                     // 当前选中的面
    imgs: { front: null, back: null, left: null, right: null, top: null, bottom: null },
    auto: false,
    rx: DEFAULT_VIEW.rx,
    ry: DEFAULT_VIEW.ry,
    dragging: false,
    lastX: 0, lastY: 0,
  };

  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const box = $('box');
  const shadow = $('shadow');

  const faceEls = {};
  document.querySelectorAll('.face').forEach((el) => { faceEls[el.dataset.face] = el; });

  // ---------- 视图 ----------
  function applyView() {
    box.style.transform = `rotateX(${state.rx}deg) rotateY(${state.ry}deg)`;
  }

  // ---------- 布局（按尺寸生成盒子）----------
  function layout() {
    const Wmm = Math.max(1, state.W);
    const Dmm = Math.max(1, state.D);
    const Hmm = Math.max(1, state.H);
    const maxM = Math.max(Wmm, Dmm, Hmm);

    const avail = Math.min(stage.clientWidth, stage.clientHeight) || 400;
    const scale = (avail * 0.40) / maxM;   // 自适应缩放，保证盒子完整可见

    const W = Wmm * scale;
    const D = Dmm * scale;
    const H = Hmm * scale;

    const set = (id, w, h, t) => {
      const e = faceEls[id];
      e.style.width = w + 'px';
      e.style.height = h + 'px';
      e.style.marginLeft = (-w / 2) + 'px';
      e.style.marginTop = (-h / 2) + 'px';
      e.style.transform = t;
    };

    set('front',  W, H, `translateZ(${D / 2}px)`);
    set('back',   W, H, `rotateY(180deg) translateZ(${D / 2}px)`);
    set('right',  D, H, `rotateY(90deg) translateZ(${W / 2}px)`);
    set('left',   D, H, `rotateY(-90deg) translateZ(${W / 2}px)`);
    set('top',    W, D, `rotateX(90deg) translateZ(${H / 2}px)`);
    set('bottom', W, D, `rotateX(-90deg) translateZ(${H / 2}px)`);

    // 接触阴影随盒子最大宽度变化
    const sw = Math.max(W, D) * 1.7 + 50;
    shadow.style.width = sw + 'px';
    shadow.style.height = (sw * 0.42) + 'px';
    shadow.style.transform = `translate(-50%, ${H / 2 + 24}px)`;
  }

  // ---------- 颜色 ----------
  function applyBg() {
    stage.style.setProperty('--bg', state.bg);
  }
  function applyFaceColors() {
    for (const id in faceEls) faceEls[id].style.backgroundColor = state.base;
  }
  function applyFaceTex(id) {
    const e = faceEls[id];
    if (state.imgs[id]) {
      e.style.backgroundImage = `url(${state.imgs[id]})`;
    } else {
      e.style.backgroundImage = 'none';
    }
  }

  // ---------- 选中面 ----------
  function selectFace(id) {
    if (!faceEls[id]) return;
    state.sel = id;
    document.querySelectorAll('.face-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.face === id)
    );
    for (const fid in faceEls) faceEls[fid].classList.toggle('selected', fid === id);
    $('curFaceLabel').textContent = FACES.find((f) => f.id === id).label;
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
    reader.onload = () => {
      state.imgs[face] = reader.result;
      applyFaceTex(face);
    };
    reader.readAsDataURL(file);
  }

  // ---------- 拖动旋转 ----------
  stage.addEventListener('pointerdown', (e) => {
    state.dragging = true;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  });
  stage.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    state.ry += dx * 0.5;
    state.rx -= dy * 0.5;
    state.rx = Math.max(-89, Math.min(89, state.rx));
    applyView();
  });
  const endDrag = () => { state.dragging = false; };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // ---------- 拖拽到具体面 ----------
  for (const id in faceEls) {
    const el = faceEls[id];
    el.addEventListener('click', () => selectFace(id));
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) { selectFace(id); handleFile(f, id); }
    });
  }

  // ---------- 面板控件 ----------
  const clampNum = (v, min, max, fallback) => {
    let n = parseFloat(v);
    if (isNaN(n)) n = fallback;
    return Math.max(min, Math.min(max, n));
  };

  $('dimW').addEventListener('input', (e) => { state.W = clampNum(e.target.value, 10, 2000, 200); layout(); });
  $('dimD').addEventListener('input', (e) => { state.D = clampNum(e.target.value, 10, 2000, 150); layout(); });
  $('dimH').addEventListener('input', (e) => { state.H = clampNum(e.target.value, 10, 2000, 100); layout(); });

  $('baseColor').addEventListener('input', (e) => { state.base = e.target.value; applyFaceColors(); });
  $('bgColor').addEventListener('input', (e) => { state.bg = e.target.value; applyBg(); });

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

  $('removeBtn').addEventListener('click', () => {
    state.imgs[state.sel] = null;
    applyFaceTex(state.sel);
  });

  $('autoBtn').addEventListener('click', () => {
    state.auto = !state.auto;
    $('autoBtn').textContent = '自动旋转：' + (state.auto ? '开' : '关');
    $('autoBtn').classList.toggle('on', state.auto);
  });

  $('resetBtn').addEventListener('click', () => {
    state.rx = DEFAULT_VIEW.rx;
    state.ry = DEFAULT_VIEW.ry;
    state.auto = false;
    $('autoBtn').textContent = '自动旋转：关';
    $('autoBtn').classList.remove('on');
    applyView();
  });

  window.addEventListener('resize', layout);

  // ---------- 自动旋转循环 ----------
  function loop() {
    if (state.auto && !state.dragging) {
      state.ry += 0.4;
      applyView();
    }
    requestAnimationFrame(loop);
  }

  // ---------- 初始化 ----------
  applyBg();
  applyFaceColors();
  for (const id in faceEls) applyFaceTex(id);
  selectFace('front');
  layout();
  applyView();
  loop();
})();
