/**
 * 待办事项管理 - 方案 A（档2：Supabase 云端 + 邮箱登录、仅自己可见）
 *
 * 数据层：原 localStorage 改为 Supabase 表的增删改查。
 * 安全：anon key 公开无害，RLS 规则限制"只能读写自己 user_id 的行"。
 */
(function () {
  "use strict";

  /* =========================================================
   * 配置：把下面的两行替换成你的 Supabase 项目信息
   *   - Project URL：Project Settings -> API -> Project URL
   *   - anon key：    Project Settings -> API -> anon public key
   * 这两项是公开密钥，可放心写在前端。绝不要放 service_role key。
   * ========================================================= */
  var SUPABASE_URL = "https://fjkayrhanizrcbvbeswx.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqa2F5cmhhbml6cmNidmJlc3d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNTgzNzMsImV4cCI6MjEwMDYzNDM3M30.XPgO8Ztx0g8irSarZlTEYMnuhno2YXm1l2243-GeEzM";
  /* ========================================================= */

  var PREFS_KEY = "todolist.prefs"; // 仅本地保存 筛选/排序 偏好

  var PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };
  var PRIORITY_LABEL = { high: "高", medium: "中", low: "低" };

  var state = {
    tasks: [],
    filter: "all",
    sortBy: "priority",
    editingId: null,
    user: null
  };

  var sb = null;

  var els = {};

  function cacheDom() {
    els.loginView = document.getElementById("loginView");
    els.mainView = document.getElementById("mainView");
    els.authEmail = document.getElementById("authEmail");
    els.authPassword = document.getElementById("authPassword");
    els.loginBtn = document.getElementById("loginBtn");
    els.signupBtn = document.getElementById("signupBtn");
    els.authMsg = document.getElementById("authMsg");
    els.userEmail = document.getElementById("userEmail");
    els.logoutBtn = document.getElementById("logoutBtn");

    els.form = document.getElementById("taskForm");
    els.titleInput = document.getElementById("titleInput");
    els.priorityInput = document.getElementById("priorityInput");
    els.dueDateInput = document.getElementById("dueDateInput");
    els.submitBtn = document.getElementById("submitBtn");
    els.cancelEditBtn = document.getElementById("cancelEditBtn");
    els.sortSelect = document.getElementById("sortSelect");
    els.taskList = document.getElementById("taskList");
    els.emptyState = document.getElementById("emptyState");
    els.summaryText = document.getElementById("summaryText");
    els.tabs = document.querySelectorAll(".tab");
    els.countAll = document.getElementById("countAll");
    els.countActive = document.getElementById("countActive");
    els.countCompleted = document.getElementById("countCompleted");
  }

  /* ---------- 工具 ---------- */
  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "t_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function isOverdue(task) {
    return !task.completed && task.dueDate && task.dueDate < todayStr();
  }

  function formatDate(iso) {
    var parts = iso.split("-");
    return Number(parts[1]) + "月" + Number(parts[2]) + "日";
  }

  /* ---------- 本地偏好（筛选/排序） ---------- */
  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        filter: state.filter,
        sortBy: state.sortBy
      }));
    } catch (e) { /* 忽略 */ }
  }

  function loadPrefs() {
    try {
      var raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      var prefs = JSON.parse(raw);
      if (["all", "active", "completed"].indexOf(prefs.filter) !== -1) state.filter = prefs.filter;
      if (["priority", "date"].indexOf(prefs.sortBy) !== -1) state.sortBy = prefs.sortBy;
    } catch (e) { /* 忽略 */ }
  }

  /* ---------- 字段映射（前端 <-> 数据库） ---------- */
  function rowToTask(row) {
    return {
      id: row.id,
      title: row.title,
      priority: row.priority,
      dueDate: row.due_date || "",
      completed: row.completed,
      createdAt: row.created_at || Date.now()
    };
  }

  function taskToRow(task) {
    return {
      id: task.id,
      title: task.title,
      priority: task.priority,
      due_date: task.dueDate || null,
      completed: task.completed,
      created_at: task.createdAt,
      user_id: state.user.id
    };
  }

  /* ---------- 视图计算 + 渲染 ---------- */
  function getVisibleTasks() {
    var filtered = state.tasks.filter(function (t) {
      if (state.filter === "active") return !t.completed;
      if (state.filter === "completed") return t.completed;
      return true;
    });

    return filtered.slice().sort(function (a, b) {
      var cmp = 0;
      if (state.sortBy === "priority") {
        cmp = (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
      } else {
        if (a.dueDate && b.dueDate) {
          cmp = a.dueDate < b.dueDate ? -1 : (a.dueDate > b.dueDate ? 1 : 0);
        } else if (a.dueDate) {
          cmp = -1;
        } else if (b.dueDate) {
          cmp = 1;
        }
      }
      if (cmp !== 0) return cmp;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  function buildTaskItem(task) {
    var li = document.createElement("li");
    li.className = "task-item priority-" + task.priority;
    if (task.completed) li.classList.add("completed");
    if (isOverdue(task)) li.classList.add("overdue");
    li.dataset.id = task.id;

    var metaHtml = '<span class="priority-tag ' + task.priority + '">' +
      PRIORITY_LABEL[task.priority] + "优先级</span>";

    if (task.dueDate) {
      metaHtml += '<span class="due-date">截止 ' + formatDate(task.dueDate) + "</span>";
    }
    if (isOverdue(task)) {
      metaHtml += '<span class="overdue-tag">已逾期</span>';
    }

    li.innerHTML =
      '<button class="task-checkbox" data-action="toggle" aria-label="切换完成状态">' +
        '<svg viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      "</button>" +
      '<div class="task-body">' +
        '<div class="task-title">' + escapeHtml(task.title) + "</div>" +
        '<div class="task-meta">' + metaHtml + "</div>" +
      "</div>" +
      '<div class="task-actions">' +
        '<button class="icon-btn" data-action="edit" aria-label="编辑任务">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>' +
        "</button>" +
        '<button class="icon-btn delete" data-action="delete" aria-label="删除任务">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>' +
        "</button>" +
      "</div>";

    return li;
  }

  function render() {
    var total = state.tasks.length;
    var completedCount = state.tasks.filter(function (t) { return t.completed; }).length;
    var activeCount = total - completedCount;

    els.countAll.textContent = total;
    els.countActive.textContent = activeCount;
    els.countCompleted.textContent = completedCount;
    els.summaryText.textContent = "共 " + total + " 项任务，已完成 " + completedCount + " 项";

    els.tabs.forEach(function (tab) {
      tab.classList.toggle("active", tab.dataset.filter === state.filter);
    });
    els.sortSelect.value = state.sortBy;

    if (state.user) els.userEmail.textContent = state.user.email || "";

    var visible = getVisibleTasks();
    els.taskList.innerHTML = "";
    visible.forEach(function (task) {
      els.taskList.appendChild(buildTaskItem(task));
    });

    var showEmpty = visible.length === 0;
    els.emptyState.classList.toggle("hidden", !showEmpty);
    if (showEmpty) {
      var p = els.emptyState.querySelector("p");
      var hint = els.emptyState.querySelector(".empty-hint");
      if (state.filter === "all") {
        p.textContent = "暂无任务";
        hint.textContent = "在上方输入标题，添加你的第一项待办";
      } else if (state.filter === "active") {
        p.textContent = "没有未完成的任务";
        hint.textContent = "所有任务都已完成";
      } else {
        p.textContent = "没有已完成的任务";
        hint.textContent = "勾选任务前的方框即可标记完成";
      }
    }
  }

  /* ---------- 视图切换 ---------- */
  function showApp() {
    els.loginView.classList.add("hidden");
    els.mainView.classList.remove("hidden");
  }

  function showLogin() {
    els.mainView.classList.add("hidden");
    els.loginView.classList.remove("hidden");
  }

  /* ---------- 云端数据操作 ---------- */
  async function loadTasks() {
    try {
      var res = await sb.from("tasks").select("*").order("created_at", { ascending: true });
      if (res.error) throw res.error;
      state.tasks = (res.data || []).map(rowToTask);
      render();
    } catch (e) {
      console.error("加载失败:", e);
      alert("任务加载失败：" + (e.message || e));
    }
  }

  async function addTask(title, priority, dueDate) {
    var task = {
      id: generateId(),
      title: title,
      priority: priority,
      dueDate: dueDate || "",
      completed: false,
      createdAt: Date.now()
    };
    try {
      var res = await sb.from("tasks").insert(taskToRow(task));
      if (res.error) throw res.error;
      state.tasks.push(task);
      render();
    } catch (e) {
      console.error("添加失败:", e);
      alert("添加失败：" + (e.message || e));
    }
  }

  async function updateTask(id, title, priority, dueDate) {
    var task = state.tasks.find(function (t) { return t.id === id; });
    if (!task) return;
    task.title = title;
    task.priority = priority;
    task.dueDate = dueDate || "";
    try {
      var res = await sb.from("tasks")
        .update({ title: task.title, priority: task.priority, due_date: task.dueDate || null })
        .eq("id", id);
      if (res.error) throw res.error;
      render();
    } catch (e) {
      console.error("保存失败:", e);
      alert("保存失败：" + (e.message || e));
    }
  }

  async function toggleTask(id) {
    var task = state.tasks.find(function (t) { return t.id === id; });
    if (!task) return;
    var newVal = !task.completed;
    task.completed = newVal;
    try {
      var res = await sb.from("tasks").update({ completed: newVal }).eq("id", id);
      if (res.error) throw res.error;
      render();
    } catch (e) {
      task.completed = !newVal;
      render();
      console.error("操作失败:", e);
      alert("操作失败：" + (e.message || e));
    }
  }

  async function deleteTask(id) {
    var task = state.tasks.find(function (t) { return t.id === id; });
    if (!task) return;
    if (!window.confirm("确定删除任务「" + task.title + "」吗？")) return;
    try {
      var res = await sb.from("tasks").delete().eq("id", id);
      if (res.error) throw res.error;
      state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
      if (state.editingId === id) resetForm();
      render();
    } catch (e) {
      console.error("删除失败:", e);
      alert("删除失败：" + (e.message || e));
    }
  }

  /* ---------- 表单模式 ---------- */
  function resetForm() {
    els.form.reset();
    els.priorityInput.value = "medium";
    els.submitBtn.textContent = "添加任务";
    els.cancelEditBtn.classList.add("hidden");
    state.editingId = null;
  }

  function enterEditMode(task) {
    state.editingId = task.id;
    els.titleInput.value = task.title;
    els.priorityInput.value = task.priority;
    els.dueDateInput.value = task.dueDate || "";
    els.submitBtn.textContent = "保存修改";
    els.cancelEditBtn.classList.remove("hidden");
    els.titleInput.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- 事件绑定 ---------- */
  function bindAuth() {
    els.loginBtn.addEventListener("click", function () {
      var email = els.authEmail.value.trim();
      var password = els.authPassword.value;
      if (!email || !password) { els.authMsg.textContent = "请填写邮箱和密码"; return; }
      els.authMsg.textContent = "登录中…";
      sb.auth.signInWithPassword({ email: email, password: password })
        .then(function (res) {
          if (res.error) throw res.error;
          els.authMsg.textContent = "";
        })
        .catch(function (e) {
          els.authMsg.textContent = "登录失败：" + (e.message || e);
        });
    });

    els.signupBtn.addEventListener("click", function () {
      var email = els.authEmail.value.trim();
      var password = els.authPassword.value;
      if (!email || !password) { els.authMsg.textContent = "请填写邮箱和密码"; return; }
      els.authMsg.textContent = "注册中…";
      sb.auth.signUp({ email: email, password: password })
        .then(function (res) {
          if (res.error) throw res.error;
          if (res.data.session) {
            els.authMsg.textContent = "";
          } else {
            els.authMsg.textContent = "注册成功，请查收确认邮件后登录（或在 Supabase 关闭邮箱确认）。";
          }
        })
        .catch(function (e) {
          els.authMsg.textContent = "注册失败：" + (e.message || e);
        });
    });

    els.logoutBtn.addEventListener("click", function () {
      sb.auth.signOut();
    });
  }

  function bindEvents() {
    els.form.addEventListener("submit", function (e) {
      e.preventDefault();
      var title = els.titleInput.value.trim();
      if (!title) { els.titleInput.focus(); return; }
      var priority = els.priorityInput.value;
      var dueDate = els.dueDateInput.value;

      if (state.editingId) {
        updateTask(state.editingId, title, priority, dueDate);
      } else {
        addTask(title, priority, dueDate);
      }
      resetForm();
      els.titleInput.focus();
    });

    els.cancelEditBtn.addEventListener("click", function () {
      resetForm();
    });

    els.taskList.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]");
      if (!btn) return;
      var item = e.target.closest(".task-item");
      if (!item) return;
      var id = item.dataset.id;
      var action = btn.dataset.action;

      if (action === "toggle") {
        toggleTask(id);
      } else if (action === "delete") {
        deleteTask(id);
      } else if (action === "edit") {
        var task = state.tasks.find(function (t) { return t.id === id; });
        if (task) enterEditMode(task);
      }
    });

    els.tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        state.filter = tab.dataset.filter;
        savePrefs();
        render();
      });
    });

    els.sortSelect.addEventListener("change", function () {
      state.sortBy = els.sortSelect.value;
      savePrefs();
      render();
    });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    cacheDom();
    loadPrefs();

    // 配置占位检查，避免无意义的报错
    if (
      !SUPABASE_URL || SUPABASE_URL.indexOf("在此") !== -1 ||
      !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.indexOf("在此") !== -1
    ) {
      showLogin();
      els.authMsg.textContent = "尚未配置：请在 app.js 顶部填入 Supabase 的 Project URL 和 anon key。";
      return;
    }

    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    sb.auth.onAuthStateChange(function (event, session) {
      if (session && session.user) {
        state.user = session.user;
        showApp();
        loadTasks();
      } else {
        state.user = null;
        showLogin();
      }
    });

    bindAuth();
    bindEvents();

    // 处理已存在的会话
    sb.auth.getUser().then(function (res) {
      if (!res.data.user) showLogin();
    });
  }

  init();
})();
