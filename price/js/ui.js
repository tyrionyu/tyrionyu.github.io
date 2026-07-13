/* ui.js — 渲染函数（返回 HTML 字符串）
 * 左侧：renderPreviewHTML(state) 实时报价预览
 * 右侧：renderPanelHTML(state)   操作面板
 */
(function (global) {
  "use strict";
  var QB = global.QB;
  var D = QB.data, C = QB.calc;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function opts(options, selected) {
    return options.map(function (o) {
      var v = typeof o === "object" ? o.value : o;
      var lbl = typeof o === "object" ? o.label : o;
      return '<option value="' + esc(v) + '"' + (String(v) === String(selected) ? " selected" : "") + ">" + esc(lbl) + "</option>";
    }).join("");
  }

  function numInput(value, attrs) {
    attrs = attrs || {};
    return '<input type="number" step="0.01" min="0" class="inp inp--num" value="' + esc(value) +
      '" data-field="' + esc(attrs.field) + '"' +
      (attrs.prodId ? ' data-prod="' + esc(attrs.prodId) + '"' : "") +
      (attrs.dataId ? ' data-' + attrs.dataKey + '="' + esc(attrs.dataId) + '"' : "") + " />";
  }

  /* ---------- 主件渲染 ---------- */
  function renderMainPart(state, prod, mp) {
    var def = D.MAIN_PART_TYPES[mp.type];
    var isLiner = mp.type === "liner";
    var isCustom = isLiner && mp.linerMode === "custom";

    var fieldList = isCustom ? def.customFields : def.fields;
    var fieldHtml = fieldList.map(function (f) {
      var val = mp[f.key];
      return '<label class="fld"><span>' + esc(f.label) + '</span>' +
        '<select class="inp" data-field="' + esc(f.key) + '" data-prod="' + esc(prod.id) + '" data-mp="' + esc(mp.id) + '">' +
        opts(f.options, val) + "</select></label>";
    }).join("");

    // 内衬：默认内衬 / 定制内衬 二选一
    var modeToggle = isLiner
      ? '<div class="mode-toggle">' +
        '<label class="mode-toggle__opt"><input type="radio" name="lm-' + esc(mp.id) + '" data-field="linerMode" data-prod="' + esc(prod.id) + '" data-mp="' + esc(mp.id) + '" value="default" ' + (!isCustom ? "checked" : "") + ' /> 默认内衬</label>' +
        '<label class="mode-toggle__opt"><input type="radio" name="lm-' + esc(mp.id) + '" data-field="linerMode" data-prod="' + esc(prod.id) + '" data-mp="' + esc(mp.id) + '" value="custom" ' + (isCustom ? "checked" : "") + ' /> 定制内衬</label>' +
        "</div>"
      : "";

    var craftHtml = "";
    if (def.craftable) {
      if (isLiner) {
        // 内衬：默认模式无工艺；定制模式固定「定制内衬」（按个计费），不可增删
        if (isCustom && mp.crafts[0]) {
          var cr = mp.crafts[0];
          craftHtml =
            '<div class="crafts">' +
            '<div class="crafts__head">定制工艺（定制内衬 · 按个计费）</div>' +
            '<div class="craft-row" data-craft="' + esc(cr.id) + '">' +
            '<span class="tag tag--gold">定制内衬</span>' +
            '<span class="muted small">1 个 × 单价 × 下单数量 + 固定费</span>' +
            '<span class="craft-row__fee" id="amt-craftrow-' + esc(cr.id) + '"></span>' +
            "</div></div>";
        }
      } else {
        var rows = mp.crafts.map(function (cr) {
          var isPiece = cr.craft === "定制内衬";
          var faceSel = isPiece
            ? '<span class="muted">按个计费（数量=下单数量）</span>'
            : '<select class="inp inp--sm" data-field="faces" data-prod="' + esc(prod.id) + '" data-mp="' + esc(mp.id) + '" data-craft="' + esc(cr.id) + '">' +
              opts([{ value: "1", label: "1 面" }, { value: "2", label: "2 面" }], cr.faces) + "</select>";
          var craftSel = isPiece
            ? '<span class="tag tag--gold">定制内衬</span>'
            : '<select class="inp inp--sm" data-field="craft" data-prod="' + esc(prod.id) + '" data-mp="' + esc(mp.id) + '" data-craft="' + esc(cr.id) + '">' +
              opts([{ value: "彩印", label: "彩印" }, { value: "丝印", label: "丝印" }, { value: "冷烫", label: "冷烫" }, { value: "烫金", label: "烫金" }], cr.craft) + "</select>";
          return '<div class="craft-row" data-craft="' + esc(cr.id) + '">' +
            craftSel + faceSel +
            '<span class="craft-row__fee" id="amt-craftrow-' + esc(cr.id) + '"></span>' +
            '<button class="btn btn--x" data-action="del-craft" data-prod="' + esc(prod.id) + '" data-mp="' + esc(mp.id) + '" data-craft="' + esc(cr.id) + '" title="删除工艺">×</button>' +
            "</div>";
        }).join("");

        craftHtml =
          '<div class="crafts">' +
          '<div class="crafts__head">定制工艺</div>' +
          rows +
          '<button class="btn btn--ghost btn--sm" data-action="add-craft" data-prod="' + esc(prod.id) + '" data-mp="' + esc(mp.id) + '">+ 添加工艺</button>' +
          "</div>";
      }
    }

    var priceField = '<label class="fld"><span>单价(元)</span>' + numInput(mp.price, { field: "price", prodId: prod.id, dataKey: "mp", dataId: mp.id }) + "</label>";
    var qtyField = '<label class="fld"><span>下单数量</span>' + numInput(mp.qty, { field: "qty", prodId: prod.id, dataKey: "mp", dataId: mp.id }) + "</label>";

    return (
      '<div class="item item--main" data-mp="' + esc(mp.id) + '">' +
      '<div class="item__head"><strong>' + esc(mp.label) + "</strong>" +
      '<button class="btn btn--x" data-action="del-mp" data-prod="' + esc(prod.id) + '" data-mp="' + esc(mp.id) + '" title="删除主件">×</button></div>' +
      modeToggle +
      '<div class="item__grid">' + fieldHtml + priceField + qtyField + "</div>" +
      '<div class="item__amount">主件金额：<span id="amt-mp-' + esc(mp.id) + '"></span></div>' +
      craftHtml +
      '<div class="item__crafttotal">工艺费用：<span id="amt-craft-' + esc(mp.id) + '"></span></div>' +
      "</div>"
    );
  }

  /* ---------- 配件渲染 ---------- */
  function renderAccessory(state, prod, acc) {
    var def = D.ACCESSORY_TYPES[acc.type];
    var fieldHtml = def.fields.map(function (f) {
      var val = acc[f.key];
      // 通用配件的「数量」为下拉；其余为隐藏在 qty 中
      if (f.key === "count") {
        return '<label class="fld"><span>' + esc(f.label) + '</span>' +
          '<select class="inp" data-field="count" data-prod="' + esc(prod.id) + '" data-acc="' + esc(acc.id) + '">' +
          opts(f.options, val) + "</select></label>";
      }
      return '<label class="fld"><span>' + esc(f.label) + '</span>' +
        '<select class="inp" data-field="' + esc(f.key) + '" data-prod="' + esc(prod.id) + '" data-acc="' + esc(acc.id) + '">' +
        opts(f.options, val) + "</select></label>";
    }).join("");

    var craftHtml = "";
    if (def.craftable) {
      var rows = acc.crafts.map(function (cr) {
        var faceSel = '<select class="inp inp--sm" data-field="faces" data-prod="' + esc(prod.id) + '" data-acc="' + esc(acc.id) + '" data-craft="' + esc(cr.id) + '">' +
          opts([{ value: "1", label: "1 面" }, { value: "2", label: "2 面" }], cr.faces) + "</select>";
        var craftSel = '<select class="inp inp--sm" data-field="craft" data-prod="' + esc(prod.id) + '" data-acc="' + esc(acc.id) + '" data-craft="' + esc(cr.id) + '">' +
          opts([{ value: "彩印", label: "彩印" }, { value: "丝印", label: "丝印" }, { value: "冷烫", label: "冷烫" }, { value: "烫金", label: "烫金" }], cr.craft) + "</select>";
        return '<div class="craft-row" data-craft="' + esc(cr.id) + '">' +
          craftSel + faceSel +
          '<span class="craft-row__fee" id="amt-craftrow-' + esc(cr.id) + '"></span>' +
          '<button class="btn btn--x" data-action="del-craft" data-prod="' + esc(prod.id) + '" data-acc="' + esc(acc.id) + '" data-craft="' + esc(cr.id) + '" title="删除工艺">×</button>' +
          "</div>";
      }).join("");
      craftHtml =
        '<div class="crafts">' +
        '<div class="crafts__head">定制工艺</div>' + rows +
        '<button class="btn btn--ghost btn--sm" data-action="add-craft" data-prod="' + esc(prod.id) + '" data-acc="' + esc(acc.id) + '">+ 添加工艺</button>' +
        "</div>";
    }

    var qtyField;
    if (acc.type === "generic") {
      qtyField = '<label class="fld"><span>数量(由上方决定)</span><input class="inp" value="' + esc(acc.qty) + '" disabled /></label>';
    } else if (def.oneTime) {
      qtyField = '<label class="fld"><span>数量</span><input class="inp" value="' + esc(acc.qty) + '" disabled />' +
        '<span class="muted small">一次性费用 · 单价只收一次</span></label>';
    } else {
      qtyField = '<label class="fld"><span>数量</span>' + numInput(acc.qty, { field: "qty", prodId: prod.id, dataKey: "acc", dataId: acc.id }) + "</label>";
    }

    return (
      '<div class="item item--acc" data-acc="' + esc(acc.id) + '">' +
      '<div class="item__head"><strong>' + esc(acc.label) + "</strong>" +
      '<button class="btn btn--x" data-action="del-acc" data-prod="' + esc(prod.id) + '" data-acc="' + esc(acc.id) + '" title="删除配件">×</button></div>' +
      '<div class="item__grid">' + fieldHtml +
      '<label class="fld"><span>单价(元)</span>' + numInput(acc.price, { field: "price", prodId: prod.id, dataKey: "acc", dataId: acc.id }) + "</label>" +
      qtyField +
      "</div>" +
      craftHtml +
      (def.craftable ? '<div class="item__crafttotal">工艺费用：<span id="amt-craft-' + esc(acc.id) + '"></span></div>' : "") +
      "</div>"
    );
  }

  /* ---------- 商品卡片 ---------- */
  function renderProduct(state, prod) {
    var mains = prod.mainParts.map(function (mp) { return renderMainPart(state, prod, mp); }).join("");
    var accs = prod.accessories.map(function (acc) { return renderAccessory(state, prod, acc); }).join("");
    return (
      '<div class="prod-card" data-prod="' + esc(prod.id) + '">' +
      '<div class="prod-card__head"><span class="prod-card__label">商品 ' + esc(prod.label) + "</span>" +
      '<button class="btn btn--danger btn--sm" data-action="del-prod" data-prod="' + esc(prod.id) + '">删除商品</button></div>' +
      '<div class="subhead">主件</div>' + (mains || '<p class="muted small">暂无主件</p>') +
      '<div class="item-actions">' +
      '<button class="btn btn--ghost btn--sm" data-action="add-mp" data-prod="' + esc(prod.id) + '" data-type="handbag">+ 手提袋</button>' +
      '<button class="btn btn--ghost btn--sm" data-action="add-mp" data-prod="' + esc(prod.id) + '" data-type="box">+ 包装</button>' +
      '<button class="btn btn--ghost btn--sm" data-action="add-mp" data-prod="' + esc(prod.id) + '" data-type="liner">+ 内衬</button>' +
      "</div>" +
      '<div class="subhead">配件</div>' + (accs || '<p class="muted small">暂无配件</p>') +
      '<div class="item-actions">' +
      '<button class="btn btn--ghost btn--sm" data-action="add-acc" data-prod="' + esc(prod.id) + '" data-type="generic">+ 通用配件</button>' +
      '<button class="btn btn--ghost btn--sm" data-action="add-acc" data-prod="' + esc(prod.id) + '" data-type="flyleaf">+ 扉页</button>' +
      '<button class="btn btn--ghost btn--sm" data-action="add-acc" data-prod="' + esc(prod.id) + '" data-type="sticker">+ 不干胶</button>' +
      '<button class="btn btn--ghost btn--sm" data-action="add-acc" data-prod="' + esc(prod.id) + '" data-type="bubble">+ 泡袋</button>' +
      "</div>" +
      '<div class="prod-card__total">商品金额：<span id="amt-prod-' + esc(prod.id) + '"></span></div>' +
      "</div>"
    );
  }

  /* ---------- 工艺费用表（可编辑） ---------- */
  function renderCraftTable(state) {
    var rows = state.craftTable.map(function (c, i) {
      return (
        "<tr>" +
        '<td>' + esc(c.name) + "</td>" +
        "<td>" + (c.unit === "piece" ? "每个" : "每面") + "</td>" +
        '<td><input type="number" step="0.01" min="0" class="inp inp--num" value="' + esc(c.price) + '" data-ct="price" data-ci="' + i + '" /></td>' +
        "<td>" + esc(c.feeType) + "</td>" +
        '<td><input type="number" step="0.01" min="0" class="inp inp--num" value="' + esc(c.fee) + '" data-ct="fee" data-ci="' + i + '" /></td>' +
        "</tr>"
      );
    }).join("");
    return (
      '<div class="crafttbl">' +
      '<table class="tbl tbl--craft">' +
      "<thead><tr><th>工艺名称</th><th>计费方式</th><th>单价(元)</th><th>固定费类型</th><th>固定费(元)</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table>" +
      '<p class="muted small">修改单价 / 固定费后，报价预览与导出 Excel 的 XLOOKUP 将实时联动。</p>' +
      "</div>"
    );
  }

  /* ---------- 操作面板 ---------- */
  function renderPanelHTML(state) {
    var m = state.meta;
    var prods = state.products.map(function (p) { return renderProduct(state, p); }).join("");
    return (
      '<div class="panel-section">' +
      '<div class="panel-section__title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>单据信息</div>' +
      '<div class="form-grid">' +
      '<label class="fld fld--full"><span>客户名称</span><input class="inp" id="meta-customer" value="' + esc(m.customer) + '" placeholder="请输入客户名称" /></label>' +
      '<label class="fld"><span>报价日期</span><input type="date" class="inp" id="meta-date" value="' + esc(m.date) + '" /></label>' +
      '<label class="fld"><span>报价单号</span><input class="inp" id="meta-no" value="' + esc(m.no) + '" /></label>' +
      '<label class="fld fld--full"><span>备注</span><input class="inp" id="meta-remark" value="' + esc(m.remark) + '" placeholder="选填" /></label>' +
      "</div></div>" +

      '<div class="panel-section">' +
      '<div class="panel-section__title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18v18H3z"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>产品工艺费用表 <span class="muted small">（可编辑）</span></div>' +
      renderCraftTable(state) +
      "</div>" +

      '<div class="panel-section">' +
      '<div class="panel-section__title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/></svg>商品配置</div>' +
      '<div id="products-wrap">' + prods + "</div>" +
      '<button class="btn btn--primary btn--block" data-action="add-prod">+ 添加商品</button>' +
      "</div>"
    );
  }

  /* ---------- 预览：项目描述 ---------- */
  function itemSpec(mp) {
    if (mp.type === "liner") {
      if (mp.linerMode === "custom") return esc(mp.material) + " / " + esc(mp.color);
      return esc(mp.material) + " " + esc(mp.count) + "×" + esc(mp.thing) + " / " + esc(mp.color);
    }
    return esc(mp.model) + " / " + esc(mp.color);
  }
  function accSpec(acc) {
    if (acc.type === "generic") return esc(acc.count) + "×" + esc(acc.thing) + " / " + esc(acc.color);
    if (acc.type === "bubble") return "一次性费用（单价只收取一次）";
    return esc(acc.material);
  }

  /* ---------- 预览：单个商品 ---------- */
  function previewProduct(state, prod) {
    var r = C.calcProduct(state, prod);
    var rows = "";

    prod.mainParts.forEach(function (mp) {
      var def = D.MAIN_PART_TYPES[mp.type];
      rows += "<tr class='row-main'>" +
        "<td>主件 · " + esc(mp.label) + "</td>" +
        "<td>" + itemSpec(mp) + "</td>" +
        "<td class='num'>" + D.money(mp.price) + "</td>" +
        "<td class='num'>" + D.num(mp.qty) + "</td>" +
        "<td class='num'>" + D.money(C.mainPartAmount(mp)) + "</td></tr>";
      mp.crafts.forEach(function (cr) {
        var fee = C.craftRowFee(state, mp, cr);
        var isPiece = cr._def && cr._def.unit === "piece";
        var faceLabel = isPiece ? "1 个" : (cr.faces + " 面");
        var unitLabel = isPiece ? "个" : "面";
        rows += "<tr class='row-craft'>" +
          "<td>　· 工艺 " + esc(cr.craft) + "</td>" +
          "<td>" + faceLabel + " × " + D.money(cr._def ? cr._def.price : 0) + "/" + unitLabel +
          " × " + D.num(mp.qty) + " 数量 + " + D.money(cr._def ? cr._def.fee : 0) + "</td>" +
          "<td></td><td></td>" +
          "<td class='num'>" + D.money(fee) + "</td></tr>";
      });
    });

    prod.accessories.forEach(function (acc) {
      var def = D.ACCESSORY_TYPES[acc.type];
      rows += "<tr class='row-acc'>" +
        "<td>配件 · " + esc(acc.label) + "</td>" +
        "<td>" + accSpec(acc) + "</td>" +
        "<td class='num'>" + D.money(acc.price) + "</td>" +
        "<td class='num'>" + D.num(acc.qty) + "</td>" +
        "<td class='num'>" + D.money(C.accessoryAmount(acc)) + "</td></tr>";
      acc.crafts.forEach(function (cr) {
        var fee = C.craftRowFee(state, acc, cr);
        rows += "<tr class='row-craft'>" +
          "<td>　· 工艺 " + esc(cr.craft) + "</td>" +
          "<td>" + cr.faces + " 面 × " + D.money(cr._def ? cr._def.price : 0) + "/面 × " + D.num(acc.qty) + " 数量 + " + D.money(cr._def ? cr._def.fee : 0) + "</td>" +
          "<td></td><td></td>" +
          "<td class='num'>" + D.money(fee) + "</td></tr>";
      });
    });

    return (
      '<section class="doc-prod">' +
      '<h3 class="doc-prod__title"><span>商品 ' + esc(prod.label) + '</span><span class="amt">' + D.money(r.amount) + "</span></h3>" +
      '<table class="doc-tbl"><thead><tr><th>项目</th><th>规格 / 工艺</th><th class="num">单价(元)</th><th class="num">数量</th><th class="num">金额(元)</th></tr></thead>' +
      "<tbody>" + rows + "</tbody>" +
      '<tfoot><tr><td colspan="4">商品金额</td><td class="num">' + D.money(r.amount) + "</td></tr></tfoot>" +
      "</table></section>"
    );
  }

  /* ---------- 预览：整体 ---------- */
  function renderPreviewHTML(state) {
    var m = state.meta;
    var prodHtml = state.products.map(function (p) { return previewProduct(state, p); }).join("");
    var grand = C.calcGrand(state);
    var metaLine = [];
    if (m.customer) metaLine.push("<span><b>客户</b> " + esc(m.customer) + "</span>");
    if (m.date) metaLine.push("<span><b>日期</b> " + esc(m.date) + "</span>");
    if (m.no) metaLine.push("<span><b>单号</b> " + esc(m.no) + "</span>");
    return (
      '<div class="doc">' +
      '<div class="doc__band"></div>' +
      '<div class="doc__head"><h1>报 价 单</h1>' +
      (metaLine.length ? '<div class="doc__meta">' + metaLine.join("") + "</div>" : "") +
      (m.remark ? '<div class="doc__remark">备注：' + esc(m.remark) + "</div>" : "") +
      "</div>" +
      '<div class="doc__body">' + prodHtml + "</div>" +
      '<div class="doc__total">总金额（人民币）：<span id="preview-total">¥ ' + D.money(grand) + "</span></div>" +
      '<div class="doc__foot">' +
      '<div class="doc__sign">' +
      "<span>客户确认：____________</span>" +
      "<span>经办人：____________</span>" +
      "<span>日期：____ 年 __ 月 __ 日</span>" +
      "</div>" +
      '<div class="doc__stamp">报价<br>专用章</div>' +
      '<div class="doc__footnote">本报价单由报价系统 v1.0 生成 · 工艺费用已通过 XLOOKUP 关联「产品工艺费用表」，修改费用表将自动重算</div>' +
      "</div>" +
      "</div>"
    );
  }

  global.QB.ui = {
    esc: esc,
    renderPanelHTML: renderPanelHTML,
    renderPreviewHTML: renderPreviewHTML
  };
})(window);
