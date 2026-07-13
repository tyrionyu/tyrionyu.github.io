/* data.js — 默认数据、可选项、工厂函数与格式化工具
 * 所有金额单位为「元」，保留两位小数展示。
 */
(function (global) {
  "use strict";

  /* ---------- 产品工艺费用表（XLOOKUP 数据源） ---------- */
  // unit: "face" = 每面（乘数=定制面数）；"piece" = 每个（乘数=下单数量）
  var CRAFT_FEE_DEFAULT = [
    { name: "彩印",   unit: "face", price: 2,   feeType: "上机费", fee: 60 },
    { name: "丝印",   unit: "face", price: 0.5, feeType: "上机费", fee: 100 },
    { name: "冷烫",   unit: "face", price: 0.5, feeType: "版费",   fee: 100 },
    { name: "烫金",   unit: "face", price: 3,   feeType: "板费",   fee: 300 },
    { name: "定制内衬", unit: "piece", price: 1, feeType: "板费",   fee: 100 }
  ];

  /* ---------- 主件可选项 ---------- */
  var MAIN_PART_TYPES = {
    handbag: {
      type: "handbag", label: "手提袋",
      // 配置字段：型号 + 颜色
      fields: [
        { key: "model", label: "型号", options: ["9009", "9217", "9507", "8516", "其它"] },
        { key: "color", label: "颜色", options: ["红色", "绿色", "咖色", "米白色", "黑色", "金色", "其它"] }
      ],
      // 可定制工艺（面数 1/2）
      craftable: true, faceCraft: true,
      defaultPrice: 5.0
    },
    box: {
      type: "box", label: "包装",
      fields: [
        { key: "model", label: "型号", options: ["9009", "9217", "9507", "8516", "其它"] },
        { key: "color", label: "产品颜色", options: ["红色", "绿色", "咖色", "米白色", "黑色", "金色", "其它"] }
      ],
      craftable: true, faceCraft: true,
      defaultPrice: 8.0
    },
    liner: {
      type: "liner", label: "内衬",
      // 默认内衬字段：材质 + 几个 + 颜色 + 东西
      fields: [
        { key: "material", label: "材质", options: ["珍珠棉", "灰板", "卡纸", "EVA", "其它"] },
        { key: "count", label: "几个", options: ["1", "3", "6", "9", "12", "其它"] },
        { key: "color", label: "颜色", options: ["白色", "黑色", "金色", "红色", "绿色", "其它"] },
        { key: "thing", label: "东西", options: ["泡袋", "茶饼", "马口罐", "易拉罐", "螺纹罐", "陶瓷罐", "大方罐", "小方罐", "小青柑", "其它"] }
      ],
      // 定制内衬字段：材质 + 颜色（工艺走「定制内衬」按个计费）
      customFields: [
        { key: "material", label: "材质", options: ["珍珠棉", "灰板", "卡纸", "EVA", "其它"] },
        { key: "color", label: "颜色", options: ["白色", "黑色", "金色", "红色", "绿色", "其它"] }
      ],
      craftable: true, faceCraft: false, fixedCraft: "定制内衬",
      defaultPrice: 3.0,
      modes: true
    }
  };

  /* ---------- 配件可选项 ---------- */
  var ACCESSORY_TYPES = {
    generic: {
      type: "generic", label: "通用配件",
      fields: [
        { key: "count", label: "数量", options: ["1", "3", "6", "9", "12", "其它"] },
        { key: "thing", label: "东西", options: ["泡袋", "茶饼", "马口罐", "易拉罐", "螺纹罐", "陶瓷罐", "大方罐", "小方罐", "小青柑", "其它"] },
        { key: "color", label: "颜色", options: ["金色", "绿色", "白色", "黑色", "红色", "其它"] }
      ],
      craftable: false,
      defaultPrice: 1.0,
      defaultQty: 1
    },
    flyleaf: {
      type: "flyleaf", label: "扉页",
      fields: [
        { key: "material", label: "材质", options: ["稻香纸", "硫酸纸", "其它"] }
      ],
      craftable: true, faceCraft: true,
      defaultPrice: 0.5,
      defaultQty: 1
    },
    sticker: {
      type: "sticker", label: "不干胶",
      fields: [
        { key: "material", label: "材质", options: ["书写纸", "艾利纸", "大地纸", "红色洒金纸", "其它"] }
      ],
      craftable: true, faceCraft: true,
      defaultPrice: 0.3,
      defaultQty: 1
    },
    bubble: {
      type: "bubble", label: "泡袋",
      fields: [],
      craftable: false,
      defaultPrice: 0.3,
      defaultQty: 1,
      oneTime: true
    }
  };

  /* ---------- 工厂函数 ---------- */
  var _seq = 1;
  function uid(prefix) { return (prefix || "id") + "_" + (Date.now().toString(36)) + "_" + (_seq++); }

  function defaultCraftTable() {
    return CRAFT_FEE_DEFAULT.map(function (c) {
      return { name: c.name, unit: c.unit, price: c.price, feeType: c.feeType, fee: c.fee };
    });
  }

  // 创建一条定制工艺行
  function makeCraft(def) {
    var faceCraft = def ? def.faceCraft : true;
    return {
      id: uid("craft"),
      // 内衬固定为「定制内衬」，其它可选四种面工艺
      craft: def && def.fixedCraft ? def.fixedCraft : "彩印",
      faces: faceCraft ? 1 : 1 // 定制内衬也用 faces 字段，语义为「个」
    };
  }

  function makeMainPart(typeKey) {
    var def = MAIN_PART_TYPES[typeKey] || MAIN_PART_TYPES.handbag;
    var part = {
      id: uid("mp"),
      kind: "main",
      type: def.type,
      label: def.label,
      price: def.defaultPrice,
      qty: 100,
      crafts: []
    };
    if (def.type === "liner") {
      // 内衬默认模式：材质 + 几个 + 颜色 + 东西；默认不带工艺
      part.linerMode = "default";
      part.material = def.fields[0].options[0];
      part.count = "1";
      part.color = def.fields[2].options[0];
      part.thing = def.fields[3].options[0];
    } else {
      part.model = def.fields[0].options[0];
      part.color = def.fields[1] ? def.fields[1].options[0] : "";
      // 手提袋/包装 默认不带工艺，由用户自行添加
    }
    return part;
  }

  function makeAccessory(typeKey) {
    var def = ACCESSORY_TYPES[typeKey] || ACCESSORY_TYPES.generic;
    var acc = {
      id: uid("acc"),
      kind: "accessory",
      type: def.type,
      label: def.label,
      price: def.defaultPrice,
      qty: def.defaultQty || 1,
      crafts: []
    };
    def.fields.forEach(function (f) {
      if (f.key === "count") acc.count = f.options[0];
      else if (f.key === "thing") acc.thing = f.options[0];
      else if (f.key === "color") acc.color = f.options[0];
      else if (f.key === "material") acc.material = f.options[0];
    });
    return acc;
  }

  function makeProduct(label) {
    var product = {
      id: uid("prod"),
      label: label || "A",
      mainParts: [ makeMainPart("handbag"), makeMainPart("box"), makeMainPart("liner") ],
      accessories: [ makeAccessory("generic"), makeAccessory("flyleaf"), makeAccessory("sticker"), makeAccessory("bubble") ]
    };
    return product;
  }

  function defaultState() {
    var d = new Date();
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return {
      meta: {
        customer: "",
        date: yyyy + "-" + mm + "-" + dd,
        no: "Q-" + yyyy + mm + dd + "-001",
        remark: ""
      },
      craftTable: defaultCraftTable(),
      products: [ makeProduct("A") ]
    };
  }

  /* ---------- 格式化 ---------- */
  function money(n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    // 最多两位小数，去除多余 0
    return v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function num(n) {
    var v = Number(n);
    return isFinite(v) ? v : 0;
  }

  global.QB = global.QB || {};
  global.QB.data = {
    CRAFT_FEE_DEFAULT: CRAFT_FEE_DEFAULT,
    MAIN_PART_TYPES: MAIN_PART_TYPES,
    ACCESSORY_TYPES: ACCESSORY_TYPES,
    uid: uid,
    defaultCraftTable: defaultCraftTable,
    makeCraft: makeCraft,
    makeMainPart: makeMainPart,
    makeAccessory: makeAccessory,
    makeProduct: makeProduct,
    defaultState: defaultState,
    money: money,
    num: num
  };
})(window);
