/* excel.js — 导出 Excel(.xlsx)，工艺费用通过 XLOOKUP 关联「产品工艺费用表」工作表
 * 依赖：本地 lib/xlsx.full.min.js (SheetJS)
 */
(function (global) {
  "use strict";
  var QB = global.QB;
  var D = QB.data, C = QB.calc;

  function getCraftDef(state, name) {
    var t = state.craftTable || [];
    for (var i = 0; i < t.length; i++) if (t[i].name === name) return t[i];
    return null;
  }

  function itemSpec(mp) {
    if (mp.type === "liner") return mp.material + " / " + mp.color;
    return mp.model + " / " + mp.color;
  }
  function accSpec(acc) {
    if (acc.type === "generic") return acc.count + "×" + acc.thing + " / " + acc.color;
    return acc.material;
  }

  function exportExcel(state) {
    var XLSX = global.XLSX;
    if (!XLSX) { alert("Excel 组件未加载"); return; }

    var wb = XLSX.utils.book_new();

    /* ---------- 工作表1：产品工艺费用表（查找源） ---------- */
    var craftAoa = [["工艺名称", "计费方式", "单价", "固定费用类型", "固定费用"]];
    var n = state.craftTable.length;
    state.craftTable.forEach(function (c) {
      craftAoa.push([c.name, c.unit === "piece" ? "每个" : "每面", c.price, c.feeType, c.fee]);
    });
    var wsCraft = XLSX.utils.aoa_to_sheet(craftAoa);
    wsCraft["!cols"] = [
      { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }
    ];
    XLSX.utils.book_append_sheet(wb, wsCraft, "产品工艺费用表");

    var SHEET = "'产品工艺费用表'";
    var nameRange = SHEET + "!$A$2:$A$" + (n + 1);
    var priceRange = SHEET + "!$C$2:$C$" + (n + 1);
    var feeRange = SHEET + "!$E$2:$E$" + (n + 1);

    /* ---------- 工作表2：报价单 ---------- */
    var ws = {};
    function setCell(r, c, val) {
      var addr = XLSX.utils.encode_cell({ r: r - 1, c: c - 1 });
      if (val && typeof val === "object" && "f" in val) {
        ws[addr] = { t: "n", f: val.f, v: val.v != null ? val.v : 0 };
      } else if (typeof val === "number") {
        ws[addr] = { t: "n", v: val };
      } else {
        ws[addr] = { t: "s", v: String(val == null ? "" : val) };
      }
    }

    var m = state.meta;
    setCell(1, 1, "报 价 单");
    setCell(2, 1, "客户：" + (m.customer || "-"));
    setCell(2, 4, "日期：" + (m.date || "-"));
    setCell(2, 7, "单号：" + (m.no || "-"));
    if (m.remark) setCell(3, 1, "备注：" + m.remark);

    var headerR = 5;
    var header = ["商品", "项目", "名称 / 规格", "单价(元)", "数量", "金额(元)", "工艺", "面数/个", "工艺单价(查表)", "固定费(查表)", "工艺费用"];
    header.forEach(function (h, i) { setCell(headerR, i + 1, h); });

    var r = headerR + 1;
    var subTotals = [];

    state.products.forEach(function (p) {
      var startR = r;
      var prodAmount = 0;

      p.mainParts.forEach(function (mp) {
        var itemRow = r;
        setCell(r, 1, p.label);
        setCell(r, 2, "主件·" + mp.label);
        setCell(r, 3, itemSpec(mp));
        setCell(r, 4, mp.price);
        setCell(r, 5, mp.qty);
        setCell(r, 6, { f: "D" + r + "*E" + r, v: D.num(mp.price) * D.num(mp.qty) });
        mp.crafts.forEach(function (cr) {
          r++;
          var def = getCraftDef(state, cr.craft);
          var qty = D.num(mp.qty);
          // 面数因子：每面=定制面数；定制内衬「每个」=1
          var faces = def && def.unit === "piece" ? 1 : D.num(cr.faces);
          var unitPrice = def ? def.price : 0;
          var fixed = def ? def.fee : 0;
          setCell(r, 1, p.label);
          setCell(r, 2, "工艺");
          setCell(r, 3, cr.craft);
          setCell(r, 7, cr.craft);
          setCell(r, 8, faces);
          setCell(r, 9, { f: "XLOOKUP(G" + r + "," + nameRange + "," + priceRange + ")", v: unitPrice });
          setCell(r, 10, { f: "XLOOKUP(G" + r + "," + nameRange + "," + feeRange + ")", v: fixed });
          // 工艺费用 = 面数 × 工艺单价 × 数量(E{itemRow}) + 固定费
          setCell(r, 11, { f: "H" + r + "*I" + r + "*E" + itemRow + "+J" + r, v: faces * unitPrice * qty + fixed });
        });
        r++;
      });

      p.accessories.forEach(function (acc) {
        var itemRow = r;
        var isOneTime = D.ACCESSORY_TYPES[acc.type] && D.ACCESSORY_TYPES[acc.type].oneTime;
        setCell(r, 1, p.label);
        setCell(r, 2, "配件·" + acc.label);
        setCell(r, 3, accSpec(acc));
        setCell(r, 4, acc.price);
        setCell(r, 5, acc.qty);
        // 一次性费用（如泡袋）：金额 = 单价，不乘数量
        setCell(r, 6, isOneTime
          ? { f: "D" + r, v: D.num(acc.price) }
          : { f: "D" + r + "*E" + r, v: D.num(acc.price) * D.num(acc.qty) });
        acc.crafts.forEach(function (cr) {
          r++;
          var def = getCraftDef(state, cr.craft);
          var qty = D.num(acc.qty);
          var faces = def && def.unit === "piece" ? 1 : D.num(cr.faces);
          var unitPrice = def ? def.price : 0;
          var fixed = def ? def.fee : 0;
          setCell(r, 1, p.label);
          setCell(r, 2, "工艺");
          setCell(r, 3, cr.craft);
          setCell(r, 7, cr.craft);
          setCell(r, 8, faces);
          setCell(r, 9, { f: "XLOOKUP(G" + r + "," + nameRange + "," + priceRange + ")", v: unitPrice });
          setCell(r, 10, { f: "XLOOKUP(G" + r + "," + nameRange + "," + feeRange + ")", v: fixed });
          setCell(r, 11, { f: "H" + r + "*I" + r + "*E" + itemRow + "+J" + r, v: faces * unitPrice * qty + fixed });
        });
        r++;
      });

      // 商品金额小计
      var pr = C.calcProduct(state, p);
      setCell(r, 1, p.label);
      setCell(r, 2, "商品金额");
      setCell(r, 6, { f: "SUM(F" + startR + ":F" + (r - 1) + ")+SUM(K" + startR + ":K" + (r - 1) + ")", v: pr.amount });
      subTotals.push("F" + r);
      r++;
    });

    // 总金额
    var grand = C.calcGrand(state);
    setCell(r, 2, "总金额");
    setCell(r, 6, { f: "SUM(" + subTotals.join(",") + ")", v: grand });

    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: 10 } });
    ws["!cols"] = [
      { wch: 8 }, { wch: 12 }, { wch: 22 }, { wch: 10 }, { wch: 8 },
      { wch: 12 }, { wch: 10 }, { wch: 9 }, { wch: 13 }, { wch: 12 }, { wch: 11 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, "报价单");

    // 备注：公式单元格已写入缓存值，Excel 打开即显示正确金额；
    // 当用户在「产品工艺费用表」中修改单价/固定费时，XLOOKUP 依赖会自动重算。
    var fname = "报价单_" + (m.no || "export") + ".xlsx";
    XLSX.writeFile(wb, fname);
  }

  global.QB.excel = { export: exportExcel };
})(window);
