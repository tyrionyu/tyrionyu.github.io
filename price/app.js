"use strict";

/* ---------- 常量 ---------- */
const PART_PROCESSES = {
  handbag: ["caixi", "siyin", "tangjin"],
  giftbox: ["caixi", "siyin", "tangjin", "lengtang"]
};

/* ---------- 状态 ---------- */
function createProduct(name) {
  return {
    name: name,
    quickFill: "",
    handbag: {
      enabled: true, model: "", color: "", unitPrice: 0, orderQty: 10,
      processes: {
        caixi: { selected: true, sides: 2 }, siyin: { selected: false, sides: 1 }, tangjin: { selected: false, sides: 1 }
      }
    },
    giftbox: {
      enabled: true, model: "", color: "", unitPrice: 0, orderQty: 10,
      processes: {
        caixi: { selected: true, sides: 2 }, siyin: { selected: false, sides: 1 },
        tangjin: { selected: false, sides: 1 }, lengtang: { selected: false, sides: 1 }
      }
    },
    lining: {
      enabled: true, unitPrice: 0, orderQty: 100, type: "default",
      defaultLining: { quantity: 1, type: "", color: "" },
      customLining: { quantity: 1, material: "", color: "" }
    },
    accessories: {
      blister:   { enabled: false, quantity: 0, color: "", unitPrice: 0 },
      combo:     { enabled: false, quantity: 1, item: "", color: "", unitPrice: 0 },
      titlePage: { enabled: false, quantity: 0, material: "稻香纸", unitPrice: 0 },
      sticker:   { enabled: false, quantity: 0, material: "书写纸", unitPrice: 0 }
    }
  };
}

const state = {
  quote: { customer: "", no: "", date: todayStr(), status: "草稿", version: 1, shipping: 0, taxRate: 0, remark: "", contact: "", phone: "" },
  processCatalog: {
    caixi:    { name: "彩印", method: "每面", unitPrice: 1, feeName: "上机费", feeAmount: 10 },
    siyin:    { name: "丝印", method: "每面", unitPrice: 1, feeName: "版费",   feeAmount: 10 },
    lengtang: { name: "冷烫", method: "每面", unitPrice: 1, feeName: "版费",   feeAmount: 10 },
    tangjin:  { name: "烫金", method: "每面", unitPrice: 1, feeName: "版费",   feeAmount: 10 },
    dingnei:  { name: "定制内衬", method: "每个", unitPrice: 1, feeName: "版费", feeAmount: 10 }
  },
  products: [ createProduct("产品1") ]
};

/* ---------- 工具 ---------- */
function todayStr() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function setByPath(obj, path, val) {
  const parts = path.split("."); let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { if (o[parts[i]] === undefined) o[parts[i]] = {}; o = o[parts[i]]; }
  o[parts[parts.length - 1]] = val;
}
function getByPath(obj, path) { return path.split(".").reduce((o, k) => (o ? o[k] : undefined), obj); }
function esc(s) {
  return (s === undefined || s === null) ? "" : String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function money(n) {
  return "¥" + (Math.round((n || 0) * 100) / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function toChineseUpper(num) {
  num = Math.abs(Number(num) || 0);
  const digit = ['零','壹','贰','叁','肆','伍','陆','柒','捌','玖'];
  const unit = ['', '拾', '佰', '仟'];
  const secUnit = ['', '万', '亿', '兆'];
  const intPart = Math.floor(num + 1e-9);
  const cents = Math.round((num - intPart) * 100);
  if (intPart === 0 && cents === 0) return '零元整';
  let intStr = '';
  if (intPart > 0) {
    let n = intPart, secs = [];
    while (n > 0) { secs.unshift(n % 10000); n = Math.floor(n / 10000); }
    for (let i = 0; i < secs.length; i++) {
      const v = secs[i];
      const su = secUnit[secs.length - 1 - i];
      if (v === 0) {
        if (intStr !== '' && !intStr.endsWith('零')) intStr += '零';
        continue;
      }
      let secStr = '', zeroFlag = false, str = String(v);
      for (let j = 0; j < str.length; j++) {
        const d = parseInt(str[j], 10), p = str.length - 1 - j;
        if (d === 0) { zeroFlag = true; }
        else { if (zeroFlag && secStr !== '') secStr += '零'; secStr += digit[d] + unit[p]; zeroFlag = false; }
      }
      intStr += secStr + su;
    }
    if (intStr.endsWith('零')) intStr = intStr.slice(0, -1);
    intStr += '元';
  }
  let out = intStr;
  if (cents === 0) {
    out += '整';
  } else {
    const jiao = Math.floor(cents / 10), fen = cents % 10;
    if (jiao > 0) out += digit[jiao] + '角';
    else if (intPart > 0) out += '零';
    if (fen > 0) out += digit[fen] + '分';
  }
  return out;
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

/* ---------- 批量录入解析 ---------- */
function applyQuickFill(pi, raw) {
  if (raw === undefined || raw === null) return;
  const s = String(raw).replace(/[－—–]/g, "-");      // 兼容全角/长横线
  const parts = s.split("-").map(x => x.trim());
  if (parts.length < 5 || parts.slice(0, 5).some(x => x === "")) return; // 必须 5 段且非空
  const model = parts[0], color = parts[1], jiGe = parts[2], dongXi = parts[3], orderQty = parts[4];
  const p = state.products[pi];
  const oq = parseInt(orderQty, 10) || 0;
  // 手提袋：型号 / 颜色 / 下单数量
  p.handbag.model = model; p.handbag.color = color; p.handbag.orderQty = oq;
  // 礼盒：型号 / 颜色 / 下单数量
  p.giftbox.model = model; p.giftbox.color = color; p.giftbox.orderQty = oq;
  // 内衬：下单数量（默认/定制均写）；默认内衬再写 数量 与 内衬种类
  p.lining.orderQty = oq;
  if (p.lining.type === "default") {
    p.lining.defaultLining.quantity = parseInt(jiGe, 10) || 0;
    p.lining.defaultLining.type = dongXi;
  }
}

/* ---------- 计算 ---------- */
function calcProcessFee(key, count, orderQty, ctx) {
  const p = state.processCatalog[key];
  const unitPrice = Number(p.unitPrice) || 0;
  const feeAmount = Number(p.feeAmount) || 0;
  const variable = (count || 0) * unitPrice * (orderQty || 0);
  let fixed = 0;
  // 多个部位同一种工艺时，只收一次工艺固定费用（上机费/版费）
  if (ctx && !ctx.chargedCrafts.has(key)) {
    fixed = feeAmount;
    ctx.chargedCrafts.add(key);
  }
  return { variable: variable, fixed: fixed, total: variable + fixed };
}
function calcProduct(p, pi, ctx) {
  const compRows = [];
  const processRows = [];
  function pushProc(part, key, count, orderQty) {
    const fee = calcProcessFee(key, count, orderQty, ctx);
    const row = Object.assign({ part: part, count: count, orderQty: orderQty }, state.processCatalog[key], fee);
    row.feeAmount = fee.fixed;
    processRows.push(row);
  }

  if (p.handbag.enabled) {
    const oq = Number(p.handbag.orderQty) || 0;
    const up = Number(p.handbag.unitPrice) || 0;
    compRows.push({ label: "手提袋", unitPrice: up, orderQty: oq, amount: up * oq });
    PART_PROCESSES.handbag.forEach(k => {
      const ps = p.handbag.processes[k];
      if (ps.selected) pushProc("手提袋", k, ps.sides, oq);
    });
  }
  if (p.giftbox.enabled) {
    const oq = Number(p.giftbox.orderQty) || 0;
    const up = Number(p.giftbox.unitPrice) || 0;
    compRows.push({ label: "礼盒", unitPrice: up, orderQty: oq, amount: up * oq });
    PART_PROCESSES.giftbox.forEach(k => {
      const ps = p.giftbox.processes[k];
      if (ps.selected) pushProc("礼盒", k, ps.sides, oq);
    });
  }
  if (p.lining.enabled) {
    const oq = Number(p.lining.orderQty) || 0;
    const up = Number(p.lining.unitPrice) || 0;
    compRows.push({ label: "内衬", unitPrice: up, orderQty: oq, amount: up * oq });
    if (p.lining.type === "custom") {
      pushProc("定制内衬", "dingnei", p.lining.customLining.quantity, oq);
    }
  }

  const productAmount = compRows.reduce((s, r) => s + r.amount, 0);
  const processAmount = processRows.reduce((s, r) => s + r.total, 0);

  const accessoryRows = [];
  const A = p.accessories;
  if (A.blister.enabled)   accessoryRows.push({ name: "泡袋",   detail: A.blister.color,     qty: A.blister.quantity,   unitPrice: A.blister.unitPrice,   amount: (Number(A.blister.quantity)||0) * (Number(A.blister.unitPrice)||0) });
  if (A.titlePage.enabled) accessoryRows.push({ name: "扉页",   detail: A.titlePage.material, qty: A.titlePage.quantity, unitPrice: A.titlePage.unitPrice, amount: (Number(A.titlePage.quantity)||0) * (Number(A.titlePage.unitPrice)||0) });
  if (A.sticker.enabled)   accessoryRows.push({ name: "不干胶", detail: A.sticker.material,   qty: A.sticker.quantity,   unitPrice: A.sticker.unitPrice,   amount: (Number(A.sticker.quantity)||0) * (Number(A.sticker.unitPrice)||0) });
  if (A.combo.enabled)     accessoryRows.push({ name: "其它", detail: [A.combo.item, A.combo.color].filter(v => v).join(" - "), qty: A.combo.quantity,     unitPrice: A.combo.unitPrice,     amount: (Number(A.combo.quantity)||0) * (Number(A.combo.unitPrice)||0) });
  const accessoryAmount = accessoryRows.reduce((s, r) => s + r.amount, 0);

  return { compRows, productAmount, processRows, processAmount, accessoryRows, accessoryAmount, total: productAmount + processAmount + accessoryAmount };
}

/* ---------- 全单计算（固定费用按工艺只收一次） ---------- */
function calcAllProducts() {
  const ctx = { chargedCrafts: new Set() };
  return state.products.map((p, i) => calcProduct(p, i, ctx));
}

/* ---------- 预览渲染 ---------- */
function renderPreview() {
  const q = state.quote;
  let html = '<div class="doc"><div class="doc-head"><h1>报 价 单</h1><div class="doc-meta">'
    + '<div><span>客户：</span>' + (esc(q.customer) || "—") + '</div>'
    + '<div><span>联系人：</span>' + (esc(q.contact) || "—") + '</div>'
    + '<div><span>电话：</span>' + (esc(q.phone) || "—") + '</div>'
    + '<div><span>单号：</span>' + (esc(q.no) || "—") + '</div>'
    + '<div><span>日期：</span>' + (esc(q.date) || "—") + '</div></div></div>';

  const all = calcAllProducts();
  all.forEach((c, pi) => {
    const p = state.products[pi];
    html += '<div class="prod-block"><h2>' + (esc(p.name) || ("产品" + (pi + 1))) + '</h2>';
    html += '<table class="cfg">';

    if (p.handbag.enabled) {
      html += '<tr><th>手提袋</th><td>型号：' + (esc(p.handbag.model) || "—") + '　颜色：' + (esc(p.handbag.color) || "—")
        + '　单价：' + money(p.handbag.unitPrice) + '　数量：' + p.handbag.orderQty + '</td></tr>';
    }
    if (p.giftbox.enabled) {
      html += '<tr><th>礼盒</th><td>型号：' + (esc(p.giftbox.model) || "—") + '　颜色：' + (esc(p.giftbox.color) || "—")
        + '　单价：' + money(p.giftbox.unitPrice) + '　数量：' + p.giftbox.orderQty + '</td></tr>';
    }
    if (p.lining.enabled) {
      if (p.lining.type === "default") {
        const d = p.lining.defaultLining;
        html += '<tr><th>内衬</th><td>默认内衬　内衬数量：' + (d.quantity || "—") + '　种类：' + (esc(d.type) || "—") + '　颜色：' + (esc(d.color) || "—")
          + '　单价：' + money(p.lining.unitPrice) + '　数量：' + p.lining.orderQty + '</td></tr>';
      } else {
        const cu = p.lining.customLining;
        html += '<tr><th>内衬</th><td>定制内衬　内衬数量：' + (cu.quantity || "—") + '　材质：' + (esc(cu.material) || "—") + '　颜色：' + (esc(cu.color) || "—")
          + '　单价：' + money(p.lining.unitPrice) + '　数量：' + p.lining.orderQty + '</td></tr>';
      }
    }
    if (c.accessoryRows.length) {
      const acc = c.accessoryRows.map(r => r.name + "(" + r.qty + "×" + money(r.unitPrice) + ")").join("、");
      html += '<tr><th>配件</th><td>' + acc + '</td></tr>';
    }
    html += '</table>';

    if (c.processRows.length) {
      html += '<table class="fee"><thead><tr><th>产品部位</th><th>工艺</th><th>计费方式</th><th>面数/数量</th><th>单价</th><th>上机费/版费</th><th>固定费用</th><th>金额</th></tr></thead><tbody>';
      c.processRows.forEach(r => {
        html += '<tr><td>' + r.part + '</td><td>' + r.name + '</td><td>' + r.method + '</td><td>' + r.count
          + '</td><td>' + money(r.unitPrice) + '</td><td>' + r.feeName + '</td><td>' + money(r.feeAmount) + '</td><td>' + money(r.total) + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    if (c.accessoryRows.length) {
      html += '<table class="fee"><thead><tr><th>配件</th><th>物品/材质</th><th>数量</th><th>单价</th><th>金额</th></tr></thead><tbody>';
      c.accessoryRows.forEach(r => {
        html += '<tr><td>' + r.name + '</td><td>' + (esc(r.detail) || "—") + '</td><td>' + r.qty + '</td><td>' + money(r.unitPrice) + '</td><td>' + money(r.amount) + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '<div class="prod-sum"><span>产品金额：' + money(c.productAmount) + '</span>'
      + '<span>工艺金额：' + money(c.processAmount) + '</span>'
      + '<span>配件金额：' + money(c.accessoryAmount) + '</span>'
      + '<span class="strong">小计：' + money(c.total) + '</span></div></div>';
  });

  const grand = all.reduce((s, c) => s + c.total, 0);
  const shipping = Number(q.shipping) || 0;
  const taxRate = Number(q.taxRate) || 0;
  const tax = (grand + shipping) * taxRate / 100;
  const total = grand + shipping + tax;
  html += '<div class="sum-line">费用合计（不含税/运费）：<b>' + money(grand) + '</b></div>';
  html += '<div class="sum-line">运费：<b>' + money(shipping) + '</b></div>';
  html += '<div class="sum-line">税费（' + (taxRate || 0) + '%）：<b>' + money(tax) + '</b></div>';
  html += '<div class="grand">应付总计：<b>' + money(total) + '</b></div>';
  html += '<div class="sum-cap">价税合计（大写）：' + toChineseUpper(total) + '</div>';
  html += '<div class="remark"><span>备注与说明：</span>' + (esc(q.remark) || "—") + '</div></div>';
  document.getElementById("preview").innerHTML = html;
}

/* ---------- 面板渲染 ---------- */
function priceQtyRow(pi, base) {
  const o = getByPath(state, "products." + pi + "." + base);
  return '<div class="field-row">'
    + '<div class="field"><span class="lbl">下单数量</span><input type="number" data-bind="products.' + pi + '.' + base + '.orderQty" value="' + o.orderQty + '"></div>'
    + '<div class="field"><span class="lbl">单价</span><input type="number" data-bind="products.' + pi + '.' + base + '.unitPrice" value="' + o.unitPrice + '"></div></div>';
}
function renderProcessSelect(pi, part, keys) {
  const rows = keys.map(k => {
    const p = state.processCatalog[k];
    const ps = getByPath(state, "products." + pi + "." + part + ".processes." + k);
    const label = p.method === "每面" ? "面数" : "数量";
    let row = '<div class="proc-row"><label><input type="checkbox" data-bind="products.' + pi + '.' + part + '.processes.' + k + '.selected"'
      + (ps.selected ? " checked" : "") + '> ' + p.name + ' <span class="muted">(' + p.method + ')</span></label>';
    if (ps.selected) {
      row += '<label class="sides">' + label + '<input type="number" min="0" data-bind="products.' + pi + '.' + part + '.processes.' + k + '.sides" value="' + ps.sides + '"></label>';
    }
    row += '</div>';
    return row;
  }).join("");
  return '<div class="proc-rows">' + rows + '</div>';
}
function renderHandbagBody(pi) {
  const hb = state.products[pi].handbag;
  return priceQtyRow(pi, "handbag")
    + '<div class="field-row">'
    + '<div class="field"><span class="lbl">型号</span><input type="text" data-bind="products.' + pi + '.handbag.model" value="' + esc(hb.model) + '"></div>'
    + '<div class="field"><span class="lbl">颜色</span><input type="text" data-bind="products.' + pi + '.handbag.color" value="' + esc(hb.color) + '"></div></div>'
    + '<div class="proc-title">工艺（彩印 / 丝印 / 烫金）</div>' + renderProcessSelect(pi, "handbag", PART_PROCESSES.handbag);
}
function renderGiftboxBody(pi) {
  const gb = state.products[pi].giftbox;
  return priceQtyRow(pi, "giftbox")
    + '<div class="field-row">'
    + '<div class="field"><span class="lbl">型号</span><input type="text" data-bind="products.' + pi + '.giftbox.model" value="' + esc(gb.model) + '"></div>'
    + '<div class="field"><span class="lbl">颜色</span><input type="text" data-bind="products.' + pi + '.giftbox.color" value="' + esc(gb.color) + '"></div></div>'
    + '<div class="proc-title">工艺（彩印 / 丝印 / 烫金 / 冷烫）</div>' + renderProcessSelect(pi, "giftbox", PART_PROCESSES.giftbox);
}
function renderLiningBody(pi) {
  const L = state.products[pi].lining;
  let h = priceQtyRow(pi, "lining");
  h += '<div class="field-row"><div class="field" style="flex:1 1 100%;"><span class="lbl">内衬类型</span>'
    + '<div class="lining-cards">'
    + '<label class="lining-card' + (L.type === "default" ? " is-on" : "") + '"><input type="radio" name="lintype' + pi + '" data-liningtype="' + pi + '.default"' + (L.type === "default" ? " checked" : "") + '><span class="lc-title">默认内衬</span><span class="lc-desc">标准内衬方案</span></label>'
    + '<label class="lining-card' + (L.type === "custom" ? " is-on" : "") + '"><input type="radio" name="lintype' + pi + '" data-liningtype="' + pi + '.custom"' + (L.type === "custom" ? " checked" : "") + '><span class="lc-title">定制内衬</span><span class="lc-desc">自定义材质规格</span></label>'
    + '</div></div></div>';
  if (L.type === "default") {
    const d = L.defaultLining;
    h += '<div class="sub">'
      + '<div class="field-row"><div class="field"><span class="lbl">数量</span><input type="number" data-bind="products.' + pi + '.lining.defaultLining.quantity" value="' + d.quantity + '"></div>'
      + '<div class="field"><span class="lbl">内衬种类</span><input type="text" data-bind="products.' + pi + '.lining.defaultLining.type" value="' + esc(d.type) + '" placeholder="茶饼/泡袋/马口罐..."></div>'
      + '<div class="field"><span class="lbl">内衬颜色</span><input type="text" data-bind="products.' + pi + '.lining.defaultLining.color" value="' + esc(d.color) + '"></div></div></div>';
  } else {
    const cu = L.customLining;
    h += '<div class="sub">'
      + '<div class="field-row"><div class="field"><span class="lbl">数量</span><input type="number" data-bind="products.' + pi + '.lining.customLining.quantity" value="' + cu.quantity + '"></div>'
      + '<div class="field"><span class="lbl">材质</span><input type="text" data-bind="products.' + pi + '.lining.customLining.material" value="' + esc(cu.material) + '" placeholder="珍珠棉/灰板/卡纸/EVA"></div>'
      + '<div class="field"><span class="lbl">颜色</span><input type="text" data-bind="products.' + pi + '.lining.customLining.color" value="' + esc(cu.color) + '"></div></div></div>';
  }
  return h;
}
function compBlock(pi, key, title, bodyHtml) {
  const en = state.products[pi][key].enabled;
  if (en) {
    return '<div class="comp"><div class="comp-head"><span class="comp-title">' + title + '</span>'
      + '<button class="del-comp" data-delcomp="' + pi + '.' + key + '">删除</button></div>'
      + '<div class="comp-body">' + bodyHtml + '</div></div>';
  }
  return '<button class="add-comp-btn" data-addcomp="' + pi + '.' + key + '">+ 添加' + title + '</button>';
}
function renderAccessory(pi, key, label, inner) {
  const acc = state.products[pi].accessories[key];
  return '<div class="acc"><label class="acc-head"><input type="checkbox" data-toggleacc="' + pi + '.' + key + '"'
    + (acc.enabled ? " checked" : "") + '> ' + label + '</label>'
    + (acc.enabled ? '<div class="acc-body">' + inner + '</div>' : '') + '</div>';
}
function renderProductCard(pi) {
  const p = state.products[pi];

  let h = '<div class="prod-card"><div class="prod-card-head">'
    + '<input class="prod-name" type="text" data-quickfill="' + pi + '" value="' + esc(p.quickFill) + '"'
    + ' placeholder="型号-颜色-几个-东西-下单数量" title="按 型号-颜色-几个-东西-下单数量 顺序输入，用“-”隔开，自动填入手提袋/礼盒/内衬">'
    + (state.products.length > 1 ? '<button class="del-comp" data-delproduct="' + pi + '">删除商品</button>' : '') + '</div>';
  h += '<div class="field-row"><div class="field" style="flex:1 1 100%;">'
    + '<span class="lbl">商品名称（打印标题，如 产品1）</span>'
    + '<input type="text" data-bind="products.' + pi + '.name" value="' + esc(p.name) + '"></div></div>';

  h += compBlock(pi, "handbag", "手提袋", renderHandbagBody(pi));
  h += compBlock(pi, "giftbox", "礼盒", renderGiftboxBody(pi));
  h += compBlock(pi, "lining", "内衬", renderLiningBody(pi));

  h += '<div class="sub-title">配件（可选）</div>';
  h += renderAccessory(pi, "blister", "泡袋",
    '<div class="field-row"><div class="field"><span class="lbl">材质编号</span><input type="text" data-bind="products.' + pi + '.accessories.blister.color" value="' + esc(p.accessories.blister.color) + '"></div>'
    + '<div class="field"><span class="lbl">数量</span><input type="number" data-bind="products.' + pi + '.accessories.blister.quantity" value="' + p.accessories.blister.quantity + '"></div>'
    + '<div class="field"><span class="lbl">单价</span><input type="number" data-bind="products.' + pi + '.accessories.blister.unitPrice" value="' + p.accessories.blister.unitPrice + '"></div></div>');
  h += renderAccessory(pi, "titlePage", "扉页",
    '<div class="field-row"><div class="field"><span class="lbl">材质</span><select data-bind="products.' + pi + '.accessories.titlePage.material">' + opt(p.accessories.titlePage.material, ["稻香纸", "硫酸纸", "其它"]) + '</select></div>'
    + '<div class="field"><span class="lbl">数量</span><input type="number" data-bind="products.' + pi + '.accessories.titlePage.quantity" value="' + p.accessories.titlePage.quantity + '"></div>'
    + '<div class="field"><span class="lbl">单价</span><input type="number" data-bind="products.' + pi + '.accessories.titlePage.unitPrice" value="' + p.accessories.titlePage.unitPrice + '"></div></div>');
  h += renderAccessory(pi, "sticker", "不干胶",
    '<div class="field-row"><div class="field"><span class="lbl">材质</span><select data-bind="products.' + pi + '.accessories.sticker.material">' + opt(p.accessories.sticker.material, ["书写纸", "艾利纸", "牛皮纸", "红色洒金", "白色洒金", "白色珠光纸", "黄色珠光纸", "其它"]) + '</select></div>'
    + '<div class="field"><span class="lbl">数量</span><input type="number" data-bind="products.' + pi + '.accessories.sticker.quantity" value="' + p.accessories.sticker.quantity + '"></div>'
    + '<div class="field"><span class="lbl">单价</span><input type="number" data-bind="products.' + pi + '.accessories.sticker.unitPrice" value="' + p.accessories.sticker.unitPrice + '"></div></div>');
  h += renderAccessory(pi, "combo", "其它",
    '<div class="field-row"><div class="field"><span class="lbl">物品名称</span><input type="text" data-bind="products.' + pi + '.accessories.combo.item" value="' + esc(p.accessories.combo.item) + '"></div>'
    + '<div class="field"><span class="lbl">颜色</span><input type="text" data-bind="products.' + pi + '.accessories.combo.color" value="' + esc(p.accessories.combo.color) + '"></div>'
    + '<div class="field"><span class="lbl">数量</span><input type="number" data-bind="products.' + pi + '.accessories.combo.quantity" value="' + p.accessories.combo.quantity + '"></div>'
    + '<div class="field"><span class="lbl">单价</span><input type="number" data-bind="products.' + pi + '.accessories.combo.unitPrice" value="' + p.accessories.combo.unitPrice + '"></div></div>');

  return h + '</div>';
}

/* 模块级：下拉选项辅助（供多个渲染函数复用） */
function opt(val, arr) {
  return arr.map(o => '<option' + (val === o ? " selected" : "") + '>' + o + '</option>').join("");
}

function renderProcessCatalog() {
  const keys = ["caixi", "siyin", "lengtang", "tangjin", "dingnei"];
  let h = '<table class="cat"><thead><tr><th>工艺名称</th><th>计费方式</th><th>单价</th><th>固定费用名</th><th>固定费用金额</th></tr></thead><tbody>';
  keys.forEach(k => {
    const p = state.processCatalog[k];
    h += '<tr><td>' + p.name + '</td><td>' + p.method + '</td>'
      + '<td><input type="number" data-bind="processCatalog.' + k + '.unitPrice" value="' + p.unitPrice + '"></td>'
      + '<td><input type="text" data-bind="processCatalog.' + k + '.feeName" value="' + esc(p.feeName) + '"></td>'
      + '<td><input type="number" data-bind="processCatalog.' + k + '.feeAmount" value="' + p.feeAmount + '"></td></tr>';
  });
  return h + '</tbody></table>';
}
function renderQuoteInfo() {
  const q = state.quote;
  return '<div class="field-row">'
    + '<div class="field"><span class="lbl">客户名称</span><input type="text" data-bind="quote.customer" value="' + esc(q.customer) + '"></div>'
    + '<div class="field"><span class="lbl">单号</span><input type="text" data-bind="quote.no" value="' + esc(q.no) + '"></div>'
    + '<div class="field"><span class="lbl">日期</span><input type="date" data-bind="quote.date" value="' + esc(q.date) + '"></div></div>'
    + '<div class="field-row">'
    + '<div class="field"><span class="lbl">联系人</span><input type="text" data-bind="quote.contact" value="' + esc(q.contact) + '"></div>'
    + '<div class="field"><span class="lbl">电话</span><input type="text" data-bind="quote.phone" value="' + esc(q.phone) + '"></div></div>'
    + '<div class="field-row"><div class="field"><span class="lbl">状态</span><select data-bind="quote.status">' + opt(q.status, ["草稿", "定稿"]) + '</select></div>'
    + '<div class="field"><span class="lbl">版本号</span><input type="text" value="v' + (Number(q.version) || 1) + '" readonly title="每次导出自动 +1"></div></div>'
    + '<div class="field-row">'
    + '<div class="field"><span class="lbl">运费 (¥)</span><input type="number" min="0" step="0.01" data-bind="quote.shipping" value="' + (Number(q.shipping) || 0) + '"></div>'
    + '<div class="field"><span class="lbl">税率 (%)</span><input type="number" min="0" step="0.01" data-bind="quote.taxRate" value="' + (Number(q.taxRate) || 0) + '"></div></div>'
    + '<div class="field" style="flex:1 1 100%"><span class="lbl">备注与说明</span><textarea data-bind="quote.remark" rows="2" placeholder="交期 / 付款方式 / 特殊要求">' + esc(q.remark) + '</textarea></div>';
}
function renderPanel() {
  const panel = document.getElementById("panel");
  let html = '<div class="panel-section"><h3>报价单信息</h3>' + renderQuoteInfo() + '</div>';
  html += '<div class="panel-section"><h3>工艺费用设置（调整实时生效）</h3>' + renderProcessCatalog() + '</div>';
  html += '<div class="panel-section"><h3>商品列表（手提袋 / 礼盒 / 内衬 均可删除后添加回来）</h3>';
  state.products.forEach((p, pi) => { html += renderProductCard(pi); });
  html += '<button id="addProduct2" class="add-btn" data-addproduct2="">+ 添加商品</button></div>';
  panel.innerHTML = html;
}
function renderAll() { renderPanel(); renderPreview(); }
function addProduct() {
  state.products.push(createProduct("产品" + (state.products.length + 1)));
  renderAll();
}
function resetProducts() {
  if (!confirm("确定要清空所有商品吗？")) return;
  state.products = [ createProduct("产品1") ];
  renderAll();
}

/* ---------- 面板事件 ---------- */
function onPanelInput(e) {
  const el = e.target;
  if (el.dataset.bind !== undefined && el.type !== "checkbox") {
    let v = el.value;
    if (el.type === "number") v = parseFloat(v) || 0;
    setByPath(state, el.dataset.bind, v);
    renderPreview();
  }
}
function onPanelChange(e) {
  const el = e.target;
  if (el.dataset.bind !== undefined && el.type === "checkbox") {
    setByPath(state, el.dataset.bind, el.checked);
    renderAll(); return;
  }
  if (el.dataset.bind !== undefined && el.tagName === "SELECT") { // 仅 select 元素
    setByPath(state, el.dataset.bind, el.value);
    renderPreview(); return;
  }
  if (el.dataset.liningtype !== undefined) {
    const parts = el.dataset.liningtype.split(".");
    setByPath(state, "products." + parts[0] + ".lining.type", parts[1]);
    renderAll(); return;
  }
  if (el.dataset.toggleacc !== undefined) {
    const parts = el.dataset.toggleacc.split(".");
    const cur = getByPath(state, "products." + parts[0] + ".accessories." + parts[1] + ".enabled");
    setByPath(state, "products." + parts[0] + ".accessories." + parts[1] + ".enabled", !cur);
    renderAll(); return;
  }
  if (el.dataset.quickfill !== undefined) {
    const pi = +el.dataset.quickfill;
    state.products[pi].quickFill = el.value;
    applyQuickFill(pi, el.value);
    renderAll(); return;
  }
}
function onPanelClick(e) {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.delproduct !== undefined) {
    state.products.splice(+t.dataset.delproduct, 1); renderAll(); return;
  }
  if (t.dataset.addproduct2 !== undefined) { addProduct(); return; }
  if (t.dataset.delcomp !== undefined) {
    const a = t.dataset.delcomp.split(".");
    setByPath(state, "products." + a[0] + "." + a[1] + ".enabled", false); renderAll(); return;
  }
  if (t.dataset.addcomp !== undefined) {
    const a = t.dataset.addcomp.split(".");
    setByPath(state, "products." + a[0] + "." + a[1] + ".enabled", true); renderAll(); return;
  }
}

/* ---------- 导出文件名（PDF / Excel 共用） ---------- */
// 版本号每次导出自动 +1；返回 "单号_客户_日期_状态-版本号" 规范文件名（日期去连字符）
function buildExportFileName() {
  const q = state.quote;
  q.version = (Number(q.version) || 0) + 1;
  renderPanel(); // 刷新只读「版本号」显示，使其与文件名一致
  const no = String(q.no || "").trim() || "报价单号";
  const customer = String(q.customer || "").trim() || "客户";
  const date = String(q.date || "").replace(/-/g, "");
  const status = q.status || "草稿";
  const version = "v" + (Number(q.version) || 1);
  return no + "_" + customer + "_" + date + "_" + status + "-" + version;
}

/* ---------- 导出 Excel（双 Sheet：报价单 + 工艺费用设置） ---------- */
function exportExcel() {
  // ====== Sheet 1：主表（报价单）======
  const mainData = [];
  mainData.push(["报价单"]);
  mainData.push(["客户", state.quote.customer || "", "单号", state.quote.no || "", "日期", state.quote.date || "", "", ""]);
  mainData.push(["联系人", state.quote.contact || "", "电话", state.quote.phone || "", "", "", "", ""]);

  const all = calcAllProducts();
  all.forEach((c, pi) => {
    const p = state.products[pi];
    var prodAmtRows = [], procAmtRows = [], accAmtRows = []; // 收集各“金额”单元格行号，用于小计拆分公式
    mainData.push([(esc(p.name) || ("产品" + (pi + 1)))]);
    // 方案②：产品行上方加表头，行内只放纯数字，金额写 =D*E 公式（带缓存值），方便后续修改联动
    if (p.handbag.enabled || p.giftbox.enabled || p.lining.enabled) {
      mainData.push(["部位", "型号/类型", "颜色", "单价", "数量", "金额", "", ""]);
    }
    if (p.handbag.enabled) {
      var hbRow = mainData.length + 1;
      var hbUnit = Number(p.handbag.unitPrice) || 0;
      var hbQty = Number(p.handbag.orderQty) || 0;
      prodAmtRows.push(hbRow);
      mainData.push(["手提袋", esc(p.handbag.model), esc(p.handbag.color),
        hbUnit, hbQty,
        { f: "=D" + hbRow + "*E" + hbRow, v: hbUnit * hbQty }, "", ""]);
    }
    if (p.giftbox.enabled) {
      var gbRow = mainData.length + 1;
      var gbUnit = Number(p.giftbox.unitPrice) || 0;
      var gbQty = Number(p.giftbox.orderQty) || 0;
      prodAmtRows.push(gbRow);
      mainData.push(["礼盒", esc(p.giftbox.model), esc(p.giftbox.color),
        gbUnit, gbQty,
        { f: "=D" + gbRow + "*E" + gbRow, v: gbUnit * gbQty }, "", ""]);
    }
    if (p.lining.enabled) {
      var lnRow = mainData.length + 1;
      var lnUnit = Number(p.lining.unitPrice) || 0;
      var lnQty = Number(p.lining.orderQty) || 0;
      prodAmtRows.push(lnRow);
      // 内衬额外字段（内衬数量/种类/材质）合并进“型号/类型”列，保持与手提袋/礼盒统一的 6 列表头
      var lnSpec, lnColor;
      if (p.lining.type === "default") {
        var d = p.lining.defaultLining;
        lnSpec = "默认内衬 · 内衬数量:" + (d.quantity) + " · 种类:" + esc(d.type);
        lnColor = esc(d.color);
      } else {
        var cu = p.lining.customLining;
        lnSpec = "定制内衬 · 内衬数量:" + (cu.quantity) + " · 材质:" + esc(cu.material);
        lnColor = esc(cu.color);
      }
      // 内衬“型号/类型”列(B 列)文字较长，设为自动换行（wrapText）
      mainData.push(["内衬", { v: lnSpec, t: "s", s: { alignment: { wrapText: true } } }, lnColor,
        lnUnit, lnQty,
        { f: "=D" + lnRow + "*E" + lnRow, v: lnUnit * lnQty }, "", ""]);
    }
    if (c.processRows.length) {
      mainData.push(["产品部位", "工艺", "计费方式", "面数/数量", "单价", "上机费/版费", "固定费用", "金额(公式)"]);
      c.processRows.forEach(r => {
        // 当前行在 Excel 中的 1-based 行号（数组下标 + 1）
        var excelRow = mainData.length + 1;
        procAmtRows.push(excelRow);
        // 网页计算出的原始数值——作为单元格「缓存值(v)」一并写入。
        // 即使 XLOOKUP 不被支持或公式未重算，打开文件即显示正确报价（原先的公式也要在，不然不正确）。
        var origUnit = Number(r.unitPrice) || 0;
        var origFixed = Number(r.fixed) || 0;
        var origAmt = Number(r.total) || 0;
        // 计费方式(C) / 单价(E) / 固定费用(G) / 上机费·版费(F)：均 XLOOKUP 关联「工艺费用设置」表（整列引用，规避标题/表头行偏移）；原值同步保留为缓存。
        var xlkMethod = { f: "=XLOOKUP(B" + excelRow + ",'工艺费用设置'!A:A,'工艺费用设置'!B:B)", v: r.method };
        var xlkUnit = { f: "=XLOOKUP(B" + excelRow + ",'工艺费用设置'!A:A,'工艺费用设置'!C:C)", v: origUnit };
        var xlkFixed = { f: "=XLOOKUP(B" + excelRow + ",'工艺费用设置'!A:A,'工艺费用设置'!D:D)", v: origFixed };
        var xlkFeeName = { f: "=XLOOKUP(B" + excelRow + ",'工艺费用设置'!A:A,'工艺费用设置'!E:E)", v: r.feeName };
        // 金额：面数 × 单价 × 下单数量 +（该工艺首次出现才加固定费用，复刻网页“同种工艺只收一次”规则）
        var includeFixed = (r.fixed > 0);
        var amtF = { f: "=D" + excelRow + "*E" + excelRow + "*" + (Number(r.orderQty) || 0) + (includeFixed ? "+G" + excelRow : ""), v: origAmt };
        mainData.push([r.part, r.name, xlkMethod, r.count, xlkUnit, xlkFeeName, xlkFixed, amtF]);
      });
    }
    // 配件：默认出现（含“其它”行），金额写 =数量×单价 公式，方便在 Excel 中直接改价联动
    var A = p.accessories;
    var accRows = c.accessoryRows.slice();
    // 默认补一行“其它”（网页未启用 combo 时给一个空白可编辑行）
    if (!A.combo.enabled) {
      accRows.push({ name: "其它", detail: "", qty: 0, unitPrice: 0, amount: 0 });
    }
    mainData.push(["配件", "物品/材质", "数量", "单价", "金额", "", "", ""]);
    accRows.forEach(r => {
      var accRow = mainData.length + 1;
      accAmtRows.push(accRow);
      var aQty = Number(r.qty) || 0;
      var aUnit = Number(r.unitPrice) || 0;
      mainData.push([r.name, esc(r.detail) || "",
        aQty, aUnit,
        { f: "=C" + accRow + "*D" + accRow, v: aQty * aUnit },
        "", "", ""]);
    });
    // 小计 → 拆为「标签行 + 数值行」：产品金额 / 工艺金额 / 配件金额 / 小计（满足用户指定单元格布局 E/F/G/H）
    var labelRow = mainData.length + 1; // 标签行（用户视角：第13行）
    var valRow = labelRow + 1;          // 数值行（用户视角：第14行）
    // 产品金额(E) = 各产品行金额(F列) 之和；工艺金额(F) = 各工艺行金额(H列) 之和；配件金额(G) = 各配件行金额(E列) 之和
    var prodSumF = prodAmtRows.length ? ("=" + prodAmtRows.map(function(r) { return "F" + r; }).join("+")) : 0;
    var procSumF = procAmtRows.length ? ("=" + procAmtRows.map(function(r) { return "H" + r; }).join("+")) : 0;
    var accSumF  = accAmtRows.length  ? ("=" + accAmtRows.map(function(r) { return "E" + r; }).join("+")) : 0;
    mainData.push(["", "", "", "", "产品金额", "工艺金额", "配件金额", "小计"]); // 标签行：H 列写“小计”
    mainData.push([
      "", "", "", "",
      { f: prodSumF, v: c.productAmount },
      { f: procSumF, v: c.processAmount },
      { f: accSumF,  v: c.accessoryAmount },
      { f: "=E" + valRow + "+F" + valRow + "+G" + valRow, v: c.total }
    ]);
    mainData.push(["", "", "", "", "", "", "", ""]); // 小计下方空白行（间隔/手填，不参与计算）
  });
  var grand = all.reduce(function(s, c) { return s + c.total; }, 0);
  var q = state.quote;
  var shipping = Number(q.shipping) || 0;
  var taxRate = Number(q.taxRate) || 0;
  var tax = (grand + shipping) * taxRate / 100;
  var total = grand + shipping + tax;
  mainData.push(["", "", "", "", "", "", "费用合计（不含税/运费）", grand]);
  mainData.push(["", "", "", "", "", "", "运费", shipping]);
  mainData.push(["", "", "", "", "", "", "税费（" + (taxRate || 0) + "%）", tax]);
  mainData.push(["", "", "", "", "", "", "应付总计", total]);
  mainData.push(["", "", "", "", "", "", "价税合计（大写）", toChineseUpper(total)]);
  mainData.push(["备注与说明", (q.remark || ""), "", "", "", "", "", ""]);

  // ====== Sheet 2：工艺费用设置 ======
  var keys = ["caixi", "siyin", "lengtang", "tangjin", "dingnei"];
  var settingData = [
    ["工艺名称", "计费方式", "单价", "固定费用金额", "上机费/版费"]
  ];
  keys.forEach(function(k) {
    var pc = state.processCatalog[k];
    settingData.push([pc.name, pc.method, Number(pc.unitPrice), Number(pc.feeAmount), pc.feeName]);
  });

  // ====== 用 SheetJS 构建多 Sheet 工作簿 ======
  var wb = XLSX.utils.book_new();

  var wsMain = XLSX.utils.aoa_to_sheet(mainData);
  wsMain["!cols"] = [
    { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
    { wch: 12 }, { wch: 22 }, { wch: 12 }
  ];
  XLSX.utils.book_append_sheet(wb, wsMain, "报价单");

  var wsSetting = XLSX.utils.aoa_to_sheet(settingData);
  wsSetting["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsSetting, "工艺费用设置");

  // 下载为 .xlsx（真正的 Excel 格式，支持多 Sheet + 公式）
  XLSX.writeFile(wb, buildExportFileName() + ".xlsx");
}

/* ---------- 初始化 ---------- */
function init() {
  const panel = document.getElementById("panel");
  panel.addEventListener("input", onPanelInput);
  panel.addEventListener("change", onPanelChange);
  panel.addEventListener("click", onPanelClick);
  document.getElementById("resetBtn").addEventListener("click", resetProducts);
  document.getElementById("exportExcel").addEventListener("click", exportExcel);
  document.getElementById("exportPdf").addEventListener("click", () => {
    const fileName = buildExportFileName();
    const prevTitle = document.title;
    document.title = fileName;
    const restore = () => { document.title = prevTitle; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    setTimeout(restore, 1000);
    window.print();
  });
  renderPanel();
  renderPreview();
}
init();
