/* calc.js — 金额计算逻辑
 * 规则：
 *   主件金额 = 主件单价 × 下单数量
 *   配件金额 = 配件单价 × 数量
 *   工艺费用 = 产品部位 × 定制面数 × 单价 × 数量 + 固定费用
 *           （每面工艺：面数因子=定制面数；定制内衬「每个」：面数因子=1，均再乘以该部位下单数量）
 *           固定费用只叠加一次，不随数量放大。
 *   商品金额 = 主件金额 + 工艺费用 + 配件金额
 *   总金额   = Σ 商品金额
 * 工艺单价 / 固定费用来自「产品工艺费用表」(state.craftTable)，即 XLOOKUP 数据源。
 */
(function (global) {
  "use strict";
  var QB = global.QB;

  function getCraftDef(state, name) {
    var t = state.craftTable || [];
    for (var i = 0; i < t.length; i++) if (t[i].name === name) return t[i];
    return null;
  }

  // 面数因子：每面工艺=定制面数；定制内衬「每个」=1（再统一乘以下单数量）
  function faceFactor(def, craftRow) {
    return def.unit === "piece" ? 1 : (QB.data.num(craftRow.faces) || 0);
  }

  // 计算单个 item（主件或配件）的工艺费用合计
  //   工艺费用 = 面数因子 × 单价 × 下单数量 + 固定费用
  function itemCraftFee(state, item) {
    var total = 0;
    var qty = QB.data.num(item.qty) || 0;
    for (var i = 0; i < item.crafts.length; i++) {
      var cr = item.crafts[i];
      var def = getCraftDef(state, cr.craft);
      if (!def) continue;
      cr._def = def;
      total += faceFactor(def, cr) * QB.data.num(def.price) * qty + QB.data.num(def.fee);
    }
    return total;
  }

  // 计算单条工艺费用（供明细展示）
  function craftRowFee(state, item, cr) {
    var def = getCraftDef(state, cr.craft);
    if (!def) return 0;
    cr._def = def;
    var qty = QB.data.num(item.qty) || 0;
    return faceFactor(def, cr) * QB.data.num(def.price) * qty + QB.data.num(def.fee);
  }

  function mainPartAmount(mp) {
    return QB.data.num(mp.price) * QB.data.num(mp.qty);
  }

  function accessoryAmount(acc) {
    var def = QB.data.ACCESSORY_TYPES[acc.type];
    // 一次性费用（如泡袋）：单价只收取一次，不乘数量
    if (def && def.oneTime) return QB.data.num(acc.price);
    return QB.data.num(acc.price) * QB.data.num(acc.qty);
  }

  // 计算一个商品
  function calcProduct(state, product) {
    var mainTotal = 0, craftTotal = 0, accTotal = 0;
    product.mainParts.forEach(function (mp) {
      mainTotal += mainPartAmount(mp);
      craftTotal += itemCraftFee(state, mp);
    });
    product.accessories.forEach(function (acc) {
      accTotal += accessoryAmount(acc);
      craftTotal += itemCraftFee(state, acc);
    });
    return {
      mainTotal: mainTotal,
      craftTotal: craftTotal,
      accTotal: accTotal,
      amount: mainTotal + craftTotal + accTotal
    };
  }

  function calcGrand(state) {
    var total = 0;
    (state.products || []).forEach(function (p) {
      total += calcProduct(state, p).amount;
    });
    return total;
  }

  global.QB.calc = {
    getCraftDef: getCraftDef,
    itemCraftFee: itemCraftFee,
    craftRowFee: craftRowFee,
    mainPartAmount: mainPartAmount,
    accessoryAmount: accessoryAmount,
    calcProduct: calcProduct,
    calcGrand: calcGrand
  };
})(window);
