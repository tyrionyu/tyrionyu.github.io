/* app.js — 状态管理、事件委托、实时刷新、持久化、导出接线 */
(function (global) {
  "use strict";
  var QB = global.QB;
  var D = QB.data, C = QB.calc, UI = QB.ui;

  var STORAGE_KEY = "price_v1_state_v1";
  var state = null;

  var panelEl, previewEl;

  /* ---------- 持久化 ---------- */
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  var saveTimer = null;
  function saveDebounced() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 300);
  }
  function normalize(state) {
    (state.products || []).forEach(function (p) {
      (p.mainParts || []).forEach(function (mp) {
        if (mp.type === "liner" && !mp.linerMode) {
          mp.linerMode = (mp.crafts && mp.crafts.length) ? "custom" : "default";
        }
      });
    });
    return state;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var obj = JSON.parse(raw);
        if (obj && obj.products && obj.craftTable) return normalize(obj);
      }
    } catch (e) {}
    return D.defaultState();
  }

  /* ---------- 节点查找 ---------- */
  function findProduct(id) {
    for (var i = 0; i < state.products.length; i++) if (state.products[i].id === id) return state.products[i];
    return null;
  }
  function findItem(ds) {
    var p = findProduct(ds.prod);
    if (!p) return null;
    if (ds.mp) {
      for (var i = 0; i < p.mainParts.length; i++) if (p.mainParts[i].id === ds.mp) return p.mainParts[i];
    } else if (ds.acc) {
      for (var j = 0; j < p.accessories.length; j++) if (p.accessories[j].id === ds.acc) return p.accessories[j];
    }
    return null;
  }
  function findCraft(ds) {
    var item = findItem(ds);
    if (!item) return null;
    for (var i = 0; i < item.crafts.length; i++) if (item.crafts[i].id === ds.craft) return item.crafts[i];
    return null;
  }

  /* ---------- 渲染 ---------- */
  function renderPanel() { panelEl.innerHTML = UI.renderPanelHTML(state); }
  function renderPreview() { previewEl.innerHTML = UI.renderPreviewHTML(state); }
  function setText(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }

  function refreshAmounts() {
    state.products.forEach(function (p) {
      p.mainParts.forEach(function (mp) {
        setText("amt-mp-" + mp.id, "¥ " + D.money(C.mainPartAmount(mp)));
        setText("amt-craft-" + mp.id, "¥ " + D.money(C.itemCraftFee(state, mp)));
        mp.crafts.forEach(function (cr) { setText("amt-craftrow-" + cr.id, "¥ " + D.money(C.craftRowFee(state, mp, cr))); });
      });
      p.accessories.forEach(function (acc) {
        setText("amt-craft-" + acc.id, "¥ " + D.money(C.itemCraftFee(state, acc)));
        acc.crafts.forEach(function (cr) { setText("amt-craftrow-" + cr.id, "¥ " + D.money(C.craftRowFee(state, acc, cr))); });
      });
      var r = C.calcProduct(state, p);
      setText("amt-prod-" + p.id, "¥ " + D.money(r.amount));
    });
    setText("preview-total", "¥ " + D.money(C.calcGrand(state)));
    setText("amt-grand-panel", "¥ " + D.money(C.calcGrand(state)));
    setText("amt-grand-top", "¥ " + D.money(C.calcGrand(state)));
  }

  function afterValue() { renderPreview(); refreshAmounts(); saveDebounced(); }

  /* ---------- 结构变更（重渲染面板） ---------- */
  function afterStructure() { renderPanel(); renderPreview(); refreshAmounts(); save(); }

  function nextLabel() { return String.fromCharCode(65 + state.products.length); }

  function handleAction(action, ds) {
    switch (action) {
      case "add-prod":
        state.products.push(D.makeProduct(nextLabel())); afterStructure(); break;
      case "del-prod":
        if (state.products.length <= 1) { alert("至少保留一个商品"); return; }
        state.products = state.products.filter(function (p) { return p.id !== ds.prod; });
        // 重新整理标签 A/B/C
        state.products.forEach(function (p, i) { p.label = String.fromCharCode(65 + i); });
        afterStructure(); break;
      case "add-mp":
        var p1 = findProduct(ds.prod); if (p1) { p1.mainParts.push(D.makeMainPart(ds.type)); afterStructure(); } break;
      case "del-mp":
        var p2 = findProduct(ds.prod);
        if (p2) { p2.mainParts = p2.mainParts.filter(function (m) { return m.id !== ds.mp; }); afterStructure(); }
        break;
      case "add-acc":
        var p3 = findProduct(ds.prod); if (p3) { p3.accessories.push(D.makeAccessory(ds.type)); afterStructure(); } break;
      case "del-acc":
        var p4 = findProduct(ds.prod);
        if (p4) { p4.accessories = p4.accessories.filter(function (a) { return a.id !== ds.acc; }); afterStructure(); }
        break;
      case "add-craft":
        var item = findItem(ds);
        if (item) {
          var def = item.kind === "main" ? D.MAIN_PART_TYPES[item.type] : D.ACCESSORY_TYPES[item.type];
          item.crafts.push(D.makeCraft(def));
          afterStructure();
        }
        break;
      case "del-craft":
        var it = findItem(ds);
        if (it) { it.crafts = it.crafts.filter(function (c) { return c.id !== ds.craft; }); afterStructure(); }
        break;
      default: break;
    }
  }

  /* ---------- 事件委托 ---------- */
  function onInput(e) {
    var t = e.target;
    if (t.tagName === "SELECT") return; // 交给 change 处理
    // 单据信息
    if (t.id === "meta-customer") { state.meta.customer = t.value; afterValue(); return; }
    if (t.id === "meta-date") { state.meta.date = t.value; afterValue(); return; }
    if (t.id === "meta-no") { state.meta.no = t.value; afterValue(); return; }
    if (t.id === "meta-remark") { state.meta.remark = t.value; afterValue(); return; }
    // 工艺费用表
    if (t.dataset.ct) {
      var ci = +t.dataset.ci;
      state.craftTable[ci][t.dataset.ct] = parseFloat(t.value) || 0;
      afterValue(); return;
    }
    // 主件/配件 数值输入
    if (t.dataset.field && (t.dataset.mp || t.dataset.acc)) {
      var itm = findItem(t.dataset);
      if (itm) itm[t.dataset.field] = parseFloat(t.value) || 0;
      afterValue(); return;
    }
  }

  function onChange(e) {
    var t = e.target;
    // 内衬模式切换（默认内衬 / 定制内衬）
    if (t.dataset.field === "linerMode" && t.dataset.mp) {
      var lmItem = findItem(t.dataset);
      if (lmItem) {
        lmItem.linerMode = t.value;
        if (lmItem.linerMode === "custom") {
          if (!lmItem.crafts.length) {
            var ldef = D.MAIN_PART_TYPES[lmItem.type];
            lmItem.crafts.push(D.makeCraft(ldef));
          }
        } else {
          lmItem.crafts = [];
        }
        afterStructure();
      }
      return;
    }
    if (t.tagName !== "SELECT") return;
    // 工艺行选择（craft / faces）
    if (t.dataset.craft && t.dataset.field) {
      var cr = findCraft(t.dataset);
      if (cr) cr[t.dataset.field] = (t.dataset.field === "faces") ? (parseInt(t.value, 10) || 1) : t.value;
      afterValue(); return;
    }
    // 主件/配件 字段选择
    if (t.dataset.field && (t.dataset.mp || t.dataset.acc)) {
      var it = findItem(t.dataset);
      if (!it) return;
      it[t.dataset.field] = t.value;
      if (t.dataset.field === "count") it.qty = parseFloat(t.value) || 0; // 通用配件数量同步
      afterValue(); return;
    }
  }

  function onClick(e) {
    var btn = e.target.closest ? e.target.closest("[data-action]") : null;
    if (!btn) return;
    handleAction(btn.dataset.action, btn.dataset);
  }

  /* ---------- 示例报价 ---------- */
  function loadSample() {
    var s = D.defaultState();
    s.meta.customer = "示例客户（茶礼定制）";
    s.meta.remark = "演示：手提袋丝印 + 礼盒彩印；内衬定制 + 不干胶烫金";
    s.products = [];

    var A = D.makeProduct("A");
    A.mainParts = [];
    var handbag = D.makeMainPart("handbag");
    handbag.model = "9009"; handbag.color = "红色"; handbag.price = 5; handbag.qty = 200;
    handbag.crafts = [{ id: D.uid("craft"), craft: "丝印", faces: 1 }];
    var box = D.makeMainPart("box");
    box.model = "9217"; box.color = "咖色"; box.price = 8; box.qty = 200;
    box.crafts = [{ id: D.uid("craft"), craft: "彩印", faces: 2 }];
    A.mainParts.push(handbag, box);
    A.accessories = [];
    var gen = D.makeAccessory("generic");
    gen.count = "3"; gen.thing = "泡袋"; gen.color = "金色"; gen.price = 0.5; gen.qty = 3;
    A.accessories.push(gen);
    s.products.push(A);

    var B = D.makeProduct("B");
    B.mainParts = [];
    var liner = D.makeMainPart("liner");
    liner.linerMode = "custom";
    liner.material = "珍珠棉"; liner.color = "白色"; liner.price = 3; liner.qty = 200;
    liner.crafts = [{ id: D.uid("craft"), craft: "定制内衬", faces: 1 }];
    B.mainParts.push(liner);
    B.accessories = [];
    var sticker = D.makeAccessory("sticker");
    sticker.material = "书写纸"; sticker.price = 0.3; sticker.qty = 200;
    sticker.crafts = [{ id: D.uid("craft"), craft: "烫金", faces: 1 }];
    B.accessories.push(sticker);
    s.products.push(B);

    state = s;
    afterStructure();
    save();
  }

  function resetAll() {
    if (!confirm("确定清空当前报价并恢复默认？")) return;
    state = D.defaultState();
    afterStructure();
    save();
  }

  /* ---------- 初始化 ---------- */
  function init() {
    panelEl = document.getElementById("panel");
    previewEl = document.getElementById("preview");

    state = load();

    renderPanel();
    renderPreview();
    refreshAmounts();

    panelEl.addEventListener("input", onInput);
    panelEl.addEventListener("change", onChange);
    panelEl.addEventListener("click", onClick);

    var ex = document.getElementById("btn-export-excel");
    if (ex) ex.addEventListener("click", function () { QB.excel.export(state); });
    var pf = document.getElementById("btn-export-pdf");
    if (pf) pf.addEventListener("click", function () { QB.pdf.export(state); });
    var sm = document.getElementById("btn-sample");
    if (sm) sm.addEventListener("click", loadSample);
    var rs = document.getElementById("btn-reset");
    if (rs) rs.addEventListener("click", resetAll);
  }

  global.QB.app = { init: init, getState: function () { return state; } };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
