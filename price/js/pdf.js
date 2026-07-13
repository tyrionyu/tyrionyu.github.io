/* pdf.js — 导出报价单 PDF（jsPDF，本地 lib/jspdf.umd.min.js） */
(function (global) {
  "use strict";
  var QB = global.QB;
  var D = QB.data, C = QB.calc;

  function itemSpec(mp) {
    if (mp.type === "liner") return mp.material + " / " + mp.color;
    return mp.model + " / " + mp.color;
  }
  function accSpec(acc) {
    if (acc.type === "generic") return acc.count + "×" + acc.thing + " / " + acc.color;
    if (acc.type === "bubble") return "一次性费用（单价只收一次）";
    return acc.material;
  }

  function exportPDF(state) {
    var J = global.jspdf;
    if (!J || !J.jsPDF) { alert("PDF 组件未加载"); return; }
    var doc = new J.jsPDF({ unit: "pt", format: "a4" });
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var left = 40, right = pageW - 40;
    var rowH = 18;

    // 列定义
    var cols = [
      { label: "商品", x: 40, w: 44, align: "left" },
      { label: "项目", x: 84, w: 86, align: "left" },
      { label: "规格 / 工艺", x: 170, w: 200, align: "left" },
      { label: "单价(元)", x: 370, w: 60, align: "right" },
      { label: "数量", x: 430, w: 48, align: "right" },
      { label: "金额(元)", x: 478, w: 67, align: "right" }
    ];

    var m = state.meta;
    // 标题
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("报 价 单", pageW / 2, 42, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60);
    var metaLine = [];
    if (m.customer) metaLine.push("客户：" + m.customer);
    if (m.date) metaLine.push("日期：" + m.date);
    if (m.no) metaLine.push("单号：" + m.no);
    doc.text(metaLine.join("    "), left, 64);
    if (m.remark) doc.text("备注：" + m.remark, left, 78);

    var cy = 96;

    function headerRow() {
      doc.setFillColor(37, 99, 235);
      doc.rect(left, cy, right - left, rowH, "F");
      doc.setTextColor(255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      cols.forEach(function (c) {
        doc.text(c.label, c.x, cy + 12.5, { align: c.align, maxWidth: c.w });
      });
      cy += rowH;
      doc.setFont("helvetica", "normal");
    }

    function line() {
      doc.setDrawColor(220);
      doc.line(left, cy, right, cy);
    }

    function ensureSpace() {
      if (cy + rowH > pageH - 40) {
        doc.addPage();
        cy = 50;
        headerRow();
      }
    }

    function dataRow(vals, opts) {
      opts = opts || {};
      ensureSpace();
      doc.setTextColor(opts.bold ? 20 : 40);
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      doc.setFontSize(9);
      cols.forEach(function (c, i) {
        var t = vals[i] == null ? "" : String(vals[i]);
        doc.text(t, c.x, cy + 12.5, { align: c.align, maxWidth: c.w });
      });
      cy += rowH;
      line();
      doc.setFont("helvetica", "normal");
    }

    headerRow();

    state.products.forEach(function (p) {
      p.mainParts.forEach(function (mp) {
        dataRow([
          p.label, "主件·" + mp.label, itemSpec(mp),
          D.money(mp.price), D.num(mp.qty), D.money(C.mainPartAmount(mp))
        ]);
        mp.crafts.forEach(function (cr) {
          var def = C.getCraftDef(state, cr.craft);
          var isPiece = def && def.unit === "piece";
          var faces = isPiece ? 1 : D.num(cr.faces);
          var unit = isPiece ? "个" : "面";
          dataRow([
            "", "　· 工艺 " + cr.craft, faces + " " + unit + " × " + D.money(def ? def.price : 0) + "/" + unit + " × " + D.num(mp.qty) + " 数量 + " + D.money(def ? def.fee : 0),
            "", "", D.money(C.craftRowFee(state, mp, cr))
          ]);
        });
      });
      p.accessories.forEach(function (acc) {
        dataRow([
          p.label, "配件·" + acc.label, accSpec(acc),
          D.money(acc.price), D.num(acc.qty), D.money(C.accessoryAmount(acc))
        ]);
        acc.crafts.forEach(function (cr) {
          dataRow([
            "", "　· 工艺 " + cr.craft, cr.faces + " 面 × " + D.money(cr._def ? cr._def.price : 0) + "/面 × " + D.num(acc.qty) + " 数量 + " + D.money(cr._def ? cr._def.fee : 0),
            "", "", D.money(C.craftRowFee(state, acc, cr))
          ]);
        });
      });
      var r = C.calcProduct(state, p);
      dataRow(["", "商品 " + p.label + " 金额", "", "", "", D.money(r.amount)], { bold: true });
    });

    var grand = C.calcGrand(state);
    ensureSpace();
    doc.setFillColor(245, 247, 250);
    doc.rect(left, cy, right - left, rowH + 4, "F");
    doc.setTextColor(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("总金额（人民币）", left + 6, cy + 15);
    doc.text("¥ " + D.money(grand), right - 6, cy + 15, { align: "right" });
    cy += rowH + 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("由报价系统 v1.0 生成 · 工艺费用取自「产品工艺费用表」", left, pageH - 24);

    var fname = "报价单_" + (m.no || "export") + ".pdf";
    doc.save(fname);
  }

  global.QB.pdf = { export: exportPDF };
})(window);
