(function () {
  "use strict";

  // ================= constants & helpers =================
  var KEY = "money-plan-data";
  var PREFS = "money-plan-prefs";
  var CURS = ["EUR", "CZK"];
  var MAX_CATS = 8;
  var DEFAULT_RATE = 24.2;
  var DEFAULT_HOURS = 160;
  var UNITS = {
    day:   { one: "day",   many: "days",   f: function (n) { return 365 / 12 / n; } },
    week:  { one: "week",  many: "weeks",  f: function (n) { return 52 / 12 / n; } },
    month: { one: "month", many: "months", f: function (n) { return 1 / n; } },
    year:  { one: "year",  many: "years",  f: function (n) { return 1 / 12 / n; } }
  };
  var OLD_FREQ = { weekly: [1, "week"], monthly: [1, "month"], quarterly: [3, "month"], yearly: [1, "year"] };
  var ICON_WARN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5 15 14H1L8 1.5Zm-.8 4.5v4h1.6V6H7.2Zm0 5.2v1.6h1.6v-1.6H7.2Z"/></svg>';
  var ICON_OK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.4 11.6 2.8 8l1.1-1.1 2.5 2.5 5.7-5.7L13.2 4.8l-6.8 6.8Z"/></svg>';

  function $(id) { return document.getElementById(id); }
  function rid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3); }
  function num(v) { var n = parseFloat(String(v).replace(",", ".")); return isFinite(n) && n > 0 ? n : 0; }
  function str(v, max) { return typeof v === "string" ? v.slice(0, max || 80) : ""; }
  function curOk(c, fb) { return CURS.indexOf(c) > -1 ? c : fb; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isoDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function todayISO() { return isoDate(new Date()); }
  function monthOf(iso) { return iso.slice(0, 7); }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  // ================= data model =================
  function emptyPlan() {
    return { display: "EUR", rate: DEFAULT_RATE, hours: DEFAULT_HOURS, income: [], expenses: [], goal: { name: "Emergency fund", target: 0, saved: 0, cur: "EUR" } };
  }
  function normalizePlan(raw) {
    var p = raw && typeof raw === "object" ? raw : {};
    var display = curOk(p.display, curOk(p.currency, "EUR"));
    function line(r, isExpense) {
      r = r || {};
      var every = Math.max(1, Math.round(num(r.every)) || 1), unit = UNITS[r.unit] ? r.unit : "month";
      if (!r.unit && OLD_FREQ[r.freq]) { every = OLD_FREQ[r.freq][0]; unit = OLD_FREQ[r.freq][1]; }
      var o = { id: str(r.id, 24) || rid(), name: str(r.name), amount: num(r.amount), cur: curOk(r.cur, display), every: every, unit: unit };
      if (isExpense) { o.cat = str(r.cat, 40); o.need = r.need !== false; }
      return o;
    }
    var g = p.goal || {};
    return {
      display: display,
      rate: num(p.rate) || DEFAULT_RATE,
      hours: Math.round(num(p.hours)) || DEFAULT_HOURS,
      income: (Array.isArray(p.income) ? p.income : []).slice(0, 100).map(function (r) { return line(r, false); }),
      expenses: (Array.isArray(p.expenses) ? p.expenses : []).slice(0, 300).map(function (r) { return line(r, true); }),
      goal: { name: str(g.name), target: num(g.target), saved: num(g.saved), cur: curOk(g.cur, display) }
    };
  }
  function normalizeEntry(e) {
    e = e || {};
    return {
      id: str(e.id, 24) || rid(),
      date: /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : todayISO(),
      amount: num(e.amount),
      cur: curOk(e.cur, "CZK"),
      cat: str(e.cat, 40).trim() || "Other",
      note: str(e.note, 120),
      need: e.need !== false,
      createdAt: typeof e.createdAt === "string" ? e.createdAt : new Date().toISOString()
    };
  }
  function normalizeData(raw) {
    raw = raw && typeof raw === "object" ? raw : {};
    var s = raw.settings || {};
    return {
      v: 1,
      plan: normalizePlan(raw.plan),
      entries: (Array.isArray(raw.entries) ? raw.entries : []).slice(0, 50000).map(normalizeEntry).filter(function (e) { return e.amount > 0; }),
      settings: { entryCur: curOk(s.entryCur, "CZK") },
      lastBackup: typeof raw.lastBackup === "string" ? raw.lastBackup : null
    };
  }

  var data, plan, firstRun = false;
  (function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (raw) { try { data = normalizeData(JSON.parse(raw)); } catch (e) { data = null; } }
    if (!data) { data = normalizeData({ plan: emptyPlan() }); firstRun = true; }
    plan = data.plan;
  })();

  var persistAsked = false;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { toast("Couldn't save on this phone. Storage may be full."); return; }
    firstRun = false;
    if (!persistAsked && navigator.storage && navigator.storage.persist) {
      persistAsked = true;
      navigator.storage.persist().catch(function () {});
    }
  }
  function isEmpty() { return !plan.income.length && !plan.expenses.length && !data.entries.length; }

  var prefs = { view: "month", mode: "all" };
  try { var pr = JSON.parse(localStorage.getItem(PREFS) || "{}"); if (pr.view === "year") prefs.view = "year"; if (pr.mode === "free") prefs.mode = "free"; } catch (e) {}
  function savePrefs() { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch (e) {} }

  // ================= money =================
  function fmt(n, cur, digits) {
    cur = cur || plan.display;
    try { return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: cur, maximumFractionDigits: digits || 0, minimumFractionDigits: 0 }).format(n); }
    catch (e) { return Math.round(n) + " " + cur; }
  }
  function fmtHour(n) {
    var d = plan.display === "EUR" ? 2 : 0;
    try { return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: plan.display, maximumFractionDigits: d, minimumFractionDigits: d }).format(n); }
    catch (e) { return n.toFixed(d) + " " + plan.display; }
  }
  function conv(amount, from, to) {
    to = to || plan.display;
    if (from === to) return amount;
    return from === "EUR" ? amount * plan.rate : amount / plan.rate;
  }
  function monthlyOwn(r) { return num(r.amount) * UNITS[r.unit].f(Math.max(1, r.every || 1)); }
  function monthly(r) { return conv(monthlyOwn(r), r.cur); }
  function pct(a, b) { return b > 0 ? Math.round(a / b * 100) + " %" : ""; }
  function catName(c) { var t = (c || "").trim(); return t || "Uncategorized"; }
  function incomeMonthly() { return plan.income.reduce(function (s, r) { return s + monthly(r); }, 0); }
  function hourlyIncome() { return incomeMonthly() / Math.max(1, plan.hours || DEFAULT_HOURS); }
  function workTime(valueDisplay) {
    var h = hourlyIncome();
    if (!(h > 0) || !(valueDisplay > 0)) return "";
    var mins = Math.round(valueDisplay / h * 60);
    if (mins < 1) return "less than a minute of work";
    if (mins < 60) return mins + " min of work";
    var hh = Math.floor(mins / 60), mm = mins % 60;
    return hh + " h" + (mm ? " " + mm + " min" : "") + " of work";
  }

  // ================= categories =================
  function planCatOrder() {
    var seen = [];
    plan.expenses.forEach(function (r) { var c = catName(r.cat); if (seen.indexOf(c) === -1) seen.push(c); });
    return seen;
  }
  function allCatOrder() {
    var order = planCatOrder();
    data.entries.forEach(function (e) { if (order.indexOf(e.cat) === -1) order.push(e.cat); });
    return order;
  }
  function colorFor(cat, order) {
    var i = (order || planCatOrder()).indexOf(cat);
    return i > -1 && i < MAX_CATS ? "var(--s" + (i + 1) + ")" : "var(--muted)";
  }
  function catIsNeed(cat) {
    var lines = plan.expenses.filter(function (r) { return catName(r.cat) === cat; });
    if (!lines.length) {
      var past = data.entries.filter(function (e) { return e.cat === cat; });
      return past.length ? past[past.length - 1].need : true;
    }
    return lines.some(function (r) { return r.need; });
  }
  function catBudgets() {
    var b = {};
    plan.expenses.forEach(function (r) { var c = catName(r.cat); b[c] = (b[c] || 0) + monthly(r); });
    return b;
  }

  // ================= toast =================
  var toastTimer = null;
  function toast(text, actionLabel, action) {
    $("toast-text").textContent = text;
    var btn = $("toast-action");
    btn.hidden = !actionLabel;
    btn.textContent = actionLabel || "";
    btn.onclick = action ? function () { $("toast").hidden = true; action(); } : null;
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $("toast").hidden = true; }, actionLabel ? 10000 : 3500);
  }

  // ================= routing =================
  var TITLES = { month: "This month", plan: "Plan", more: "More" };
  var route = "month";
  function go() {
    var r = (location.hash || "#month").slice(1);
    if (r === "add") {
      history.replaceState(null, "", "#month");
      r = "month";
      setTimeout(function () { openSheet(null); }, 0);
    }
    if (!TITLES[r]) r = "month";
    route = r;
    ["month", "plan", "more"].forEach(function (s) { $("screen-" + s).hidden = s !== r; });
    document.querySelectorAll(".tabs a").forEach(function (a) {
      if (a.dataset.tab === r) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    $("title").textContent = TITLES[r];
    $("fab").hidden = r === "more";
    render();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", go);

  function render() {
    $("disp-toggle").textContent = plan.display === "EUR" ? "€ EUR" : "Kč CZK";
    if (route === "month") renderMonth();
    else if (route === "plan") renderPlanAll();
    else renderMore();
  }
  $("disp-toggle").addEventListener("click", function () {
    plan.display = plan.display === "EUR" ? "CZK" : "EUR";
    save(); render();
  });

  // ================= MONTH screen =================
  var curMonth = monthOf(todayISO());
  function shiftMonth(ym, d) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + d;
    var dt = new Date(y, m, 1);
    return dt.getFullYear() + "-" + pad(dt.getMonth() + 1);
  }
  $("m-prev").addEventListener("click", function () { curMonth = shiftMonth(curMonth, -1); renderMonth(); });
  $("m-next").addEventListener("click", function () { curMonth = shiftMonth(curMonth, 1); renderMonth(); });

  function renderMonth() {
    $("m-welcome").hidden = !(firstRun || isEmpty());
    var nowM = monthOf(todayISO());
    $("m-next").disabled = curMonth >= nowM;
    var y = +curMonth.slice(0, 4), mo = +curMonth.slice(5, 7) - 1;
    $("m-label").textContent = new Date(y, mo, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

    // backup reminder
    var nag = $("m-backup-nag");
    var daysSince = data.lastBackup ? Math.floor((Date.now() - Date.parse(data.lastBackup)) / 86400000) : null;
    if (data.entries.length >= 5 && (daysSince === null || daysSince >= 14)) {
      nag.hidden = false;
      $("m-backup-nag-text").textContent = daysSince === null ? "You haven't backed up yet. If you lose this phone, your data goes with it." : "Your last backup was " + daysSince + " days ago.";
    } else nag.hidden = true;

    var entries = data.entries.filter(function (e) { return monthOf(e.date) === curMonth; });
    var inc = incomeMonthly();
    var budgets = catBudgets();
    var planned = 0, plannedNeed = 0;
    plan.expenses.forEach(function (r) { var v = monthly(r); planned += v; if (r.need) plannedNeed += v; });
    var spent = 0, spentNeed = 0, byCat = {};
    entries.forEach(function (e) {
      var v = conv(e.amount, e.cur);
      spent += v; if (e.need) spentNeed += v;
      byCat[e.cat] = (byCat[e.cat] || 0) + v;
    });
    var left = inc - spent;

    // hero
    var hero = $("m-hero");
    hero.classList.toggle("neg", left < 0);
    $("m-left-label").textContent = left < 0 ? "Over your income by" : "Left this month";
    $("m-left").textContent = fmt(Math.abs(left));
    $("m-meter").style.width = (inc > 0 ? Math.min(100, spent / inc * 100) : 0) + "%";
    var mark = $("m-mark");
    if (inc > 0 && planned > 0 && planned <= inc) { mark.hidden = false; mark.style.left = (planned / inc * 100) + "%"; } else mark.hidden = true;
    if (inc > 0) {
      $("m-sub").textContent = "Spent " + fmt(spent) + " of " + fmt(inc) + " income. Your plan expects " + fmt(planned) + " (the line on the bar).";
    } else {
      $("m-sub").textContent = "Spent " + fmt(spent) + ". Add your income in Plan to see what's left.";
    }

    // minis
    $("m-need").textContent = fmt(spentNeed);
    $("m-need-sub").textContent = "of " + fmt(plannedNeed) + " planned";
    $("m-opt").textContent = fmt(spent - spentNeed);
    $("m-opt-sub").textContent = "of " + fmt(planned - plannedNeed) + " planned";

    // categories
    var order = allCatOrder();
    var cats = order.filter(function (c) { return (budgets[c] || 0) > 0 || (byCat[c] || 0) > 0; });
    cats.sort(function (a, b) { return Math.max(budgets[b] || 0, byCat[b] || 0) - Math.max(budgets[a] || 0, byCat[a] || 0); });
    var list = $("m-cats");
    list.innerHTML = "";
    if (!cats.length) list.appendChild(el("div", { class: "empty", text: "Categories appear here once you add a plan or log spending." }));
    cats.forEach(function (c) {
      var s = byCat[c] || 0, b = budgets[c] || 0;
      var color = colorFor(c, order);
      var sw = el("span", { class: "sw" }); sw.style.background = color;
      var amt = el("div", { class: "amt" });
      amt.appendChild(el("b", { text: fmt(s) }));
      amt.appendChild(document.createTextNode(b > 0 ? " of " + fmt(b) : ""));
      var track = el("div", { class: "track" });
      var fill = el("i");
      fill.style.width = (b > 0 ? Math.min(100, s / b * 100) : (s > 0 ? 100 : 0)) + "%";
      fill.style.background = s > b && b > 0 ? "var(--bad)" : color;
      track.appendChild(fill);
      var state = el("div", { class: "state" });
      if (b > 0 && s > b) { state.className = "state bad"; state.innerHTML = ICON_WARN; state.appendChild(document.createTextNode("Over by " + fmt(s - b))); }
      else if (b > 0) state.textContent = fmt(b - s) + " left";
      else state.textContent = "Not in your plan";
      list.appendChild(el("div", { class: "crow" }, [el("div", { class: "name" }, [sw, el("span", { text: c })]), amt, track, state]));
    });

    // entries grouped by day
    var box = $("m-entries");
    box.innerHTML = "";
    if (!entries.length) {
      box.appendChild(el("div", { class: "card empty", text: "Nothing logged for this month yet. Tap + to add what you spend." }));
      return;
    }
    entries.sort(function (a, b) { return a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : (a.date < b.date ? 1 : -1); });
    var today = todayISO(), yest = isoDate(new Date(Date.now() - 86400000));
    var groups = {};
    var days = [];
    entries.forEach(function (e) { if (!groups[e.date]) { groups[e.date] = []; days.push(e.date); } groups[e.date].push(e); });
    days.forEach(function (d) {
      var dt = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
      var label = d === today ? "Today" : d === yest ? "Yesterday" : dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
      var dayTotal = groups[d].reduce(function (s, e) { return s + conv(e.amount, e.cur); }, 0);
      var card = el("div", { class: "card" });
      groups[d].forEach(function (e) {
        var v = conv(e.amount, e.cur);
        var sw = el("span", { class: "sw" }); sw.style.background = colorFor(e.cat, order);
        var a = el("div", { class: "a", text: fmt(e.amount, e.cur, e.amount % 1 ? 2 : 0) });
        if (e.cur !== plan.display) a.appendChild(el("small", { text: "≈ " + fmt(v, null, v < 100 ? 2 : 0) }));
        var meta = e.cat + (e.need ? "" : " · optional");
        var wt = workTime(v);
        if (wt) meta += " · " + wt;
        var b = el("button", { type: "button", class: "entry", "data-entry": e.id, "aria-label": "Edit " + (e.note || e.cat) }, [
          el("div", { class: "t" }, [sw, el("span", { text: e.note || e.cat })]),
          el("div", { class: "m", text: meta }),
          a
        ]);
        card.appendChild(b);
      });
      box.appendChild(el("div", { class: "day" }, [el("h3", {}, [el("span", { text: label }), el("span", { class: "num", text: fmt(dayTotal) })]), card]));
    });
  }
  $("m-entries").addEventListener("click", function (e) {
    var b = e.target.closest("[data-entry]");
    if (b) openSheet(b.dataset.entry);
  });

  // ================= ADD / EDIT sheet =================
  var sheet = { id: null, cur: "CZK", cat: null, need: true, needTouched: false, delArmed: false };
  function openSheet(entryId) {
    var e = entryId ? data.entries.find(function (x) { return x.id === entryId; }) : null;
    sheet.id = e ? e.id : null;
    sheet.cur = e ? e.cur : data.settings.entryCur;
    sheet.cat = e ? e.cat : null;
    sheet.need = e ? e.need : true;
    sheet.needTouched = !!e;
    sheet.delArmed = false;
    $("sheet-title").textContent = e ? "Edit spending" : "Add spending";
    $("f-amount").value = e ? String(e.amount) : "";
    $("f-note").value = e ? e.note : "";
    $("f-date").value = e ? e.date : todayISO();
    $("f-date").max = todayISO();
    $("f-newcat").hidden = true; $("f-newcat").value = "";
    $("f-delete").hidden = !e;
    $("f-delete").classList.remove("armed");
    $("f-delete").textContent = "Delete";
    $("f-bills").open = false;
    $("f-bills").hidden = !!e || !plan.expenses.length;
    renderSheetCats(); renderSheetCur(); renderSheetNeed(); renderBills(); renderWork();
    $("backdrop").hidden = false; $("sheet").hidden = false;
    setTimeout(function () { $("f-amount").focus(); }, 60);
  }
  function closeSheet() { $("sheet").hidden = true; $("backdrop").hidden = true; }
  $("fab").addEventListener("click", function () { openSheet(null); });
  $("sheet-close").addEventListener("click", closeSheet);
  $("backdrop").addEventListener("click", closeSheet);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("sheet").hidden) closeSheet(); });

  function renderSheetCur() {
    $("f-cur").querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === sheet.cur)); });
  }
  $("f-cur").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-v]"); if (!b) return;
    sheet.cur = b.dataset.v; renderSheetCur(); renderWork();
  });
  function renderSheetNeed() {
    var b = $("f-need");
    b.setAttribute("aria-pressed", String(sheet.need));
    b.textContent = sheet.need ? "Need" : "Optional";
  }
  $("f-need").addEventListener("click", function () { sheet.need = !sheet.need; sheet.needTouched = true; renderSheetNeed(); });

  function renderSheetCats() {
    var box = $("f-cats");
    box.innerHTML = "";
    var order = allCatOrder();
    var cats = order.filter(function (c) { return c !== "Uncategorized"; });
    if (cats.indexOf("Other") === -1) cats.push("Other");
    if (sheet.cat && cats.indexOf(sheet.cat) === -1) cats.push(sheet.cat);
    cats.forEach(function (c) {
      var sw = el("span", { class: "sw" }); sw.style.background = colorFor(c, order);
      var chip = el("button", { type: "button", class: "chip", role: "radio", "aria-checked": String(sheet.cat === c), "data-cat": c }, [sw, el("span", { text: c })]);
      box.appendChild(chip);
    });
    box.appendChild(el("button", { type: "button", class: "chip", role: "radio", "aria-checked": "false", "data-cat": "__new", text: "+ New" }));
  }
  $("f-cats").addEventListener("click", function (e) {
    var b = e.target.closest("[data-cat]"); if (!b) return;
    if (b.dataset.cat === "__new") {
      sheet.cat = null;
      $("f-newcat").hidden = false; $("f-newcat").focus();
    } else {
      sheet.cat = b.dataset.cat;
      $("f-newcat").hidden = true;
      if (!sheet.needTouched) { sheet.need = catIsNeed(sheet.cat); renderSheetNeed(); }
    }
    $("f-cats").querySelectorAll("[data-cat]").forEach(function (x) {
      x.setAttribute("aria-checked", String(x.dataset.cat === b.dataset.cat));
    });
  });

  function renderBills() {
    var box = $("f-billchips");
    box.innerHTML = "";
    plan.expenses.forEach(function (r) {
      if (!r.amount) return;
      var chip = el("button", { type: "button", class: "chip", "data-bill": r.id }, [el("span", { text: r.name || r.cat }), el("small", { text: fmt(r.amount, r.cur, r.amount % 1 ? 2 : 0) })]);
      box.appendChild(chip);
    });
  }
  $("f-billchips").addEventListener("click", function (e) {
    var b = e.target.closest("[data-bill]"); if (!b) return;
    var r = plan.expenses.find(function (x) { return x.id === b.dataset.bill; }); if (!r) return;
    $("f-amount").value = String(r.amount);
    sheet.cur = r.cur; renderSheetCur();
    sheet.cat = catName(r.cat); sheet.need = r.need; sheet.needTouched = true;
    $("f-note").value = r.name;
    renderSheetCats(); renderSheetNeed(); renderWork();
    $("f-bills").open = false;
  });

  function renderWork() {
    var a = num($("f-amount").value);
    var wt = a > 0 ? workTime(conv(a, sheet.cur)) : "";
    var extra = a > 0 && sheet.cur !== plan.display ? "≈ " + fmt(conv(a, sheet.cur), null, 2) : "";
    $("f-work").textContent = [extra, wt ? "That's " + wt : ""].filter(Boolean).join(" · ");
  }
  $("f-amount").addEventListener("input", renderWork);

  $("sheet").addEventListener("submit", function (e) {
    e.preventDefault();
    var amount = num($("f-amount").value);
    if (!amount) { toast("Enter an amount first."); $("f-amount").focus(); return; }
    var cat = sheet.cat;
    if (!$("f-newcat").hidden) cat = $("f-newcat").value.trim().slice(0, 40);
    if (!cat) { toast("Pick a category, or tap + New to make one."); return; }
    var date = /^\d{4}-\d{2}-\d{2}$/.test($("f-date").value) ? $("f-date").value : todayISO();
    var entry = normalizeEntry({ id: sheet.id || rid(), date: date, amount: amount, cur: sheet.cur, cat: cat, note: $("f-note").value.trim(), need: sheet.need });
    if (sheet.id) {
      var i = data.entries.findIndex(function (x) { return x.id === sheet.id; });
      if (i > -1) { entry.createdAt = data.entries[i].createdAt; data.entries[i] = entry; }
    } else data.entries.push(entry);
    save();
    closeSheet();
    curMonth = monthOf(date);
    if (route !== "month") location.hash = "#month"; else renderMonth();
    toast(sheet.id ? "Saved" : "Added " + fmt(amount, entry.cur, amount % 1 ? 2 : 0) + " to " + cat);
  });
  $("f-delete").addEventListener("click", function () {
    var b = $("f-delete");
    if (!sheet.delArmed) { sheet.delArmed = true; b.classList.add("armed"); b.textContent = "Tap again to delete"; return; }
    data.entries = data.entries.filter(function (x) { return x.id !== sheet.id; });
    save(); closeSheet(); renderMonth(); toast("Deleted");
  });

  // ================= PLAN screen =================
  var incTable = $("inc-table"), expTable = $("exp-table");

  function curSelect(id, value) {
    var s = el("select", { id: id, "aria-label": "Currency", "data-f": "cur" });
    CURS.forEach(function (c) { s.appendChild(el("option", { value: c, text: c })); });
    s.value = value; return s;
  }
  function unitSelect(id, value, every) {
    var s = el("select", { id: id, "aria-label": "Repeats every", "data-f": "unit" });
    Object.keys(UNITS).forEach(function (k) { s.appendChild(el("option", { value: k, text: every > 1 ? UNITS[k].many : UNITS[k].one })); });
    s.value = value; return s;
  }
  function amountCell(prefix, r) {
    var i = el("input", { id: prefix + "-amt", type: "number", inputmode: "decimal", min: "0", step: "any", "aria-label": "Amount", "data-f": "amount", placeholder: "0" });
    i.value = r.amount ? String(r.amount) : "";
    return el("div", { class: "a-amt amt-cell" }, [i, curSelect(prefix + "-cur", r.cur)]);
  }
  function freqCell(prefix, r) {
    var n = el("input", { id: prefix + "-every", type: "number", inputmode: "numeric", min: "1", step: "1", "aria-label": "Number of", "data-f": "every" });
    n.value = String(r.every);
    return el("div", { class: "a-freq freq-cell" }, [el("span", { class: "every", text: "every" }), n, unitSelect(prefix + "-unit", r.unit, r.every)]);
  }
  function needBtn(prefix, r) {
    var b = el("button", { type: "button", id: prefix + "-need", class: "need-btn", "data-need": "", "aria-pressed": String(r.need) });
    b.textContent = r.need ? "Need" : "Optional";
    return el("div", { class: "a-need" }, [b]);
  }
  function delBtn(label) { return el("button", { type: "button", class: "del a-del", "data-del": "", "aria-label": label, text: "×" }); }
  function incomeRow(r) {
    var p = "inc-" + r.id;
    var name = el("input", { id: p + "-name", type: "text", "aria-label": "Income source", "data-f": "name", placeholder: "Income source" });
    name.value = r.name;
    return el("div", { class: "row inc", "data-id": r.id }, [el("div", { class: "a-name" }, [name]), amountCell(p, r), freqCell(p, r), el("div", { class: "a-eq", "data-eq": "" }), delBtn("Remove income")]);
  }
  function expenseRow(r) {
    var p = "exp-" + r.id;
    var name = el("input", { id: p + "-name", type: "text", "aria-label": "Expense", "data-f": "name", placeholder: "Expense" });
    name.value = r.name;
    var cat = el("input", { id: p + "-cat", type: "text", list: "cat-list", "aria-label": "Category", "data-f": "cat", placeholder: "Category" });
    cat.value = r.cat;
    return el("div", { class: "row exp", "data-id": r.id }, [
      el("div", { class: "a-name" }, [name]),
      el("div", { class: "a-cat cat-cell" }, [el("span", { class: "sw", "data-sw": "" }), cat]),
      amountCell(p, r), freqCell(p, r), needBtn(p, r),
      el("div", { class: "a-eq", "data-eq": "" }), delBtn("Remove expense")
    ]);
  }

  function renderPlanAll() {
    $("mode-all").setAttribute("aria-pressed", String(prefs.mode === "all"));
    $("mode-free").setAttribute("aria-pressed", String(prefs.mode === "free"));
    $("view-month").setAttribute("aria-pressed", String(prefs.view === "month"));
    $("view-year").setAttribute("aria-pressed", String(prefs.view === "year"));
    incTable.innerHTML = ""; expTable.innerHTML = "";
    plan.income.forEach(function (r) { incTable.appendChild(incomeRow(r)); });
    plan.expenses.forEach(function (r) { expTable.appendChild(expenseRow(r)); });
    $("goal-name").value = plan.goal.name;
    $("goal-target").value = plan.goal.target ? String(plan.goal.target) : "";
    $("goal-saved").value = plan.goal.saved ? String(plan.goal.saved) : "";
    $("goal-cur").value = plan.goal.cur;
    renderPlanSummary();
  }

  function setKpi(k, label, value, sub) {
    $(k + "-l").textContent = label;
    $(k + "-v").textContent = value;
    var s = $(k + "-s"); if (s) s.textContent = sub || "";
  }
  function setPill(kind, text) {
    var pill = $("k1-pill");
    if (!kind) { pill.innerHTML = ""; return; }
    pill.innerHTML = '<span class="pill ' + kind + '">' + (kind === "bad" ? ICON_WARN : ICON_OK) + "</span>";
    pill.firstChild.appendChild(document.createTextNode(text));
  }
  function addSeg(bar, value, scaleMax, color, cls, aria) {
    var s = el("div", { class: "seg-fill" + (cls ? " " + cls : ""), "aria-label": aria, title: aria });
    s.style.width = (value / scaleMax * 100) + "%";
    if (color) s.style.background = color;
    bar.appendChild(s);
  }
  function addCatRow(list, label, value, maxVal, color, inc, m, cls) {
    var sw = el("span", { class: "sw" }); sw.style.background = color;
    var track = el("div", { class: "track" });
    if (maxVal) { var fill = el("i"); fill.style.width = (value / maxVal * 100) + "%"; fill.style.background = color; track.appendChild(fill); }
    list.appendChild(el("div", { class: "cat" + (cls ? " " + cls : "") }, [
      el("div", { class: "name" }, [sw, el("span", { text: label })]),
      el("div", { class: "amt", text: fmt(value * m) }),
      el("div", { class: "pct", text: pct(value, inc) }),
      track
    ]));
  }

  function renderPlanSummary() {
    var m = prefs.view === "year" ? 12 : 1;
    var per = prefs.view === "year" ? "per year" : "per month";
    var hrs = Math.max(1, plan.hours || DEFAULT_HOURS);
    var inc = incomeMonthly();
    var exp = 0, needs = 0;
    plan.expenses.forEach(function (r) { var v = monthly(r); exp += v; if (r.need) needs += v; });
    var wants = exp - needs, left = inc - exp, free = inc - needs;

    var order = planCatOrder();
    var totals = {}, optTotals = {};
    plan.expenses.forEach(function (r) {
      var c = catName(r.cat);
      if (order.indexOf(c) >= MAX_CATS) c = "Other categories";
      var v = monthly(r);
      totals[c] = (totals[c] || 0) + v;
      if (!r.need) optTotals[c] = (optTotals[c] || 0) + v;
    });
    var segOrder = order.slice(0, MAX_CATS).concat(totals["Other categories"] ? ["Other categories"] : []);
    function sortedKeys(obj) { return Object.keys(obj).filter(function (c) { return obj[c] > 0; }).sort(function (a, b) { return obj[b] - obj[a]; }); }

    var k1 = $("k1"), bar = $("alloc-bar"), list = $("cats");
    bar.innerHTML = ""; list.innerHTML = "";
    var scaleMax = Math.max(inc, exp);

    if (prefs.mode === "all") {
      setKpi("k1", (left < 0 ? "Short " : "Left over ") + per, fmt(Math.abs(left) * m));
      $("k1-h").textContent = inc > 0 ? fmtHour(left / hrs) + " per hour worked" : "";
      k1.classList.toggle("neg", left < 0);
      if (inc === 0 && exp === 0) setPill(null);
      else if (left < 0) setPill("bad", "Spending is over income");
      else setPill("good", "Plan is balanced");
      setKpi("k2", "Income", fmt(inc * m), inc > 0 ? fmtHour(inc / hrs) + " per hour" : "");
      setKpi("k3", "Planned spending", fmt(exp * m), inc > 0 ? pct(exp, inc) + " of income" : "");
      setKpi("k4", "Saving rate", inc > 0 ? pct(left, inc) : "–", "of income left over");
      $("alloc-l").textContent = "Where your income goes";
      if (scaleMax > 0) {
        segOrder.forEach(function (c) { if (totals[c]) addSeg(bar, totals[c], scaleMax, colorFor(c, order), "", c + ": " + fmt(totals[c] * m)); });
        if (left > 0) addSeg(bar, left, scaleMax, null, "left", "Left over: " + fmt(left * m));
      }
      var cats = sortedKeys(totals);
      if (!cats.length) list.appendChild(el("div", { class: "empty", text: "Add planned expenses below to see where your money goes." }));
      var maxCat = cats.length ? totals[cats[0]] : 0;
      cats.forEach(function (c) { addCatRow(list, c, totals[c], maxCat, colorFor(c, order), inc, m); });
      if (cats.length && left > 0) addCatRow(list, "Left over", left, 0, "var(--accent)", inc, m, "left-row");
    } else {
      setKpi("k1", (free < 0 ? "Necessities cost more than you earn, " : "Yours after necessities, ") + per, fmt(Math.abs(free) * m));
      $("k1-h").textContent = inc > 0 ? fmtHour(free / hrs) + " per hour worked" : "";
      k1.classList.toggle("neg", free < 0);
      if (inc === 0 && exp === 0) setPill(null);
      else if (free < 0) setPill("bad", "Necessities are over income");
      else setPill("good", "All necessities covered");
      setKpi("k2", "Income", fmt(inc * m), inc > 0 ? fmtHour(inc / hrs) + " per hour" : "");
      setKpi("k3", "Necessities", fmt(needs * m), inc > 0 ? pct(needs, inc) + " of income · " + fmtHour(needs / hrs) + " / h" : "");
      setKpi("k4", "Optional", fmt(wants * m), (left < 0 ? "Short after that: " : "Left after that: ") + fmt(Math.abs(left) * m));
      $("alloc-l").textContent = "Your income after necessities";
      if (scaleMax > 0) {
        if (needs > 0) addSeg(bar, needs, scaleMax, "var(--needs)", "", "Necessities: " + fmt(needs * m));
        segOrder.forEach(function (c) { if (optTotals[c]) addSeg(bar, optTotals[c], scaleMax, colorFor(c, order), "", c + ": " + fmt(optTotals[c] * m)); });
        if (left > 0) addSeg(bar, left, scaleMax, null, "left", "Left over: " + fmt(left * m));
      }
      if (exp === 0) list.appendChild(el("div", { class: "empty", text: "Add planned expenses below to see where your money goes." }));
      else {
        var opt = sortedKeys(optTotals);
        var maxV = Math.max(needs, opt.length ? optTotals[opt[0]] : 0);
        addCatRow(list, "Necessities", needs, maxV, "var(--needs)", inc, m, "needs-row");
        opt.forEach(function (c) { addCatRow(list, c + " (optional)", optTotals[c], maxV, colorFor(c, order), inc, m); });
        if (left > 0) addCatRow(list, "Left over", left, 0, "var(--accent)", inc, m, "left-row");
      }
    }
    if (exp > inc && inc > 0) {
      var mk = el("div", { class: "income-mark" });
      mk.style.left = (inc / scaleMax * 100) + "%";
      bar.appendChild(mk);
    }
    $("scale-max").textContent = scaleMax > 0 ? (exp > inc ? "Spending " : "Income ") + fmt(scaleMax * m) : "";
    $("inc-total").textContent = fmt(inc * m) + " " + per;
    $("exp-total").textContent = fmt(exp * m) + " " + per;

    function eqCell(row, r) {
      var cell = row.querySelector("[data-eq]"); if (!cell) return;
      var mo = monthly(r);
      cell.textContent = "";
      if (!(r.unit === "month" && r.every === 1) && mo > 0) cell.appendChild(el("small", { text: fmt(mo * 12) + " / yr" }));
      cell.appendChild(el("span", { text: fmt(mo, null, mo < 100 ? 2 : 0) + " / mo" }));
    }
    plan.income.forEach(function (r) { var row = incTable.querySelector('[data-id="' + r.id + '"]'); if (row) eqCell(row, r); });
    plan.expenses.forEach(function (r) {
      var row = expTable.querySelector('[data-id="' + r.id + '"]'); if (!row) return;
      eqCell(row, r);
      var sw = row.querySelector("[data-sw]"), c = catName(r.cat);
      if (sw) sw.style.background = r.cat.trim() ? colorFor(order.indexOf(c) >= MAX_CATS ? "" : c, order) : "transparent";
    });

    var dl = $("cat-list"); dl.innerHTML = "";
    var sug = order.filter(function (c) { return c !== "Uncategorized"; });
    ["Housing", "Food", "Transport", "Subscriptions", "Health", "Fun", "Other"].forEach(function (c) { if (sug.indexOf(c) === -1) sug.push(c); });
    sug.forEach(function (c) { dl.appendChild(el("option", { value: c })); });

    var g = plan.goal, target = conv(g.target, g.cur), saved = conv(g.saved, g.cur), need = Math.max(0, target - saved);
    var out = $("goal-out");
    $("goal-bar").style.width = (target > 0 ? Math.min(100, saved / target * 100) : 0) + "%";
    out.innerHTML = "";
    var gname = g.name.trim() || "your goal";
    if (!g.target) out.textContent = "Set a target to see how long it takes if you save everything that's left over.";
    else if (need === 0) { out.appendChild(el("strong", { text: "Done. " })); out.appendChild(document.createTextNode("You've already saved enough for " + gname + ".")); }
    else if (left <= 0) out.textContent = "With this plan nothing is left over, so " + gname + " can't grow.";
    else {
      var months = Math.ceil(need / left);
      var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + months);
      out.appendChild(el("strong", { text: months + (months === 1 ? " month" : " months") }));
      out.appendChild(document.createTextNode(" to reach " + gname + " (" + fmt(need) + " to go at " + fmt(left) + " a month). That's around " + d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) + "."));
    }
  }

  function planEdited() { save(); renderPlanSummary(); }
  function onRowInput(listName) {
    return function (e) {
      var t = e.target, row = t.closest(".row");
      if (!row || !t.dataset.f) return;
      var r = plan[listName].find(function (x) { return x.id === row.dataset.id; }); if (!r) return;
      var f = t.dataset.f;
      if (f === "amount") r.amount = num(t.value);
      else if (f === "cur") r.cur = curOk(t.value, plan.display);
      else if (f === "unit") r.unit = UNITS[t.value] ? t.value : "month";
      else if (f === "every") {
        r.every = Math.max(1, Math.round(num(t.value)) || 1);
        var us = row.querySelector('[data-f="unit"]');
        if (us) Array.prototype.forEach.call(us.options, function (o) { o.textContent = r.every > 1 ? UNITS[o.value].many : UNITS[o.value].one; });
      } else r[f] = str(t.value, f === "cat" ? 40 : 80);
      planEdited();
    };
  }
  function onRowClick(listName) {
    return function (e) {
      var nb = e.target.closest("[data-need]");
      if (nb) {
        var r = plan[listName].find(function (x) { return x.id === nb.closest(".row").dataset.id; }); if (!r) return;
        r.need = !r.need;
        nb.setAttribute("aria-pressed", String(r.need)); nb.textContent = r.need ? "Need" : "Optional";
        planEdited(); return;
      }
      var b = e.target.closest("[data-del]"); if (!b) return;
      var row = b.closest(".row");
      plan[listName] = plan[listName].filter(function (x) { return x.id !== row.dataset.id; });
      row.remove(); planEdited();
    };
  }
  incTable.addEventListener("input", onRowInput("income"));
  incTable.addEventListener("change", onRowInput("income"));
  expTable.addEventListener("input", onRowInput("expenses"));
  expTable.addEventListener("change", onRowInput("expenses"));
  incTable.addEventListener("click", onRowClick("income"));
  expTable.addEventListener("click", onRowClick("expenses"));
  $("add-inc").addEventListener("click", function () {
    var r = { id: rid(), name: "", amount: 0, cur: "CZK", every: 1, unit: "month" };
    plan.income.push(r); var row = incomeRow(r); incTable.appendChild(row); planEdited(); row.querySelector("input").focus();
  });
  $("add-exp").addEventListener("click", function () {
    var r = { id: rid(), name: "", cat: "", amount: 0, cur: "CZK", every: 1, unit: "month", need: true };
    plan.expenses.push(r); var row = expenseRow(r); expTable.appendChild(row); planEdited(); row.querySelector("input").focus();
  });
  ["goal-name", "goal-target", "goal-saved", "goal-cur"].forEach(function (id) {
    $(id).addEventListener(id === "goal-cur" ? "change" : "input", function (e) {
      if (id === "goal-name") plan.goal.name = str(e.target.value);
      if (id === "goal-target") plan.goal.target = num(e.target.value);
      if (id === "goal-saved") plan.goal.saved = num(e.target.value);
      if (id === "goal-cur") plan.goal.cur = curOk(e.target.value, plan.display);
      planEdited();
    });
  });
  $("mode-all").addEventListener("click", function () { prefs.mode = "all"; savePrefs(); renderPlanAll(); });
  $("mode-free").addEventListener("click", function () { prefs.mode = "free"; savePrefs(); renderPlanAll(); });
  $("view-month").addEventListener("click", function () { prefs.view = "month"; savePrefs(); renderPlanAll(); });
  $("view-year").addEventListener("click", function () { prefs.view = "year"; savePrefs(); renderPlanAll(); });

  // ================= MORE screen =================
  function renderMore() {
    $("set-display").querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === plan.display)); });
    $("set-entrycur").querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === data.settings.entryCur)); });
    if (document.activeElement !== $("set-rate")) $("set-rate").value = String(plan.rate);
    if (document.activeElement !== $("set-hours")) $("set-hours").value = String(plan.hours);
    $("backup-info").textContent = data.lastBackup
      ? "Last backup: " + new Date(data.lastBackup).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) + ". " + data.entries.length + " spending entries on this phone."
      : "No backup yet. " + data.entries.length + " spending entries on this phone.";
    $("install-card").hidden = !installEvt;
  }
  $("set-display").addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b) return; plan.display = b.dataset.v; save(); render(); });
  $("set-entrycur").addEventListener("click", function (e) { var b = e.target.closest("button[data-v]"); if (!b) return; data.settings.entryCur = b.dataset.v; save(); renderMore(); });
  $("set-rate").addEventListener("input", function (e) { var v = num(e.target.value); if (v) { plan.rate = v; save(); } });
  $("set-hours").addEventListener("input", function (e) { var v = Math.round(num(e.target.value)); if (v) { plan.hours = v; save(); } });

  function backupJSON() {
    return JSON.stringify({ app: "money-plan", version: 1, exportedAt: new Date().toISOString(), plan: data.plan, entries: data.entries, settings: data.settings }, null, 1);
  }
  function backupName() { return "money-plan-backup-" + todayISO(); }
  function markBackup() { data.lastBackup = new Date().toISOString(); save(); render(); }
  function downloadBackup() {
    var blob = new Blob([backupJSON()], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: backupName() + ".json" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    markBackup();
    toast("Saved to your Downloads folder.");
  }
  $("btn-download").addEventListener("click", downloadBackup);
  $("btn-backup").addEventListener("click", async function () {
    var json = backupJSON(), name = backupName();
    var tries = [[name + ".json", "application/json"], [name + ".txt", "text/plain"]];
    for (var i = 0; i < tries.length; i++) {
      var f;
      try { f = new File([json], tries[i][0], { type: tries[i][1] }); } catch (e) { break; }
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        try {
          await navigator.share({ files: [f], title: "Money Plan backup" });
          markBackup();
          toast("Backup sent. If you picked Drive, it's saved there.");
        } catch (e) {
          if (e && e.name !== "AbortError") toast("Couldn't open sharing. Use 'Save backup file to phone' instead.");
        }
        return;
      }
    }
    downloadBackup();
  });

  var pendingRestore = null;
  function readRestoreFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var obj;
      try { obj = JSON.parse(String(reader.result)); } catch (e) { toast("That file isn't a Money Plan backup."); return; }
      if (!obj || typeof obj !== "object" || (!obj.plan && !obj.entries)) { toast("That file isn't a Money Plan backup."); return; }
      var incoming = normalizeData(obj);
      if (isEmpty()) { applyRestore(incoming); return; }
      pendingRestore = incoming;
      var when = obj.exportedAt ? new Date(obj.exportedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "an unknown date";
      $("restore-text").textContent = "Restore the backup from " + when + "? It has " + (incoming.plan.income.length + incoming.plan.expenses.length) + " plan lines and " + incoming.entries.length + " spending entries. Everything on this phone now will be replaced.";
      $("restore-confirm").hidden = false;
      if (route !== "more") location.hash = "#more";
    };
    reader.onerror = function () { toast("Couldn't read that file."); };
    reader.readAsText(file);
  }
  function applyRestore(incoming) {
    incoming.lastBackup = new Date().toISOString();
    data = incoming; plan = data.plan;
    save();
    $("restore-confirm").hidden = true; pendingRestore = null;
    toast("Backup restored.");
    location.hash = "#month"; go();
  }
  $("file-restore").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) readRestoreFile(f);
    e.target.value = "";
  });
  $("w-restore").addEventListener("click", function () { $("file-restore").click(); });
  $("restore-cancel").addEventListener("click", function () { pendingRestore = null; $("restore-confirm").hidden = true; });
  $("restore-go").addEventListener("click", function () { if (pendingRestore) applyRestore(pendingRestore); });

  var wipeArmed = false;
  $("btn-wipe").addEventListener("click", function () {
    var b = $("btn-wipe");
    if (!wipeArmed) {
      wipeArmed = true; b.classList.add("armed"); b.textContent = "Tap again to delete everything";
      setTimeout(function () { wipeArmed = false; b.classList.remove("armed"); b.textContent = "Delete all data"; }, 5000);
      return;
    }
    data = normalizeData({ plan: emptyPlan() }); plan = data.plan;
    save(); firstRun = true;
    wipeArmed = false; b.classList.remove("armed"); b.textContent = "Delete all data";
    toast("All data deleted from this phone.");
    location.hash = "#month"; go();
  });

  // ================= install & offline =================
  var installEvt = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEvt = e; if (route === "more") renderMore(); });
  window.addEventListener("appinstalled", function () { installEvt = null; if (route === "more") renderMore(); });
  $("btn-install").addEventListener("click", function () {
    if (!installEvt) return;
    installEvt.prompt();
    installEvt.userChoice.finally(function () { installEvt = null; renderMore(); });
  });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").then(function (reg) {
      function offer(w) { toast("A new version of Money Plan is ready.", "Update", function () { w.postMessage("skip-waiting"); }); }
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener("updatefound", function () {
        var w = reg.installing; if (!w) return;
        w.addEventListener("statechange", function () { if (w.state === "installed" && navigator.serviceWorker.controller) offer(w); });
      });
    }).catch(function () {});
    var reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () { if (reloading) return; reloading = true; location.reload(); });
  }

  go();
})();
