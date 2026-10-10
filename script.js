/* ---------- Calculator engine (pure logic, no DOM) ---------- */
const Engine = (() => {
  const MAX_DIGITS = 15;

  const fresh = () => ({
    current: "0",      // number being typed / shown
    previous: null,    // left operand
    op: null,          // pending operator
    overwrite: false,  // next digit starts a new number
    error: null,
    expression: "",
  });

  const SYM = { "+": "+", "-": "−", "*": "×", "/": "÷" };

  const compute = (a, b, op) => {
    switch (op) {
      case "+": return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/": return b === 0 ? null : a / b;
      default: return b;
    }
  };

  // Trim floating point noise (0.1 + 0.2 -> 0.3) and avoid huge strings.
  const format = (n) => {
    if (!isFinite(n)) return null;
    let s = Number(n.toPrecision(12)).toString();
    if (s.length > 16) s = Number(n).toExponential(6);
    return s;
  };

  const digit = (s, d) => {
    if (s.error) s = fresh();
    if (s.overwrite) { s.current = d; s.overwrite = false; return s; }
    if (s.current.replace(/[-.]/g, "").length >= MAX_DIGITS) return s;
    s.current = s.current === "0" ? d : s.current + d;
    return s;
  };

  const dot = (s) => {
    if (s.error) s = fresh();
    if (s.overwrite) { s.current = "0."; s.overwrite = false; return s; }
    if (!s.current.includes(".")) s.current += ".";
    return s;
  };

  const chooseOp = (s, op) => {
    if (s.error) return s;
    // Chain: 2 + 3 + -> evaluate 2+3 first
    if (s.op && !s.overwrite) {
      const r = compute(parseFloat(s.previous), parseFloat(s.current), s.op);
      if (r === null) return fail(s);
      s.previous = format(r);
      s.current = s.previous;
    } else if (!s.op) {
      s.previous = s.current;
    }
    s.op = op;
    s.overwrite = true;
    s.expression = `${s.previous} ${SYM[op]}`;
    return s;
  };

  const fail = (s) => {
    const e = fresh();
    e.error = "Cannot divide by 0";
    e.current = e.error;
    return e;
  };

  // Returns { state, entry } where entry is a history record (or null).
  const equals = (s) => {
    if (s.error || !s.op) return { state: s, entry: null };
    const a = parseFloat(s.previous);
    const b = parseFloat(s.current);
    const r = compute(a, b, s.op);
    if (r === null) return { state: fail(s), entry: null };
    const text = `${s.previous} ${SYM[s.op]} ${s.current}`;
    const out = format(r);
    const next = fresh();
    next.current = out;
    next.overwrite = true;
    next.expression = `${text} =`;
    return { state: next, entry: { text, result: out } };
  };

  const clear = () => fresh();

  const backspace = (s) => {
    if (s.error) return fresh();
    if (s.overwrite) return s;
    s.current = s.current.length > 1 && s.current !== "-0"
      ? s.current.slice(0, -1) : "0";
    if (s.current === "-") s.current = "0";
    return s;
  };

  const sign = (s) => {
    if (s.error || s.current === "0") return s;
    s.current = s.current.startsWith("-") ? s.current.slice(1) : "-" + s.current;
    return s;
  };

  const percent = (s) => {
    if (s.error) return s;
    s.current = format(parseFloat(s.current) / 100);
    s.overwrite = true;
    return s;
  };

  return { fresh, digit, dot, chooseOp, equals, clear, backspace, sign, percent, SYM };
})();

/* ---------- UI (runs only in the browser) ---------- */
if (typeof document !== "undefined") {
  let state = Engine.fresh();
  let history = [];
  try { history = JSON.parse(localStorage.getItem("calc-history") || "[]"); } catch (_) {}

  const $display = document.getElementById("display");
  const $expr = document.getElementById("expression");
  const $list = document.getElementById("historyList");
  document.getElementById("host").textContent = location.host || "local file";

  const prettify = (v) => {
    if (state.error || v.includes("e")) return v;
    const neg = v.startsWith("-");
    const [i, f] = (neg ? v.slice(1) : v).split(".");
    const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-" : "") + grouped + (f !== undefined ? "." + f : "");
  };

  const render = () => {
    $display.textContent = prettify(state.current);
    $display.classList.toggle("error", !!state.error);
    $expr.textContent = state.expression;
    document.querySelectorAll(".key.op").forEach((b) =>
      b.classList.toggle("active", state.op === b.dataset.op && state.overwrite));
  };

  const renderHistory = () => {
    if (!history.length) {
      $list.innerHTML = '<li class="empty">No calculations yet</li>';
      return;
    }
    $list.innerHTML = history
      .map((h, i) => `<li data-i="${i}"><span>${h.text}</span><span class="res">${h.result}</span></li>`)
      .join("");
  };

  const saveHistory = () => {
    try { localStorage.setItem("calc-history", JSON.stringify(history.slice(0, 30))); } catch (_) {}
  };

  const act = (action, data = {}) => {
    switch (action) {
      case "digit": state = Engine.digit(state, data.digit); break;
      case "dot": state = Engine.dot(state); break;
      case "op": state = Engine.chooseOp(state, data.op); break;
      case "clear": state = Engine.clear(); break;
      case "sign": state = Engine.sign(state); break;
      case "percent": state = Engine.percent(state); break;
      case "backspace": state = Engine.backspace(state); break;
      case "equals": {
        const { state: s, entry } = Engine.equals(state);
        state = s;
        if (entry) { history.unshift(entry); history = history.slice(0, 30); saveHistory(); renderHistory(); }
        break;
      }
    }
    render();
  };

  document.querySelector(".keys").addEventListener("click", (e) => {
    const b = e.target.closest(".key");
    if (b) act(b.dataset.action, b.dataset);
  });

  $list.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-i]");
    if (!li) return;
    state = Engine.fresh();
    state.current = history[li.dataset.i].result;
    state.overwrite = true;
    render();
  });

  document.getElementById("clearHistory").addEventListener("click", () => {
    history = []; saveHistory(); renderHistory();
  });

  // Keyboard support
  const flash = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.classList.add("pressed");
    setTimeout(() => el.classList.remove("pressed"), 100);
  };

  document.addEventListener("keydown", (e) => {
    const k = e.key;
    if (/^[0-9]$/.test(k)) { act("digit", { digit: k }); flash(`[data-digit="${k}"]`); }
    else if (k === ".") { act("dot"); flash('[data-action="dot"]'); }
    else if ("+-*/".includes(k)) { e.preventDefault(); act("op", { op: k }); flash(`[data-op="${k}"]`); }
    else if (k === "Enter" || k === "=") { e.preventDefault(); act("equals"); flash('[data-action="equals"]'); }
    else if (k === "Backspace") { act("backspace"); }
    else if (k === "Escape" || k === "Delete") { act("clear"); flash('[data-action="clear"]'); }
    else if (k === "%") { act("percent"); flash('[data-action="percent"]'); }
  });

  render();
  renderHistory();
}

if (typeof module !== "undefined") module.exports = Engine;
