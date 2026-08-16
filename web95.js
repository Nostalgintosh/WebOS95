(() => {
  // src/dom.ts
  function $(selector, root = document) {
    const node = root.querySelector(selector);
    if (!node) throw new Error(`Missing required element: ${selector}`);
    return node;
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function esc(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character] ?? character);
  }

  // src/coto.ts
  var COTO_TARGETS = [
    ["macos-arm64", "Mach-O / AAPCS64"],
    ["macos-x86_64", "Mach-O / System V"],
    ["linux-x86_64", "ELF64 / Linux syscalls"],
    ["unix-x86_64", "ELF64 / BSD syscalls"],
    ["windows-x64", "COFF / Microsoft x64"],
    ["windows-arm64", "COFF / AAPCS64"],
    ["x86_64-uefi", "freestanding OS/Coto payload"],
    ["VM/Coto 1.1 + 2.0", "verified portable modules"]
  ];
  var COTO_SAMPLES = {
    hello: {
      name: "HOLA-MINIOS.coto",
      label: "Hello, MiniOS",
      source: `            IDENTIFICATION DIVISION.
            PROGRAM-ID.              HOLA-MINIOS.

            REMARKS.
            A SMALL HOSTED COTO SAMPLE FOR THE MINIOS SUBSYSTEM.

            PROCEDURE DIVISION.
           func int main() {
               string system = "MiniOS";
               int ideas = 3;
               bool ready = FIRE;
               display("Hola from Coto on " .. system .. "!\\n");
               display("Ideas connected: " .. ideas .. "\\n");
               display("Ready: " .. ready .. "\\n");
               return 0;
           }
`
    },
    kitchen: {
      name: "KITCHEN-BOOLEAN.coto",
      label: "FIRE / HOLD",
      source: `/*          IDENTIFICATION DIVISION.
            PROGRAM-ID.              KITCHEN-BOOLEAN.

            PROCEDURE DIVISION. */

           func int main() {
               bool ticket_ready = FIRE;
               bool ticket_waiting = HOLD;
               display("Ticket ready: " .. ticket_ready .. "\\n");
               display("Ticket waiting: " .. ticket_waiting .. "\\n");
               return 0;
           }
`
    },
    vm: {
      name: "VMCOTO-PREVIEW.coto",
      label: "VM/Coto event",
      source: `            IDENTIFICATION DIVISION.
            PROGRAM-ID.              VMCOTO-PREVIEW.

            PROCEDURE DIVISION.
           func int main() {
               display("VM/Coto module verified\\n");
               makefirst("priority.dispatch demo");
               return 0;
           }
`
    }
  };
  var ExpressionError = class extends Error {
    constructor(message, position = 0) {
      super(message);
      this.position = position;
    }
    position;
  };
  function tokenizeExpression(source) {
    const tokens = [];
    let i = 0;
    while (i < source.length) {
      const ch = source[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        const quote = ch;
        const start = i++;
        let value = "", closed = false;
        while (i < source.length) {
          const next = source[i++];
          if (next === quote) {
            closed = true;
            break;
          }
          if (next === "\\") {
            if (i >= source.length) break;
            const escaped = source[i++];
            value += { n: "\n", r: "\r", t: "	", "\\": "\\", '"': '"', "'": "'" }[escaped] ?? escaped;
          } else value += next;
        }
        if (!closed) throw new ExpressionError("unterminated string literal", start);
        tokens.push({ kind: "string", value, position: start });
        continue;
      }
      if (/\d/.test(ch)) {
        const start = i;
        while (i < source.length && /[\d.]/.test(source[i])) i++;
        const value = source.slice(start, i);
        if (!/^\d+(?:\.\d+)?$/.test(value)) throw new ExpressionError("invalid numeric literal", start);
        tokens.push({ kind: "number", value, position: start });
        continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        const start = i++;
        while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) i++;
        tokens.push({ kind: "identifier", value: source.slice(start, i), position: start });
        continue;
      }
      const pair = source.slice(i, i + 2);
      if (["..", "==", "!=", "<=", ">=", "&&", "||"].includes(pair)) {
        tokens.push({ kind: "operator", value: pair, position: i });
        i += 2;
        continue;
      }
      if ("+-*/%()!<>".includes(ch)) {
        tokens.push({ kind: "operator", value: ch, position: i });
        i++;
        continue;
      }
      throw new ExpressionError(`unexpected token '${ch}'`, i);
    }
    tokens.push({ kind: "eof", value: "", position: source.length });
    return tokens;
  }
  function valueText(value) {
    return typeof value === "boolean" ? value ? "FIRE" : "HOLD" : String(value);
  }
  function evaluateExpression(source, variables) {
    const tokens = tokenizeExpression(source);
    let at = 0;
    const peek = () => tokens[at];
    const take = (value) => {
      const token = tokens[at];
      if (value != null && token.value !== value) throw new ExpressionError(`expected '${value}'`, token.position);
      at++;
      return token;
    };
    const numeric = (value, token) => {
      if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new ExpressionError("numeric expression requires a checked int value", token.position);
      return value;
    };
    const checked = (value, token) => {
      if (!Number.isSafeInteger(value)) throw new ExpressionError("integer overflow in checked Coto expression", token.position);
      return value;
    };
    const truthy = (value, token) => {
      if (typeof value !== "boolean") throw new ExpressionError("boolean expression requires FIRE or HOLD", token.position);
      return value;
    };
    const primary = () => {
      const token = peek();
      if (token.kind === "number") {
        take();
        const value = Number(token.value);
        if (!Number.isSafeInteger(value)) throw new ExpressionError("decimal literals are not executable in the hosted int preview", token.position);
        return value;
      }
      if (token.kind === "string") {
        take();
        return token.value;
      }
      if (token.kind === "identifier") {
        take();
        const name = token.value;
        if (/^FIRE$/i.test(name) || /^true$/i.test(name)) return true;
        if (/^HOLD$/i.test(name) || /^false$/i.test(name)) return false;
        const variable = variables.get(name);
        if (!variable) throw new ExpressionError(`unknown identifier '${name}'`, token.position);
        return variable.value;
      }
      if (token.value === "(") {
        take("(");
        const value = concat();
        take(")");
        return value;
      }
      throw new ExpressionError("expected a value", token.position);
    };
    const unary = () => {
      const token = peek();
      if (token.value === "-") {
        take();
        return -numeric(unary(), token);
      }
      if (token.value === "!") {
        take();
        return !truthy(unary(), token);
      }
      return primary();
    };
    const multiply = () => {
      let left = unary();
      while (["*", "/", "%"].includes(peek().value)) {
        const operator = take();
        const right = numeric(unary(), operator);
        const first = numeric(left, operator);
        if ((operator.value === "/" || operator.value === "%") && right === 0) throw new ExpressionError("division by zero", operator.position);
        left = checked(operator.value === "*" ? first * right : operator.value === "/" ? Math.trunc(first / right) : first % right, operator);
      }
      return left;
    };
    const add = () => {
      let left = multiply();
      while (["+", "-"].includes(peek().value)) {
        const operator = take();
        const right = numeric(multiply(), operator);
        const first = numeric(left, operator);
        left = checked(operator.value === "+" ? first + right : first - right, operator);
      }
      return left;
    };
    const compare = () => {
      let left = add();
      while (["<", "<=", ">", ">="].includes(peek().value)) {
        const operator = take();
        const right = numeric(add(), operator);
        const first = numeric(left, operator);
        left = operator.value === "<" ? first < right : operator.value === "<=" ? first <= right : operator.value === ">" ? first > right : first >= right;
      }
      return left;
    };
    const equality = () => {
      let left = compare();
      while (["==", "!="].includes(peek().value)) {
        const operator = take();
        const right = compare();
        left = operator.value === "==" ? left === right : left !== right;
      }
      return left;
    };
    const and = () => {
      let left = equality();
      while (peek().value === "&&") {
        const operator = take();
        left = truthy(left, operator) && truthy(equality(), operator);
      }
      return left;
    };
    const or = () => {
      let left = and();
      while (peek().value === "||") {
        const operator = take();
        left = truthy(left, operator) || truthy(and(), operator);
      }
      return left;
    };
    const concat = () => {
      let left = or();
      while (peek().value === "..") {
        take();
        left = valueText(left) + valueText(or());
      }
      return left;
    };
    const result = concat();
    if (peek().kind !== "eof") throw new ExpressionError(`unexpected token '${peek().value}'`, peek().position);
    return result;
  }
  function stripComments(source) {
    let out = "", mode = "code", quote = "";
    for (let i = 0; i < source.length; i++) {
      const ch = source[i], next = source[i + 1];
      if (mode === "line") {
        if (ch === "\n") {
          mode = "code";
          out += ch;
        } else out += " ";
      } else if (mode === "block") {
        if (ch === "*" && next === "/") {
          out += "  ";
          i++;
          mode = "code";
        } else out += ch === "\n" ? "\n" : " ";
      } else if (mode === "string") {
        out += ch;
        if (ch === "\\" && next != null) {
          out += next;
          i++;
        } else if (ch === quote) mode = "code";
      } else if (ch === "/" && next === "/") {
        out += "  ";
        i++;
        mode = "line";
      } else if (ch === "/" && next === "*") {
        out += "  ";
        i++;
        mode = "block";
      } else {
        out += ch;
        if (ch === '"' || ch === "'") {
          mode = "string";
          quote = ch;
        }
      }
    }
    return out;
  }
  function lineColumn(source, index) {
    const before = source.slice(0, Math.max(0, index));
    const lines = before.split("\n");
    return { line: lines.length, column: (lines[lines.length - 1]?.length || 0) + 1 };
  }
  function findClosingBrace(source, open) {
    let depth = 0, quote = "";
    for (let i = open; i < source.length; i++) {
      const ch = source[i];
      if (quote) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) return i;
    }
    return -1;
  }
  function splitStatements(body, offset) {
    const statements = [];
    let start = 0, quote = "", parens = 0;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (quote) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === "(") parens++;
      else if (ch === ")") parens--;
      else if (ch === ";" && parens === 0) {
        const raw = body.slice(start, i);
        const leading2 = raw.search(/\S/);
        if (leading2 >= 0) statements.push({ text: raw.trim(), index: offset + start + leading2 });
        start = i + 1;
      }
    }
    const rest = body.slice(start);
    const leading = rest.search(/\S/);
    return { statements, trailing: leading >= 0 ? { text: rest.trim(), index: offset + start + leading } : null };
  }
  function compileCoto(source) {
    const clean = stripComments(source);
    const diagnostics = [];
    const variables = /* @__PURE__ */ new Map();
    const addDiagnostic = (severity, code, message, index) => {
      diagnostics.push({ severity, code, message, ...lineColumn(source, index) });
    };
    const programId = clean.match(/PROGRAM-ID\.\s+([A-Z0-9-]+)\s*\./i)?.[1] || "UNTITLED-COTO";
    if (!/IDENTIFICATION\s+DIVISION\./i.test(clean)) addDiagnostic("warning", "COTO2001", "IDENTIFICATION DIVISION is recommended for a visible program contract", 0);
    if (!/PROCEDURE\s+DIVISION\./i.test(clean)) addDiagnostic("warning", "COTO2002", "PROCEDURE DIVISION is recommended for executable source", 0);
    const main = /func\s+int\s+main\s*\(\s*\)\s*\{/i.exec(clean);
    if (!main) {
      addDiagnostic("error", "COTO1001", "expected 'func int main() {' entry point", 0);
      return { ok: false, programId, output: "", priorityEvents: [], returnCode: 1, diagnostics, instructions: 0, variables: {} };
    }
    const open = clean.indexOf("{", main.index), close = findClosingBrace(clean, open);
    if (close < 0) {
      addDiagnostic("error", "COTO1002", "main function is missing a closing '}'", open);
      return { ok: false, programId, output: "", priorityEvents: [], returnCode: 1, diagnostics, instructions: 0, variables: {} };
    }
    const { statements, trailing } = splitStatements(clean.slice(open + 1, close), open + 1);
    if (trailing) addDiagnostic("error", "COTO1003", `missing semicolon after '${trailing.text.slice(0, 28)}${trailing.text.length > 28 ? "\u2026" : ""}'`, trailing.index);
    let output = "", returnCode = 0, returned = false, instructions = 0;
    const priorityEvents = [];
    for (const statement of statements) {
      if (returned) {
        addDiagnostic("warning", "COTO2004", "unreachable statement after return", statement.index);
        continue;
      }
      try {
        let match;
        if (match = /^display\s*\(([\s\S]*)\)$/i.exec(statement.text)) {
          output += valueText(evaluateExpression(match[1], variables));
          instructions++;
        } else if (match = /^makefirst\s*\(([\s\S]*)\)$/i.exec(statement.text)) {
          priorityEvents.push(valueText(evaluateExpression(match[1], variables)));
          instructions++;
        } else if (match = /^return\s+([\s\S]+)$/i.exec(statement.text)) {
          const value = evaluateExpression(match[1], variables);
          if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new ExpressionError("main must return a checked int value");
          returnCode = value;
          returned = true;
          instructions++;
        } else if (match = /^(int|string|bool)\s+([A-Za-z_]\w*)(?:\s*=\s*([\s\S]+))?$/i.exec(statement.text)) {
          const type = match[1].toLowerCase(), name = match[2];
          if (variables.has(name)) throw new ExpressionError(`duplicate variable '${name}'`);
          const value = match[3] != null ? evaluateExpression(match[3], variables) : type === "int" ? 0 : type === "string" ? "" : false;
          const actual = typeof value === "number" ? "int" : typeof value === "string" ? "string" : "bool";
          if (actual !== type || type === "int" && !Number.isSafeInteger(value)) throw new ExpressionError(`type mismatch: ${name} expects ${type}, received ${actual}`);
          variables.set(name, { type, value });
          instructions++;
        } else if (match = /^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/.exec(statement.text)) {
          const variable = variables.get(match[1]);
          if (!variable) throw new ExpressionError(`unknown identifier '${match[1]}'`);
          const value = evaluateExpression(match[2], variables);
          const actual = typeof value === "number" ? "int" : typeof value === "string" ? "string" : "bool";
          if (actual !== variable.type) throw new ExpressionError(`type mismatch: ${match[1]} expects ${variable.type}, received ${actual}`);
          variable.value = value;
          instructions++;
        } else {
          throw new ExpressionError("statement is outside the MiniOS hosted preview subset");
        }
      } catch (error) {
        const expressionError = error instanceof ExpressionError ? error : new ExpressionError(String(error));
        addDiagnostic("error", "COTO1100", expressionError.message, statement.index + expressionError.position);
      }
    }
    if (!returned && !diagnostics.some((item) => item.severity === "error")) addDiagnostic("warning", "COTO2003", "main has no explicit return; preview uses RETURN-CODE 0", close);
    const variableRecord = Object.fromEntries(variables.entries());
    return { ok: !diagnostics.some((item) => item.severity === "error"), programId, output, priorityEvents, returnCode, diagnostics, instructions, variables: variableRecord };
  }
  function checksum(source) {
    let hash = 2166136261;
    for (let i = 0; i < source.length; i++) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }
  function buildCotoModule(source, result) {
    if (!result.ok) return null;
    return {
      format: "minios-vmcoto-preview/1",
      programId: result.programId,
      checksum: checksum(source),
      bytes: new TextEncoder().encode(source).length + result.instructions * 8 + 24,
      instructions: result.instructions,
      capabilities: ["console.display", ...result.priorityEvents.length ? ["priority.dispatch"] : []]
    };
  }

  // src/storage.ts
  var STORAGE_KEY = "minios.state.v2";
  var SEEN_KEY = "minios.onboarding.seen.v2";
  var LEGACY_KEY = "web95.state.v1";
  function extensionStorage() {
    const candidate = globalThis.chrome?.storage?.local;
    return candidate ?? null;
  }
  function readLegacyState() {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function normalizeState(stored, defaults) {
    if (!stored) return defaults;
    const cotoAccent = stored.coto?.accent;
    return {
      ...defaults,
      ...stored,
      version: 2,
      appearance: stored.appearance === "macos9" ? "macos9" : "win95",
      shell: stored.shell === "bash" || stored.shell === "zsh" || stored.shell === "coto" ? stored.shell : "powershell",
      fs: stored.fs ?? defaults.fs,
      notes: stored.notes ?? defaults.notes,
      npp: { ...defaults.npp, ...stored.npp ?? {} },
      iconPos: stored.iconPos ?? {},
      coto: {
        ...defaults.coto,
        ...stored.coto ?? {},
        accent: cotoAccent === "coral" || cotoAccent === "mint" || cotoAccent === "orbit" ? cotoAccent : defaults.coto.accent,
        captures: Array.isArray(stored.coto?.captures) ? stored.coto.captures : defaults.coto.captures
      }
    };
  }
  function createStateStore(createDefaults) {
    const storage = extensionStorage();
    return {
      async load() {
        if (storage) {
          const result = await storage.get(STORAGE_KEY);
          const stored = result[STORAGE_KEY];
          if (stored) return normalizeState(stored, createDefaults());
          const legacy = readLegacyState();
          const migrated = normalizeState(legacy, createDefaults());
          if (legacy) {
            await storage.set({ [STORAGE_KEY]: migrated });
            localStorage.removeItem(LEGACY_KEY);
          }
          return migrated;
        }
        return normalizeState(readLegacyState(), createDefaults());
      },
      async save(state) {
        if (storage) {
          await storage.set({ [STORAGE_KEY]: state });
          return;
        }
        localStorage.setItem(LEGACY_KEY, JSON.stringify(state));
      },
      async clear() {
        if (storage) await storage.remove([STORAGE_KEY, SEEN_KEY]);
        try {
          localStorage.removeItem(LEGACY_KEY);
          localStorage.removeItem(`${LEGACY_KEY}.seen`);
        } catch {
        }
      },
      async hasSeenOnboarding() {
        if (storage) {
          const result = await storage.get(SEEN_KEY);
          return result[SEEN_KEY] === true;
        }
        try {
          return localStorage.getItem(`${LEGACY_KEY}.seen`) === "1";
        } catch {
          return true;
        }
      },
      async markOnboardingSeen() {
        if (storage) {
          await storage.set({ [SEEN_KEY]: true });
          return;
        }
        try {
          localStorage.setItem(`${LEGACY_KEY}.seen`, "1");
        } catch {
        }
      }
    };
  }

  // src/themes.ts
  var AS_EXTENSION = /^(chrome|moz)-extension:$/.test(location.protocol);
  var WINDOWS_LOGO = "Windows_Logo_(1992-2001).svg";
  var svg = (source) => "data:image/svg+xml;utf8," + encodeURIComponent(source);
  var COTO_ECOSYSTEM_ICON = "assets/coto/icon.png";
  var sharedIcons = {
    terminal: svg(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect x="2" y="3" width="28" height="26" fill="#c0c0c0" stroke="#000" stroke-width="1.5"/><rect x="4" y="7" width="24" height="20" fill="#000080"/><text x="6" y="18" font-family="monospace" font-size="9" fill="#fff">&gt;_</text></svg>`),
    bash: svg(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect x="2" y="3" width="28" height="26" fill="#c0c0c0" stroke="#000" stroke-width="1.5"/><rect x="4" y="7" width="24" height="20" fill="#0c0c0c"/><text x="6" y="18" font-family="monospace" font-size="9" fill="#78dc52">$_</text></svg>`),
    zsh: svg(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect x="2" y="3" width="28" height="26" fill="#c0c0c0" stroke="#000" stroke-width="1.5"/><rect x="4" y="7" width="24" height="20" fill="#151515"/><text x="6" y="18" font-family="monospace" font-size="9" fill="#ff7ad9">%_</text></svg>`),
    cotosh: svg(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><defs><linearGradient id="cs" x1="4" y1="4" x2="28" y2="28"><stop stop-color="#8068ef"/><stop offset="1" stop-color="#2b214d"/></linearGradient></defs><rect x="2" y="3" width="28" height="26" rx="3" fill="#c0c0c0" stroke="#000" stroke-width="1.5"/><rect x="4" y="7" width="24" height="20" rx="1" fill="url(#cs)"/><text x="6" y="19" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">CS\u203A</text><circle cx="25" cy="9" r="2" fill="#82e6bc"/></svg>`),
    npp: svg(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M5 2h19l4 4v24H5z" fill="#fff" stroke="#000"/><path d="M24 2v5h5" fill="#c0c0c0" stroke="#000"/><rect x="7" y="5" width="15" height="4" fill="#249c3d"/><path d="M8 13h12M8 17h9M8 21h12" stroke="#555"/><rect x="18" y="19" width="12" height="12" fill="#249c3d" stroke="#000"/><path d="M24 21v8M20 25h8" stroke="#fff" stroke-width="2"/></svg>`),
    shutdown: svg(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="17" r="11" fill="#c0c0c0" stroke="#000" stroke-width="1.5"/><path d="M16 5v12" stroke="#c00" stroke-width="4"/></svg>`),
    warn: svg(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M16 2l14 27H2z" fill="#ffd700" stroke="#000" stroke-width="1.5"/><text x="13" y="26" font-family="serif" font-size="17" font-weight="bold">!</text></svg>`),
    coto: COTO_ECOSYSTEM_ICON
  };
  var win95Icons = {
    ...sharedIcons,
    folder: "assets/folder.ico",
    folderOpen: "assets/folder-open.ico",
    link: "assets/link.ico",
    notepad: "assets/notepad.ico",
    settings: "assets/settings.ico",
    computer: "assets/computer.ico",
    help: "assets/help.ico",
    find: "assets/find.ico",
    run: "assets/run.ico",
    win: "assets/flag.ico",
    recycle: "assets/recycle.ico",
    up: "assets/up.ico"
  };
  var macos9Icons = {
    ...sharedIcons,
    folder: "assets/mac/folder.png",
    folderOpen: "assets/mac/folder-open.png",
    link: "assets/mac/internet.png",
    notepad: "assets/mac/notepad.png",
    settings: "assets/mac/settings.png",
    computer: "assets/mac/computer.png",
    help: "assets/mac/help.png",
    find: "assets/mac/find.png",
    run: "assets/mac/run.png",
    win: "assets/mac/system.png",
    recycle: "assets/mac/trash.png",
    up: "assets/up.ico"
  };
  var THEMES = {
    win95: {
      id: "win95",
      name: "Windows 95",
      shortName: "MiniOS 95",
      launcherLabel: "Start",
      launcherTitle: "Click here to begin",
      computerName: "My Computer",
      icons: win95Icons,
      wallpapers: [
        { name: "Classic Flag", src: WINDOWS_LOGO, mode: "fit", size: 45, color: "#008080" },
        { name: "Windows 95", src: "Wallpaper/WindowsbyMicrosoft.webp", mode: "stretch", size: 100, color: "#3f70a5" },
        { name: "Vaporwave 95", src: "Wallpaper/aesthetic-background-ktolv5jc30xsjwm8.jpg", mode: "stretch", size: 100, color: "#25133b" },
        { name: "Green Hills", src: "Wallpaper/a7a20e9a4c0c5ed6af6cbaf3c268d701.jpg", mode: "stretch", size: 100, color: "#3a6ea5" }
      ],
      menu: { applications: "Programs", favorites: "Favorites", computer: "My Computer", settings: "Settings", shutdown: "Shut Down\u2026" }
    },
    macos9: {
      id: "macos9",
      name: "Mac OS 9",
      shortName: "MiniOS 9",
      launcherLabel: "Menu",
      launcherTitle: "Apple menu",
      computerName: "Macintosh HD",
      icons: macos9Icons,
      wallpapers: [
        { name: "Mac OS 9 Blue", src: "assets/mac/mac-os-9-wallpaper.svg", mode: "tile", size: 100, color: "#5f89b4" },
        { name: "Clouds", src: "Wallpaper/Clouds_(Windows_95).png", mode: "stretch", size: 100, color: "#789bc1" }
      ],
      menu: { applications: "Applications", favorites: "Favorites", computer: "Macintosh HD", settings: "Control Panels", shutdown: "Shut Down\u2026" }
    }
  };
  function themeFor(appearance) {
    return THEMES[appearance === "macos9" ? "macos9" : "win95"];
  }
  function applyThemeIdentity(theme) {
    document.documentElement.dataset.os = theme.id;
    document.title = `${theme.shortName} \u2014 A nicer place to start`;
  }

  // src/main.ts
  async function boot() {
    "use strict";
    const AS_EXT = AS_EXTENSION;
    const LOGO = WINDOWS_LOGO;
    let WALLPAPER_PRESETS = themeFor("win95").wallpapers;
    let ICONS = themeFor("win95").icons;
    let uid = 0;
    const nid = () => "n" + Date.now().toString(36) + (uid++).toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const F = (name, children) => ({ id: nid(), type: "folder", name, children });
    const L = (name, url) => ({ id: nid(), type: "link", name, url });
    function defaultFS() {
      return F("C:", [
        F("Daily", [
          L("Gmail", "https://mail.google.com"),
          L("Calendar", "https://calendar.google.com"),
          L("Drive", "https://drive.google.com"),
          L("Proton Mail", "https://mail.proton.me"),
          L("Weather", "https://weather.com"),
          L("Maps", "https://maps.google.com")
        ]),
        F("Dev", [
          L("GitHub", "https://github.com"),
          L("Stack Overflow", "https://stackoverflow.com"),
          L("MDN", "https://developer.mozilla.org"),
          L("npm", "https://www.npmjs.com"),
          L("Regex101", "https://regex101.com"),
          L("CanIUse", "https://caniuse.com"),
          L("Localhost 3000", "http://localhost:3000")
        ]),
        F("AI", [
          L("Claude", "https://claude.ai"),
          L("Claude Code Docs", "https://docs.claude.com/en/docs/claude-code/overview"),
          L("Anthropic Console", "https://console.anthropic.com"),
          L("Hugging Face", "https://huggingface.co")
        ]),
        F("Media", [
          L("YouTube", "https://youtube.com"),
          L("Spotify", "https://open.spotify.com"),
          L("Netflix", "https://netflix.com"),
          L("Twitch", "https://twitch.tv"),
          L("Internet Archive", "https://archive.org")
        ]),
        F("Social", [
          L("Reddit", "https://reddit.com"),
          L("Hacker News", "https://news.ycombinator.com"),
          L("X", "https://x.com"),
          L("Discord", "https://discord.com/app"),
          L("LinkedIn", "https://linkedin.com")
        ]),
        F("News", [
          L("AP News", "https://apnews.com"),
          L("BBC", "https://bbc.com/news"),
          L("Ars Technica", "https://arstechnica.com"),
          L("The Verge", "https://theverge.com")
        ]),
        F("Tools", [
          L("Speedtest", "https://fast.com"),
          L("Translate", "https://translate.google.com"),
          L("Excalidraw", "https://excalidraw.com"),
          L("PDF tools", "https://stirlingpdf.io")
        ])
      ]);
    }
    const ENGINES = {
      duckduckgo: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
      google: { name: "Google", url: "https://www.google.com/search?q=" },
      bing: { name: "Bing", url: "https://www.bing.com/search?q=" },
      brave: { name: "Brave", url: "https://search.brave.com/search?q=" },
      startpage: { name: "Startpage", url: "https://www.startpage.com/sp/search?query=" },
      perplexity: { name: "Perplexity", url: "https://www.perplexity.ai/search?q=" }
    };
    const SHELLS = {
      powershell: { label: "PowerShell", short: "PS", cls: "ps", icon: ICONS.terminal },
      bash: { label: "Bash", short: "sh", cls: "bash", icon: ICONS.bash },
      zsh: { label: "Zsh", short: "zsh", cls: "zsh", icon: ICONS.zsh },
      coto: { label: "Coto Shell (CS)", short: "CS", cls: "coto-shell", icon: ICONS.cotosh }
    };
    const defaults = () => ({
      version: 2,
      appearance: "win95",
      shell: "powershell",
      engine: "duckduckgo",
      linkTarget: "same",
      // "same" | "new"
      desktopColor: "#008080",
      wallpaper: LOGO,
      // filename beside index.html, a URL, or "" for none
      wallpaperMode: "fit",
      // fit | center | tile | stretch
      wallpaperSize: 45,
      // fit mode: height as a % of the desktop
      wallpaperFade: 100,
      // 0-100, how strongly it shows over the desktop colour
      user: "matt",
      host: "web95",
      showOmni: true,
      showToday: true,
      crtEffect: true,
      npp: { name: "Welcome.txt", language: "Plain text", wrap: false, fontSize: 12, text: "Welcome to MiniEditor!\n\nYour work is saved automatically in this browser.\nOpen or drop a text file to edit it, and use Download to keep a copy.\n\nShortcuts: Ctrl+S save \xB7 Ctrl+F find \xB7 Ctrl+H replace \xB7 Ctrl+G go to line\n" },
      notes: { welcome: "MiniOS scratch pad\n==================\n\nThis text is saved in your browser.\n" },
      iconPos: {},
      coto: {
        accent: "orbit",
        sourceName: COTO_SAMPLES.hello.name,
        source: COTO_SAMPLES.hello.source,
        captures: [
          { id: "coto-welcome", text: "Shape one small idea into something useful", done: false, createdAt: Date.now() }
        ]
      },
      fs: defaultFS()
    });
    const stateStore = createStateStore(defaults);
    let state = await stateStore.load();
    let activeTheme = themeFor(state.appearance);
    ICONS = activeTheme.icons;
    WALLPAPER_PRESETS = activeTheme.wallpapers;
    applyThemeIdentity(activeTheme);
    async function wipe() {
      clearTimeout(saveTimer);
      await stateStore.clear();
    }
    let saveTimer = null;
    function save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        void stateStore.save(state).catch((error) => console.error("Could not save MiniOS state", error));
      }, 120);
    }
    function setAppearance(appearance) {
      if (state.appearance === appearance) return;
      const previousTheme = activeTheme;
      const usedThemeWallpaper = previousTheme.wallpapers.some((preset) => preset.src === state.wallpaper);
      state.appearance = appearance;
      activeTheme = themeFor(appearance);
      ICONS = activeTheme.icons;
      WALLPAPER_PRESETS = activeTheme.wallpapers;
      if (usedThemeWallpaper && activeTheme.wallpapers[0]) {
        const preset = activeTheme.wallpapers[0];
        state.wallpaper = preset.src;
        state.wallpaperMode = preset.mode;
        state.wallpaperSize = preset.size;
        state.desktopColor = preset.color;
      }
      applyThemeIdentity(activeTheme);
      save();
      applyChrome();
      refreshWindowIcons();
      refreshAll();
    }
    let byId = {}, parentOf = {};
    function reindex() {
      byId = {};
      parentOf = {};
      (function walk(n, p) {
        byId[n.id] = n;
        parentOf[n.id] = p;
        if (n.type === "folder") (n.children || []).forEach((c) => walk(c, n));
      })(state.fs, null);
    }
    reindex();
    const isFolder = (n) => !!n && n.type === "folder";
    function pathOf(node) {
      const out = [];
      let n = node;
      while (n) {
        out.unshift(n);
        n = parentOf[n.id];
      }
      return out;
    }
    function pathString(node, style) {
      const p = pathOf(node);
      if (style === "mac") {
        return p.length === 1 ? activeTheme.computerName : activeTheme.computerName + ":" + p.slice(1).map((n) => n.name).join(":");
      }
      if (style === "win") {
        return p.length === 1 ? "C:\\" : "C:\\" + p.slice(1).map((n) => n.name).join("\\");
      }
      return p.length === 1 ? "~" : "~/" + p.slice(1).map((n) => n.name).join("/");
    }
    function findChild(folder, name) {
      return (folder.children || []).find((c) => c.name.toLowerCase() === String(name).toLowerCase());
    }
    function uniqueName(folder, base) {
      let name = base, i = 2;
      while (findChild(folder, name)) name = base + " (" + i++ + ")";
      return name;
    }
    function addNode(folder, node) {
      folder.children = folder.children || [];
      node.name = uniqueName(folder, node.name);
      folder.children.push(node);
      reindex();
      save();
      refreshAll();
      return node;
    }
    function removeNode(node) {
      const p = parentOf[node.id];
      if (!p) return false;
      p.children = p.children.filter((c) => c.id !== node.id);
      delete state.iconPos[node.id];
      reindex();
      save();
      refreshAll();
      return true;
    }
    function renameNode(node, name) {
      const p = parentOf[node.id];
      node.name = p ? uniqueName(p, name) : name;
      save();
      refreshAll();
    }
    function moveNode(node, dest) {
      if (!isFolder(dest) || node === dest) return false;
      if (pathOf(dest).some((n) => n.id === node.id)) return false;
      const p = parentOf[node.id];
      if (p) p.children = p.children.filter((c) => c.id !== node.id);
      dest.children = dest.children || [];
      node.name = uniqueName(dest, node.name);
      dest.children.push(node);
      reindex();
      save();
      refreshAll();
      return true;
    }
    function normalizeUrl(u) {
      u = String(u).trim();
      if (!u) return "";
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u) || /^(mailto|about|chrome|edge|brave|file):/i.test(u)) return u;
      return "https://" + u.replace(/^\/+/, "");
    }
    function looksLikeUrl(s) {
      s = s.trim();
      if (!s || /\s/.test(s)) return /^(https?|file|chrome|edge|brave|about):/i.test(s);
      return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^localhost(:\d+)?(\/|$)/i.test(s) || /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(s);
    }
    const SCHEME = (u) => (String(u).match(/^([a-z][a-z0-9+.-]*):/i) || [, ""])[1].toLowerCase();
    function blockedAddress(url, why) {
      const internal = SCHEME(url) !== "file";
      dialog({
        title: "Cannot open that address",
        msgIcon: ICONS.warn,
        message: (internal ? "Browsers do not let an extension page open " + SCHEME(url) + ": addresses.\n\nCopy it into the address bar yourself:" : `This page cannot open local files unless you allow it.

On the extensions page, open ${activeTheme.shortName}'s details and turn on \u201CAllow access to file URLs\u201D \u2014 or paste this into the address bar:`) + (why ? "\n\n(" + why + ")" : ""),
        fields: [{ key: "url", label: "", value: url }],
        buttons: [{ label: "OK", value: true, primary: true }]
      });
    }
    function go(url) {
      url = normalizeUrl(url);
      if (!url) return;
      const s = SCHEME(url);
      if (AS_EXT && /^(chrome|edge|brave|about|view-source|javascript|chrome-extension|data)$/.test(s) && url !== location.href) {
        blockedAddress(url);
        return;
      }
      if (AS_EXT && s === "file") {
        if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
          chrome.tabs.create({ url }, () => {
            const err = chrome.runtime && chrome.runtime.lastError;
            if (err) blockedAddress(url, err.message);
          });
        } else blockedAddress(url);
        return;
      }
      if (state.linkTarget === "new") window.open(url, "_blank", "noopener");
      else window.location.href = url;
    }
    function searchUrl(q) {
      return ENGINES[state.engine].url + encodeURIComponent(q);
    }
    function iconFor(n) {
      return isFolder(n) ? ICONS.folder : ICONS.link;
    }
    function two(n) {
      return String(n).padStart(2, "0");
    }
    let zTop = 100;
    const wins = [];
    const desktop = $("#desktop");
    function makeWindow(opts) {
      const o = Object.assign({ title: "Window", icon: ICONS.computer, w: 640, h: 420, x: null, y: null, kind: "generic" }, opts);
      const w = { id: "w" + uid++, title: o.title, icon: o.icon, kind: o.kind, min: false, max: false, prev: null, api: {} };
      const node = el("div", "win");
      const dw = desktop.clientWidth, dh = desktop.clientHeight;
      const W = Math.min(o.w, dw - 20), H = Math.min(o.h, dh - 20);
      const offset = wins.length % 7 * 22;
      node.style.width = W + "px";
      node.style.height = H + "px";
      node.style.left = (o.x != null ? o.x : Math.max(8, Math.round((dw - W) / 2) - 60 + offset)) + "px";
      node.style.top = (o.y != null ? o.y : Math.max(8, Math.round((dh - H) / 2) - 40 + offset)) + "px";
      const tbar = el("div", "tbar");
      const ti = el("img", "ti");
      ti.src = o.icon;
      ti.alt = "";
      const tt = el("div", "tt", o.title);
      const btns = el("div", "btns");
      const bMin = el("button", null, "_");
      bMin.title = "Minimize";
      const bMax = el("button", null, "\u25A1");
      bMax.title = "Maximize";
      const bCls = el("button", null, "\u2715");
      bCls.title = "Close";
      btns.append(bMin, bMax, bCls);
      tbar.append(ti, tt, btns);
      const body = el("div", "wbody");
      const grip = el("div", "grip");
      node.append(tbar, body, grip);
      desktop.appendChild(node);
      w.node = node;
      w.body = body;
      w.titleEl = tt;
      w.iconEl = ti;
      w.setTitle = (t) => {
        w.title = t;
        tt.textContent = t;
        syncTasks();
      };
      w.close = () => {
        if (w.onClose) try {
          w.onClose();
        } catch (e) {
        }
        node.remove();
        const i = wins.indexOf(w);
        if (i >= 0) wins.splice(i, 1);
        syncTasks();
        const last = wins.filter((x) => !x.min).pop();
        if (last) focusWin(last);
      };
      w.minimize = () => {
        w.min = true;
        node.classList.add("min");
        syncTasks();
      };
      w.restore = () => {
        w.min = false;
        node.classList.remove("min");
        focusWin(w);
      };
      w.toggleMax = () => {
        if (w.max) {
          Object.assign(node.style, w.prev);
          w.max = false;
          bMax.textContent = "\u25A1";
        } else {
          w.prev = { left: node.style.left, top: node.style.top, width: node.style.width, height: node.style.height };
          Object.assign(node.style, { left: "0px", top: "0px", width: desktop.clientWidth + "px", height: desktop.clientHeight + "px" });
          w.max = true;
          bMax.textContent = "\u2750";
        }
        if (w.onResize) w.onResize();
      };
      bMin.onclick = (e) => {
        e.stopPropagation();
        w.minimize();
      };
      bMax.onclick = (e) => {
        e.stopPropagation();
        w.toggleMax();
      };
      bCls.onclick = (e) => {
        e.stopPropagation();
        w.close();
      };
      tbar.addEventListener("dblclick", (e) => {
        if (e.target.closest("button") || performance.now() < (w.suppressTitlebarDoubleClickUntil || 0)) return;
        w.toggleMax();
      });
      node.addEventListener("pointerdown", () => focusWin(w), true);
      dragify(tbar, node, w);
      resizify(grip, node, w);
      wins.push(w);
      focusWin(w);
      syncTasks();
      return w;
    }
    function focusWin(w) {
      const changed = active !== w || w.min;
      if (!changed) {
        if (w.onFocus) w.onFocus();
        return;
      }
      wins.forEach((x) => x.node.classList.add("blur"));
      w.node.classList.remove("blur");
      w.node.style.zIndex = String(++zTop);
      w.min = false;
      w.node.classList.remove("min");
      active = w;
      syncTasks();
      if (w.onFocus) w.onFocus();
    }
    let active = null;
    function trackPointerDrag(event, captureNode, options) {
      if (!event.isPrimary || event.button !== 0) return false;
      event.preventDefault();
      const pointerId = event.pointerId;
      const startX = event.clientX, startY = event.clientY;
      const threshold = Math.max(0, options.threshold ?? 3);
      let dx = 0, dy = 0, frame = 0, activeGesture = true;
      let moved = threshold === 0;
      const render = () => {
        frame = 0;
        if (activeGesture && moved) options.onMove(dx, dy);
      };
      const move = (nextEvent) => {
        if (nextEvent.pointerId !== pointerId || !activeGesture) return;
        const coalesced = nextEvent.getCoalescedEvents?.();
        const sample = coalesced?.length ? coalesced[coalesced.length - 1] : nextEvent;
        const nextDx = sample.clientX - startX, nextDy = sample.clientY - startY;
        if (!moved) {
          if (nextDx * nextDx + nextDy * nextDy < threshold * threshold) return;
          moved = true;
          options.onStart?.();
        }
        dx = nextDx;
        dy = nextDy;
        nextEvent.preventDefault();
        if (!frame) frame = requestAnimationFrame(render);
      };
      const cleanup = () => {
        captureNode.removeEventListener("lostpointercapture", lostCapture);
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", end, true);
        window.removeEventListener("pointercancel", cancel, true);
        window.removeEventListener("mouseup", mouseEnd, true);
      };
      const finish = (cancelled) => {
        if (!activeGesture) return;
        if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
          if (moved && !cancelled) options.onMove(dx, dy);
        }
        activeGesture = false;
        cleanup();
        try {
          if (captureNode.hasPointerCapture(pointerId)) captureNode.releasePointerCapture(pointerId);
        } catch (e) {
        }
        options.onEnd({ dx, dy, moved, cancelled });
      };
      const end = (nextEvent) => {
        if (nextEvent.pointerId === pointerId) finish(false);
      };
      const cancel = (nextEvent) => {
        if (nextEvent.pointerId === pointerId) finish(true);
      };
      const lostCapture = (nextEvent) => {
        if (nextEvent.pointerId === pointerId) finish(true);
      };
      const mouseEnd = (nextEvent) => {
        if (nextEvent.button === 0) finish(false);
      };
      captureNode.addEventListener("lostpointercapture", lostCapture);
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", end, true);
      window.addEventListener("pointercancel", cancel, true);
      window.addEventListener("mouseup", mouseEnd, true);
      try {
        captureNode.setPointerCapture(pointerId);
      } catch (e) {
      }
      if (moved) options.onStart?.();
      return true;
    }
    function dragify(handle, node, w) {
      handle.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button") || w.max) return;
        const ox = node.offsetLeft, oy = node.offsetTop;
        const ow = node.offsetWidth, dw = desktop.clientWidth, dh = desktop.clientHeight;
        let dx = 0, dy = 0;
        trackPointerDrag(e, handle, {
          onStart: () => node.classList.add("dragging"),
          onMove: (rawDx, rawDy) => {
            dx = Math.min(Math.max(rawDx, -ow + 60 - ox), dw - 40 - ox);
            dy = Math.min(Math.max(rawDy, -oy), dh - 24 - oy);
            node.style.transform = `translate3d(${dx}px,${dy}px,0)`;
          },
          onEnd: ({ moved, cancelled }) => {
            node.style.transform = "";
            node.classList.remove("dragging");
            if (moved && !cancelled) {
              node.style.left = ox + dx + "px";
              node.style.top = oy + dy + "px";
              w.suppressTitlebarDoubleClickUntil = performance.now() + 300;
            }
          }
        });
      });
    }
    function resizify(grip, node, w) {
      grip.addEventListener("pointerdown", (e) => {
        if (w.max) return;
        e.stopPropagation();
        const ow = node.offsetWidth, oh = node.offsetHeight;
        const maxWidth = Math.max(220, desktop.clientWidth - node.offsetLeft);
        const maxHeight = Math.max(120, desktop.clientHeight - node.offsetTop);
        let width = ow, height = oh;
        trackPointerDrag(e, grip, {
          threshold: 0,
          onStart: () => node.classList.add("resizing"),
          onMove: (dx, dy) => {
            width = Math.min(maxWidth, Math.max(Math.min(240, maxWidth), ow + dx));
            height = Math.min(maxHeight, Math.max(Math.min(140, maxHeight), oh + dy));
            node.style.width = width + "px";
            node.style.height = height + "px";
            if (w.onResize) w.onResize();
          },
          onEnd: ({ cancelled }) => {
            if (cancelled) {
              node.style.width = ow + "px";
              node.style.height = oh + "px";
              if (w.onResize) w.onResize();
            }
            node.classList.remove("resizing");
          }
        });
      });
    }
    function syncTasks() {
      const box = $("#tasks");
      box.innerHTML = "";
      wins.forEach((w) => {
        const b = el("button", "task out");
        const i = el("img");
        i.src = w.icon;
        i.alt = "";
        b.append(i, el("span", null, w.title));
        if (active === w && !w.min) b.classList.add("pressed");
        b.onclick = () => {
          active === w && !w.min ? w.minimize() : w.restore();
        };
        box.appendChild(b);
      });
    }
    function dialog(opts) {
      return new Promise((resolve2) => {
        const wrap = $("#modalwrap"), m = $("#modal");
        m.innerHTML = "";
        const tbar = el("div", "tbar");
        const ti = el("img", "ti");
        ti.src = opts.icon || ICONS.settings;
        ti.alt = "";
        const tt = el("div", "tt", opts.title || activeTheme.shortName);
        const x = el("button", null, "\u2715");
        tbar.append(ti, tt, (() => {
          const d = el("div", "btns");
          d.append(x);
          return d;
        })());
        m.appendChild(tbar);
        const body = el("div", "mbody");
        if (opts.message) {
          const msg = el("div", "msg");
          const im = el("img");
          im.src = opts.msgIcon || ICONS.help;
          im.alt = "";
          msg.append(im, el("div", null, opts.message));
          body.appendChild(msg);
        }
        const inputs = {};
        (opts.fields || []).forEach((f) => {
          const box = el("div", "f");
          if (f.label) box.appendChild(el("label", null, f.label));
          const inp = f.type === "textarea" ? el("textarea") : el("input");
          if (inp instanceof HTMLInputElement) inp.type = "text";
          inp.value = f.value || "";
          inp.spellcheck = false;
          box.appendChild(inp);
          inputs[f.key] = inp;
          body.appendChild(box);
        });
        m.appendChild(body);
        const foot = el("div", "mfoot");
        const buttons = opts.buttons || [{ label: "OK", value: true, primary: true }, { label: "Cancel", value: null }];
        buttons.forEach((b) => {
          const btn = el("button", null, b.label);
          btn.onclick = () => finish(b.value === void 0 ? b.label : b.value);
          foot.appendChild(btn);
        });
        m.appendChild(foot);
        wrap.classList.add("open");
        m.style.zIndex = String(++zTop);
        const first = Object.values(inputs)[0];
        if (first) {
          first.focus();
          first.select();
        } else foot.querySelector("button").focus();
        function finish(val) {
          wrap.classList.remove("open");
          document.removeEventListener("keydown", key, true);
          if (val === null || val === false) {
            resolve2(null);
            return;
          }
          const out = {};
          Object.keys(inputs).forEach((k) => out[k] = inputs[k].value);
          resolve2(Object.keys(inputs).length ? out : val);
        }
        function key(e) {
          if (e.key === "Escape") {
            e.preventDefault();
            finish(null);
          }
          if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
            e.preventDefault();
            const p = buttons.find((b) => b.primary) || buttons[0];
            finish(p.value === void 0 ? p.label : p.value);
          }
        }
        document.addEventListener("keydown", key, true);
        x.onclick = () => finish(null);
      });
    }
    const say = (message, title) => dialog({ title: title || activeTheme.shortName, message, msgIcon: ICONS.help, buttons: [{ label: "OK", value: true, primary: true }] });
    const ask = (message, title) => dialog({
      title: title || "Confirm",
      message,
      msgIcon: ICONS.warn,
      buttons: [{ label: "Yes", value: true, primary: true }, { label: "No", value: null }]
    }).then((r) => !!r);
    const ctx = $("#ctx");
    function menu(x, y, items) {
      ctx.innerHTML = "";
      items.forEach((it) => {
        if (it === "-") {
          ctx.appendChild(el("div", "mdiv"));
          return;
        }
        const m = el("div", "mi" + (it.disabled ? " disabled" : ""));
        m.appendChild(el("span", null, it.label));
        if (!it.disabled) m.onclick = () => {
          hideMenus();
          it.action && it.action();
        };
        ctx.appendChild(m);
      });
      ctx.classList.add("open");
      ctx.style.zIndex = String(++zTop);
      const w = ctx.offsetWidth, h = ctx.offsetHeight;
      ctx.style.left = Math.min(x, window.innerWidth - w - 4) + "px";
      ctx.style.top = Math.min(y, window.innerHeight - h - 4) + "px";
    }
    function hideMenus() {
      ctx.classList.remove("open");
      $("#startmenu").classList.remove("open");
      $("#start").classList.remove("pressed");
      document.querySelectorAll(".submenu.open").forEach((s) => s.classList.remove("open"));
    }
    document.addEventListener("pointerdown", (e) => {
      const target = e.target;
      if (!ctx.contains(target) && !$("#startmenu").contains(target) && !$("#start").contains(target)) hideMenus();
    });
    document.addEventListener("contextmenu", (e) => e.preventDefault());
    function openNode(n) {
      if (isFolder(n)) openExplorer(n);
      else go(n.url);
    }
    function nodeMenu(n, x, y, ctxFolder) {
      const items = [
        { label: "Open", action: () => openNode(n) },
        { label: "Open in new tab", disabled: isFolder(n), action: () => window.open(normalizeUrl(n.url), "_blank", "noopener") },
        "-",
        { label: "Rename\u2026", action: async () => {
          const r = await dialog({ title: "Rename", fields: [{ key: "name", label: "New name:", value: n.name }] });
          if (r && r.name.trim()) renameNode(n, r.name.trim());
        } },
        { label: "Move to\u2026", action: () => moveDialog(n) },
        { label: "Delete", action: async () => {
          if (await ask("Are you sure you want to delete '" + n.name + "'?", "Confirm Delete")) removeNode(n);
        } },
        "-",
        { label: "Properties\u2026", action: () => propsDialog(n) }
      ];
      menu(x, y, items);
    }
    function newItemsMenu(folder) {
      return [
        { label: "New Folder", action: async () => {
          const r = await dialog({ title: "New Folder", fields: [{ key: "name", label: "Folder name:", value: "New Folder" }] });
          if (r && r.name.trim()) addNode(folder, F(r.name.trim(), []));
        } },
        { label: "New Shortcut\u2026", action: async () => {
          const r = await dialog({ title: "New Shortcut", fields: [
            { key: "name", label: "Name:", value: "" },
            { key: "url", label: "Address (URL):", value: "https://" }
          ] });
          if (r && r.url.trim() && r.url.trim() !== "https://") {
            const url = normalizeUrl(r.url);
            let name = r.name.trim();
            if (!name) {
              try {
                name = new URL(url).hostname.replace(/^www\./, "");
              } catch (e) {
                name = "Shortcut";
              }
            }
            addNode(folder, L(name, url));
          }
        } }
      ];
    }
    async function propsDialog(n) {
      if (isFolder(n)) {
        const count = (n.children || []).length;
        await say(n.name + "\n\nType: Folder\nLocation: " + pathString(n, "win") + "\nContains: " + count + " item(s)", n.name + " Properties");
      } else {
        const r = await dialog({ title: n.name + " Properties", fields: [
          { key: "name", label: "Name:", value: n.name },
          { key: "url", label: "Target address:", value: n.url }
        ] });
        if (r) {
          if (r.name.trim()) renameNode(n, r.name.trim());
          if (r.url.trim()) {
            n.url = normalizeUrl(r.url);
            save();
            refreshAll();
          }
        }
      }
    }
    async function moveDialog(n) {
      const folders = [];
      (function walk(f) {
        folders.push(f);
        (f.children || []).filter(isFolder).forEach(walk);
      })(state.fs);
      const opts = folders.filter((f) => f !== n && !pathOf(f).some((p) => p.id === n.id));
      const list = opts.map((f) => pathString(f, "win")).join("\n");
      const r = await dialog({
        title: "Move '" + n.name + "'",
        message: "Type the destination path:\n\nAvailable:\n" + list,
        fields: [{ key: "dest", label: "Destination:", value: "C:\\" }]
      });
      if (!r) return;
      const dest = resolve(r.dest, state.fs);
      if (!dest || !isFolder(dest)) {
        say("Cannot find folder: " + r.dest, "Move");
        return;
      }
      if (!moveNode(n, dest)) say("That move isn't possible.", "Move");
    }
    const SYSTEM_ICONS = [
      { id: "sys:computer", name: () => activeTheme.computerName, icon: () => ICONS.computer, action: () => openExplorer(state.fs) },
      { id: "sys:term", name: () => SHELLS[state.shell].label, icon: () => SHELLS[state.shell].icon, action: () => openTerminal() },
      { id: "sys:notepad", name: "Notepad", icon: () => ICONS.notepad, action: () => openNotepad("welcome") },
      { id: "sys:npp", name: "MiniEditor", icon: () => ICONS.npp, action: () => openMiniEditor() },
      { id: "sys:coto", name: "Coto Ecosystem", icon: () => ICONS.coto, action: () => openCoto() },
      { id: "sys:settings", name: () => activeTheme.menu.settings, icon: () => ICONS.settings, action: () => openSettings() },
      { id: "sys:help", name: "Read Me", icon: () => ICONS.help, action: () => openHelp() }
    ];
    function freeSlots(count) {
      const pad = 12, cw = 84, ch = 84, iw = 76, ih = 70;
      const maxY = Math.max(pad, desktop.clientHeight - ih - 6);
      const maxCol = Math.max(1, Math.floor((desktop.clientWidth - pad) / cw));
      let o = null;
      if (state.showOmni) {
        const r = $("#omni").getBoundingClientRect();
        if (r.width) o = { left: r.left - 8, top: r.top - 8, right: r.right + 8, bottom: r.bottom + 8 };
      }
      const out = [];
      for (let col = 0; col < maxCol + 4 && out.length < count; col++) {
        const x = pad + col * cw;
        for (let y = pad; y <= maxY && out.length < count; y += ch) {
          if (o && !(x + iw < o.left || x > o.right || y + ih < o.top || y > o.bottom)) continue;
          out.push({ x, y });
        }
      }
      while (out.length < count) out.push({ x: pad, y: pad });
      return out;
    }
    function clampDesktopPoint(x, y, width, height) {
      const safeX = Number.isFinite(x) ? Math.round(x) : 0;
      const safeY = Number.isFinite(y) ? Math.round(y) : 0;
      return {
        x: Math.max(0, Math.min(safeX, Math.max(0, desktop.clientWidth - width))),
        y: Math.max(0, Math.min(safeY, Math.max(0, desktop.clientHeight - height)))
      };
    }
    function renderIcons() {
      const box = $("#icons");
      box.innerHTML = "";
      const entries = [];
      SYSTEM_ICONS.forEach((s) => entries.push({ key: s.id, name: typeof s.name === "function" ? s.name() : s.name, icon: typeof s.icon === "function" ? s.icon() : s.icon, sys: s }));
      (state.fs.children || []).forEach((n) => entries.push({ key: n.id, name: n.name, icon: iconFor(n), node: n }));
      const auto = freeSlots(entries.filter((e) => !state.iconPos[e.key]).length);
      let ai = 0;
      let positionsChanged = false;
      entries.forEach((e) => {
        const d = el("div", "icon");
        const pos = state.iconPos[e.key] || auto[ai++];
        const img = el("img", "glyph");
        img.src = e.icon;
        img.alt = "";
        d.append(img, el("div", "label", e.name));
        d.tabIndex = 0;
        d.setAttribute("role", "button");
        d.setAttribute("aria-label", e.name);
        box.appendChild(d);
        const initial = clampDesktopPoint(pos.x, pos.y, d.offsetWidth, d.offsetHeight);
        d.style.left = initial.x + "px";
        d.style.top = initial.y + "px";
        if (state.iconPos[e.key] && (initial.x !== pos.x || initial.y !== pos.y)) {
          state.iconPos[e.key] = initial;
          positionsChanged = true;
        }
        let suppressOpenUntil = 0;
        const open = () => {
          if (performance.now() < suppressOpenUntil) return;
          e.sys ? e.sys.action() : openNode(e.node);
        };
        d.addEventListener("dblclick", open);
        d.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") open();
        });
        d.addEventListener("pointerdown", (ev) => {
          document.querySelectorAll("#icons .icon.sel").forEach((x) => x.classList.remove("sel"));
          d.classList.add("sel");
          d.focus();
          const ox = d.offsetLeft, oy = d.offsetTop;
          const iconWidth = d.offsetWidth, iconHeight = d.offsetHeight;
          const desktopWidth = desktop.clientWidth, desktopHeight = desktop.clientHeight;
          let dx = 0, dy = 0;
          trackPointerDrag(ev, d, {
            onStart: () => {
              d.classList.add("dragging");
              d.setAttribute("aria-grabbed", "true");
            },
            onMove: (rawDx, rawDy) => {
              dx = Math.max(-ox, Math.min(rawDx, desktopWidth - iconWidth - ox));
              dy = Math.max(-oy, Math.min(rawDy, desktopHeight - iconHeight - oy));
              d.style.transform = `translate3d(${dx}px,${dy}px,0)`;
            },
            onEnd: ({ moved, cancelled }) => {
              d.style.transform = "";
              d.classList.remove("dragging");
              d.removeAttribute("aria-grabbed");
              if (moved) suppressOpenUntil = performance.now() + 350;
              if (moved && !cancelled) {
                const finalPos = { x: ox + dx, y: oy + dy };
                d.style.left = finalPos.x + "px";
                d.style.top = finalPos.y + "px";
                state.iconPos[e.key] = finalPos;
                save();
              }
            }
          });
        });
        d.addEventListener("contextmenu", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (e.node) nodeMenu(e.node, ev.clientX, ev.clientY);
          else menu(ev.clientX, ev.clientY, [{ label: "Open", action: () => e.sys.action() }]);
        });
      });
      if (positionsChanged) save();
    }
    desktop.addEventListener("contextmenu", (e) => {
      const target = e.target;
      if (target.closest(".win") || target.closest("#omni") || target.closest("#today")) return;
      e.preventDefault();
      menu(e.clientX, e.clientY, [
        ...newItemsMenu(state.fs),
        "-",
        { label: "Line up icons", action: () => {
          state.iconPos = {};
          save();
          renderIcons();
        } },
        { label: "Open Terminal", action: () => openTerminal() },
        { label: state.showOmni ? "Hide search bar" : "Show search bar", action: () => {
          state.showOmni = !state.showOmni;
          save();
          applyChrome();
        } },
        { label: state.showToday ? "Hide MiniOS Today" : "Show MiniOS Today", action: () => {
          state.showToday = !state.showToday;
          save();
          applyChrome();
        } },
        { label: state.crtEffect !== false ? "Turn CRT effect off" : "Turn CRT effect on", action: () => {
          state.crtEffect = state.crtEffect === false;
          save();
          applyChrome();
        } },
        "-",
        { label: "Properties\u2026", action: () => openSettings() }
      ]);
    });
    desktop.addEventListener("pointerdown", (e) => {
      if (e.target === desktop || e.target.id === "icons")
        document.querySelectorAll("#icons .icon.sel").forEach((x) => x.classList.remove("sel"));
    });
    const explorers = [];
    function openExplorer(folder) {
      const existing = explorers.find((x) => x.folder === folder);
      if (existing) {
        focusWin(existing.win);
        return existing;
      }
      const winTitle = (f) => f === state.fs ? activeTheme.computerName : f.name;
      const w = makeWindow({ title: winTitle(folder), icon: ICONS.folderOpen, kind: "explorer", w: 600, h: 400 });
      const st = { win: w, folder, history: [folder], hi: 0 };
      explorers.push(st);
      const mb = el("div", "menubar");
      ["File", "Edit", "View", "Help"].forEach((m) => {
        const s = el("span", null, m);
        s.onclick = (ev) => {
          const r = s.getBoundingClientRect();
          if (m === "File") menu(r.left, r.bottom, [...newItemsMenu(st.folder), "-", { label: "Close", action: () => w.close() }]);
          else if (m === "Edit") menu(r.left, r.bottom, [
            { label: "Sort by name", action: () => {
              st.folder.children.sort((a, b) => Number(isFolder(b)) - Number(isFolder(a)) || a.name.localeCompare(b.name));
              save();
              refreshAll();
            } },
            { label: "Select all", action: () => st.pane.querySelectorAll(".item").forEach((i) => i.classList.add("sel")) }
          ]);
          else if (m === "View") menu(r.left, r.bottom, [
            { label: "Refresh", action: () => render() },
            { label: "Open new window", action: () => openExplorer(state.fs) }
          ]);
          else menu(r.left, r.bottom, [{ label: `About ${activeTheme.shortName}`, action: () => openHelp() }]);
        };
        mb.appendChild(s);
      });
      const tb = el("div", "toolbar");
      const bBack = el("button", null, "\u25C0 Back");
      const bFwd = el("button", null, "Forward \u25B6");
      const bUp = el("button");
      bUp.append((() => {
        const i = el("img");
        i.src = ICONS.up;
        i.style.width = "14px";
        i.style.height = "14px";
        return i;
      })());
      bUp.title = "Up one level";
      const addr = el("div", "addr");
      addr.appendChild(el("span", null, "Address:"));
      const addrBox = el("div", "in");
      const addrIcon = el("img");
      addrIcon.src = ICONS.folder;
      addrIcon.style.width = "16px";
      addrIcon.style.height = "16px";
      const addrText = el("span");
      addrText.style.userSelect = "text";
      addrBox.append(addrIcon, addrText);
      addr.appendChild(addrBox);
      tb.append(bBack, bFwd, bUp, el("div", "sep"), addr);
      const pane = el("div", "pane");
      st.pane = pane;
      const status = el("div", "status");
      const s1 = el("div");
      s1.style.flex = "1";
      const s2 = el("div");
      s2.style.flex = "0 0 130px";
      status.append(s1, s2);
      w.body.append(mb, tb, pane, status);
      function nav(f, push = true) {
        st.folder = f;
        if (push) {
          st.history = st.history.slice(0, st.hi + 1);
          st.history.push(f);
          st.hi = st.history.length - 1;
        }
        w.setTitle(winTitle(f));
        render();
      }
      function render() {
        if (!byId[st.folder.id]) st.folder = state.fs;
        const f = st.folder;
        addrText.textContent = pathString(f, state.appearance === "macos9" ? "mac" : "win");
        pane.innerHTML = "";
        const kids = (f.children || []).slice().sort((a, b) => Number(isFolder(b)) - Number(isFolder(a)) || a.name.localeCompare(b.name));
        if (!kids.length) pane.appendChild(el("div", "empty", "This folder is empty. Right-click to add a shortcut."));
        kids.forEach((n) => {
          const it = el("div", "item");
          it.draggable = true;
          const img = el("img", "glyph");
          img.src = iconFor(n);
          img.alt = "";
          it.append(img, el("div", "label", n.name));
          it.title = isFolder(n) ? pathString(n, "win") : n.url;
          it.onpointerdown = () => {
            pane.querySelectorAll(".item.sel").forEach((x) => x.classList.remove("sel"));
            it.classList.add("sel");
            s2.textContent = isFolder(n) ? "Folder" : "Internet Shortcut";
          };
          it.ondblclick = () => isFolder(n) ? nav(n) : go(n.url);
          it.oncontextmenu = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            nodeMenu(n, ev.clientX, ev.clientY);
          };
          it.ondragstart = (ev) => {
            ev.dataTransfer.setData("text/web95-id", n.id);
            ev.dataTransfer.effectAllowed = "move";
          };
          if (isFolder(n)) {
            it.ondragover = (ev) => {
              if (ev.dataTransfer.types.includes("text/web95-id")) {
                ev.preventDefault();
                it.classList.add("sel");
              }
            };
            it.ondragleave = () => it.classList.remove("sel");
            it.ondrop = (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              it.classList.remove("sel");
              const src = byId[ev.dataTransfer.getData("text/web95-id")];
              if (src) moveNode(src, n);
            };
          }
          pane.appendChild(it);
        });
        s1.textContent = kids.length + " object(s)";
        s2.textContent = f === state.fs ? activeTheme.computerName : "";
        bBack.disabled = st.hi === 0;
        bFwd.disabled = st.hi >= st.history.length - 1;
        bUp.disabled = !parentOf[f.id];
      }
      pane.oncontextmenu = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        menu(ev.clientX, ev.clientY, [
          ...newItemsMenu(st.folder),
          "-",
          { label: "Refresh", action: render },
          { label: "Properties\u2026", action: () => propsDialog(st.folder) }
        ]);
      };
      pane.ondragover = (ev) => {
        if (ev.dataTransfer.types.includes("text/web95-id")) ev.preventDefault();
      };
      pane.ondrop = (ev) => {
        ev.preventDefault();
        const src = byId[ev.dataTransfer.getData("text/web95-id")];
        if (src && parentOf[src.id] !== st.folder) moveNode(src, st.folder);
      };
      bBack.onclick = () => {
        if (st.hi > 0) {
          st.hi--;
          nav(st.history[st.hi], false);
        }
      };
      bFwd.onclick = () => {
        if (st.hi < st.history.length - 1) {
          st.hi++;
          nav(st.history[st.hi], false);
        }
      };
      bUp.onclick = () => {
        const p = parentOf[st.folder.id];
        if (p) nav(p);
      };
      st.render = render;
      w.onClose = () => {
        const i = explorers.indexOf(st);
        if (i >= 0) explorers.splice(i, 1);
      };
      render();
      return st;
    }
    function openTerminal(shell) {
      const sh = shell || state.shell;
      const conf = SHELLS[sh];
      const w = makeWindow({ title: conf.label, icon: conf.icon, kind: "terminal", w: 700, h: 420 });
      const term = el("div", "term " + conf.cls);
      const scroll = el("div", "scroll");
      const iline = el("div", "inputline");
      const prompt = el("span", "prompt");
      const input = el("input", "cmd");
      input.spellcheck = false;
      input.autocapitalize = "off";
      input.autocomplete = "off";
      iline.append(prompt, input);
      term.append(scroll, iline);
      w.body.appendChild(term);
      const S = { shell: sh, cwd: state.fs, hist: [], hi: 0, term, scroll };
      w.onFocus = () => setTimeout(() => input.focus(), 0);
      term.onpointerdown = (e) => {
        if (window.getSelection().isCollapsed && e.target !== input) input.focus();
      };
      function out(html, cls) {
        const d = el("div", "line" + (cls ? " " + cls : ""));
        d.innerHTML = html;
        scroll.appendChild(d);
        scroll.scrollTop = scroll.scrollHeight;
        return d;
      }
      function text(s, cls) {
        return out(esc(s == null ? "" : s), cls);
      }
      S.out = out;
      S.text = text;
      function promptHTML() {
        const p = S.cwd;
        if (S.shell === "powershell") return `<span class="p2">PS ${esc(pathString(p, "win"))}&gt;</span> `;
        if (S.shell === "bash") return `<span class="p1">${esc(state.user)}@${esc(state.host)}</span>:<span class="p2">${esc(pathString(p, "nix"))}</span>$ `;
        if (S.shell === "coto") return `<span class="p3">CS</span> <span class="p2">${esc(pathString(p, "nix"))}</span> <span class="p1">\u203A</span> `;
        return `<span class="p3">\u279C</span>  <span class="p2">${esc(pathString(p, "nix"))}</span> <span class="p1">\u276F</span> `;
      }
      function refreshPrompt() {
        prompt.innerHTML = promptHTML();
        term.className = "term " + SHELLS[S.shell].cls;
        w.setTitle(SHELLS[S.shell].label + " \u2014 " + pathString(S.cwd, S.shell === "powershell" ? "win" : "nix"));
        w.iconEl.src = SHELLS[S.shell].icon;
        w.icon = SHELLS[S.shell].icon;
        syncTasks();
      }
      S.refreshPrompt = refreshPrompt;
      banner(S);
      refreshPrompt();
      setTimeout(() => input.focus(), 30);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const line = input.value;
          out(promptHTML() + esc(line));
          input.value = "";
          if (line.trim()) {
            S.hist.push(line);
            S.hi = S.hist.length;
          }
          try {
            runCommand(S, line);
          } catch (err) {
            text(String(err), "err");
          }
          refreshPrompt();
          scroll.scrollTop = scroll.scrollHeight;
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (S.hi > 0) {
            S.hi--;
            input.value = S.hist[S.hi];
          }
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          if (S.hi < S.hist.length - 1) {
            S.hi++;
            input.value = S.hist[S.hi];
          } else {
            S.hi = S.hist.length;
            input.value = "";
          }
        } else if (e.key === "Tab") {
          e.preventDefault();
          complete(S, input);
        } else if (e.key === "l" && e.ctrlKey) {
          e.preventDefault();
          scroll.innerHTML = "";
        } else if (e.key === "c" && e.ctrlKey && window.getSelection().isCollapsed) {
          out(promptHTML() + esc(input.value) + '<span class="dim">^C</span>');
          input.value = "";
        }
      });
      S.win = w;
      return S;
    }
    function banner(S) {
      const c = SHELLS[S.shell];
      if (S.shell === "powershell") {
        S.text(`Windows PowerShell (${activeTheme.shortName} Edition)`);
        S.text("Copyright (C) Nobody. All bookmarks reserved.");
      } else if (S.shell === "bash") {
        S.text("GNU bash, web95-release 5.2.web  (x86_64-pc-browser)");
      } else if (S.shell === "coto") {
        S.out('<span class="p3">Coto Shell (CS) 0.2</span> \u2014 Bash flow \xD7 PowerShell clarity');
        S.text("OS/Coto Subsystem \xB7 local object pipeline \xB7 no network or host binaries", "dim");
      } else {
        S.text("zsh 5.9 (web95) \u2014 oh-my-web95 loaded");
      }
      if (S.shell === "coto")
        S.out('Use <span class="hd">ls</span> or <span class="hd">Get-ChildItem</span>, <span class="hd">grep</span> or <span class="hd">Select-String</span>. Type <span class="hd">aliases</span> to see the pairs.', "dim");
      else
        S.out(`Type <span class="hd">help</span> for commands, <span class="hd">ls</span> to list bookmarks, <span class="hd">open &lt;name&gt;</span> to launch one.`, "dim");
      S.text("");
    }
    function resolve(spec, cwd) {
      const normalizedSpec = String(spec).trim().replace(/^["']|["']$/g, "");
      if (!normalizedSpec) return cwd;
      let node = cwd;
      let s = normalizedSpec;
      const macRoot = activeTheme.computerName;
      if (s.toLowerCase() === macRoot.toLowerCase() || s.toLowerCase().startsWith(macRoot.toLowerCase() + ":")) {
        node = state.fs;
        s = s.slice(macRoot.length).replace(/^:+/, "");
      } else if (/^([a-z]:)?[\\/]/i.test(s) || s === "~" || s.startsWith("~/") || s.startsWith("~\\")) {
        node = state.fs;
        s = s.replace(/^~/, "").replace(/^[a-z]:/i, "").replace(/^[\\/]+/, "");
      }
      const parts = s.split(/[\\/:]+/).filter((p) => p.length);
      for (const p of parts) {
        if (p === ".") continue;
        if (p === "..") {
          node = parentOf[node.id] || state.fs;
          continue;
        }
        if (!isFolder(node)) return null;
        const kid = findChild(node, p);
        if (!kid) return null;
        node = kid;
      }
      return node;
    }
    function tokenize(line) {
      const out = [];
      let cur = "", q = null;
      for (const ch of line) {
        if (q) {
          if (ch === q) {
            q = null;
          } else cur += ch;
          continue;
        }
        if (ch === '"' || ch === "'") {
          q = ch;
          continue;
        }
        if (/\s/.test(ch)) {
          if (cur) {
            out.push(cur);
            cur = "";
          }
          continue;
        }
        cur += ch;
      }
      if (cur) out.push(cur);
      return out;
    }
    function splitPipeline(line) {
      const stages = [];
      let current = "", quote = "";
      for (const character of line) {
        if (quote) {
          current += character;
          if (character === quote) quote = "";
          continue;
        }
        if (character === '"' || character === "'") {
          quote = character;
          current += character;
          continue;
        }
        if (character === "|") {
          if (current.trim()) stages.push(current.trim());
          current = "";
          continue;
        }
        current += character;
      }
      if (current.trim()) stages.push(current.trim());
      return stages;
    }
    function complete(S, input) {
      const val = input.value;
      const parts = tokenize(val);
      const partial = /\s$/.test(val) ? "" : parts[parts.length - 1] || "";
      if (parts.length <= 1 && !/\s$/.test(val)) {
        const names = Object.keys(COMMANDS).filter((c) => c.startsWith(partial.toLowerCase()) && (!COMMANDS[c].shells || COMMANDS[c].shells.includes(S.shell)));
        if (names.length === 1) input.value = names[0] + " ";
        else if (names.length > 1) {
          S.out(promptHTMLPlain(S) + esc(val), "dim");
          S.text(names.join("  "));
        }
        return;
      }
      const slash = Math.max(partial.lastIndexOf("/"), partial.lastIndexOf("\\"));
      const dirPart = slash >= 0 ? partial.slice(0, slash + 1) : "";
      const leaf = slash >= 0 ? partial.slice(slash + 1) : partial;
      const base = resolve(dirPart || ".", S.cwd);
      if (!isFolder(base)) return;
      const cands = (base.children || []).map((c) => c.name).filter((n) => n.toLowerCase().startsWith(leaf.toLowerCase()));
      if (cands.length === 1) {
        const done = cands[0] + (isFolder(findChild(base, cands[0])) ? S.shell === "powershell" ? "\\" : "/" : " ");
        const q = /\s/.test(cands[0]) ? '"' : "";
        input.value = val.slice(0, val.length - partial.length) + q + dirPart + done + (q ? '" ' : "");
      } else if (cands.length > 1) {
        S.text(cands.join("   "));
      }
    }
    const promptHTMLPlain = (_S) => "";
    function sortedChildren(folder) {
      return (folder.children || []).slice().sort(
        (a, b) => Number(isFolder(b)) - Number(isFolder(a)) || a.name.localeCompare(b.name)
      );
    }
    function fmtCotoObjects(S, items, folder) {
      if (folder) {
        S.out(`<span class="p3">CS objects</span>  <span class="dir">${esc(pathString(folder, "nix"))}</span>  <span class="dim">${esc(pathString(folder, "win"))}</span>`);
      }
      if (!items.length) {
        S.text("0 objects", "dim");
        return;
      }
      S.out('<span class="hd">Kind      Name                           Value</span>');
      S.out('<span class="hd">----      ----                           -----</span>');
      items.forEach((item) => {
        const kind = isFolder(item) ? "folder" : "link";
        const name = (item.name.length > 30 ? item.name.slice(0, 29) + "\u2026" : item.name).padEnd(31);
        const value = isFolder(item) ? `${item.children.length} object(s)` : item.url;
        S.out(`<span class="p3">${esc(kind.padEnd(10))}</span>` + (isFolder(item) ? `<span class="dir">${esc(name)}</span>` : `<span class="ok">${esc(name)}</span>`) + (isFolder(item) ? `<span class="dim">${esc(value)}</span>` : `<span class="lnk" data-url="${esc(normalizeUrl(item.url))}">${esc(value)}</span>`));
      });
      S.text(`${items.length} object(s)`, "dim");
    }
    function fmtList(S, folder) {
      const kids = sortedChildren(folder);
      if (!kids.length) {
        S.text("(empty)", "dim");
        return;
      }
      if (S.shell === "coto") {
        fmtCotoObjects(S, kids, folder);
      } else if (S.shell === "powershell") {
        S.text("");
        S.text("    Directory: " + pathString(folder, "win"));
        S.text("");
        S.out('<span class="hd">Mode     Name                           Target</span>');
        S.out('<span class="hd">----     ----                           ------</span>');
        kids.forEach((n) => {
          const mode = isFolder(n) ? "d----" : "-a---";
          const name = n.name.length > 30 ? n.name.slice(0, 29) + "\u2026" : n.name;
          const target = isFolder(n) ? String((n.children || []).length) + " item(s)" : n.url;
          S.out(esc(mode) + "    " + (isFolder(n) ? `<span class="dir">${esc(name.padEnd(31))}</span>` : esc(name.padEnd(31))) + (isFolder(n) ? `<span class="dim">${esc(target)}</span>` : `<span class="lnk" data-url="${esc(normalizeUrl(n.url))}">${esc(target)}</span>`));
        });
        S.text("");
      } else {
        S.text("total " + kids.length);
        kids.forEach((n) => {
          const perm = isFolder(n) ? "drwxr-xr-x" : "-rw-r--r--";
          const name = isFolder(n) ? `<span class="dir">${esc(n.name)}/</span>` : `<span class="ok">${esc(n.name)}</span> <span class="dim">-&gt;</span> <span class="lnk" data-url="${esc(normalizeUrl(n.url))}">${esc(n.url)}</span>`;
          S.out(`<span class="dim">${perm}  ${esc(state.user)}  ${esc(state.host)}</span>  ` + name);
        });
      }
    }
    function notFound(S, cmd2) {
      if (S.shell === "powershell")
        S.text(cmd2 + " : The term '" + cmd2 + "' is not recognized as the name of a cmdlet, function, script file, or operable program.", "err");
      else if (S.shell === "bash") S.text("bash: " + cmd2 + ": command not found", "err");
      else if (S.shell === "coto") S.text("cs: command not found: " + cmd2 + " (try 'coto help')", "err");
      else S.text("zsh: command not found: " + cmd2, "err");
    }
    function needArg(S, command) {
      S.text(command + ": missing operand", "err");
    }
    const COMMANDS = {};
    function cmd(names, help, fn, shells) {
      const list = names.split(/\s+/);
      list.forEach((n, i) => COMMANDS[n] = { run: fn, help, primary: list[0], alias: i > 0, shells });
    }
    const COTO_COMMAND_PAIRS = [
      ["ls", "Get-ChildItem", "list objects"],
      ["cd", "Set-Location", "change location"],
      ["pwd", "Get-Location", "show location"],
      ["cat", "Get-Content", "read a bookmark"],
      ["grep", "Select-String", "filter by text"],
      ["stat", "Get-Item", "inspect an object"],
      ["env", "Get-Variable", "show session values"],
      ["ps", "Get-Process", "show MiniOS windows"],
      ["clear", "Clear-Host", "clear the terminal"]
    ];
    function printCotoVocabulary(S) {
      S.out('<span class="hd">Bash          PowerShell         Coto action</span>');
      S.out('<span class="hd">----          ----------         -----------</span>');
      COTO_COMMAND_PAIRS.forEach(
        ([bash, powerShell, description]) => S.out(`<span class="ok">${esc(bash.padEnd(14))}</span><span class="p2">${esc(powerShell.padEnd(19))}</span>${esc(description)}`)
      );
      S.text("Both names run the same local Coto command.", "dim");
    }
    cmd("help man get-help ?", "Show this list", (S) => {
      S.text("");
      S.out('<span class="hd">' + esc(activeTheme.shortName) + " shell \u2014 " + SHELLS[S.shell].label + "</span>");
      S.text("");
      if (S.shell === "coto") {
        S.text("Bash shortcuts and PowerShell verbs share one command model.", "dim");
        printCotoVocabulary(S);
        S.out('  <span class="p3">Pipeline</span>  ls | Where-Object type=folder | Sort-Object name');
        S.out('  <span class="p3">Pipeline</span>  Get-ChildItem Dev | grep git | head 3');
        S.text("");
      }
      const seen = /* @__PURE__ */ new Set();
      Object.keys(COMMANDS).forEach((k) => {
        const c = COMMANDS[k];
        if (c.alias || seen.has(c.primary) || c.shells && !c.shells.includes(S.shell)) return;
        seen.add(c.primary);
        const aliases = Object.keys(COMMANDS).filter((x) => COMMANDS[x].primary === c.primary && x !== c.primary);
        S.out('  <span class="ok">' + esc(c.primary.padEnd(12)) + "</span>" + esc(c.help) + (aliases.length ? ' <span class="dim">(' + esc(aliases.join(", ")) + ")</span>" : ""));
      });
      S.text("");
      S.out('  <span class="dim">Tab completes names \xB7 \u2191/\u2193 walks history \xB7 Ctrl+L clears</span>');
      S.text("");
    });
    cmd("aliases alias get-alias", "Show Bash and PowerShell command pairs", (S) => printCotoVocabulary(S), ["coto"]);
    cmd("which command get-command", "Resolve a command or alias", (S, args) => {
      const requested = (args[0] || "").toLowerCase();
      if (!requested) {
        printCotoVocabulary(S);
        return;
      }
      const command = COMMANDS[requested];
      if (!command || command.shells && !command.shells.includes(S.shell)) {
        S.text(`Get-Command: '${args[0]}' was not found in this shell.`, "err");
        return;
      }
      const aliases = Object.keys(COMMANDS).filter((name) => COMMANDS[name].primary === command.primary && name !== command.primary);
      S.out(`<span class="p3">Command</span>  ${esc(command.primary)}`);
      S.out(`<span class="p3">Aliases</span>  ${esc(aliases.join(", ") || "(none)")}`);
      S.out(`<span class="p3">Action</span>   ${esc(command.help)}`);
    }, ["coto"]);
    cmd("ls dir gci get-childitem l", "List the current folder", (S, args) => {
      const target = args.filter((a) => !a.startsWith("-"))[0];
      const n = resolve(target || ".", S.cwd);
      if (!n) {
        S.text("Cannot find path '" + target + "' because it does not exist.", "err");
        return;
      }
      if (!isFolder(n)) {
        S.text(n.name + " -> " + n.url);
        return;
      }
      fmtList(S, n);
    });
    cmd("cd chdir set-location sl", "Change folder", (S, args) => {
      const spec = args[0];
      if (!spec) {
        if (S.shell !== "powershell") S.cwd = state.fs;
        else S.text(pathString(S.cwd, "win"));
        return;
      }
      if (spec === "-") {
        S.cwd = S.prevCwd || S.cwd;
        return;
      }
      const n = resolve(spec, S.cwd);
      if (!n) {
        S.text(S.shell === "powershell" ? "Set-Location : Cannot find path '" + spec + "'." : "cd: no such file or directory: " + spec, "err");
        return;
      }
      if (!isFolder(n)) {
        S.text("cd: not a directory: " + spec, "err");
        return;
      }
      S.prevCwd = S.cwd;
      S.cwd = n;
    });
    cmd("pwd get-location gl", "Print current folder", (S) => {
      S.text(pathString(S.cwd, S.shell === "powershell" ? "win" : "nix"));
    });
    cmd("stat inspect get-item gi", "Inspect a folder or bookmark object", (S, args) => {
      const item = resolve(args.join(" ") || ".", S.cwd);
      if (!item) {
        S.text("Get-Item: object not found: " + args.join(" "), "err");
        return;
      }
      const details = [
        ["Name", item.name],
        ["Type", isFolder(item) ? "Folder" : "Bookmark"],
        ["UnixPath", pathString(item, "nix")],
        ["WinPath", pathString(item, "win")],
        [isFolder(item) ? "Children" : "Target", isFolder(item) ? String(item.children.length) : item.url],
        ["Storage", "Local MiniOS state"]
      ];
      details.forEach(([key, value]) => S.out(`<span class="p3">${esc(key.padEnd(10))}</span>${esc(value)}`));
    }, ["coto"]);
    cmd("env printenv get-variable gv", "Show the local Coto session values", (S) => {
      const values = [
        ["SHELL", "coto"],
        ["CS_VERSION", "0.2"],
        ["USER", state.user],
        ["HOST", state.host],
        ["PWD", pathString(S.cwd, "nix")],
        ["MINIOS", activeTheme.shortName],
        ["STORAGE", "local"]
      ];
      S.out('<span class="hd">Name          Value</span>');
      S.out('<span class="hd">----          -----</span>');
      values.forEach(([name, value]) => S.out(`<span class="ok">${esc(name.padEnd(14))}</span>${esc(value)}`));
    }, ["coto"]);
    cmd("ps get-process", "Show MiniOS windows as process objects", (S) => {
      S.out('<span class="hd">Id      State       Kind          Name</span>');
      S.out('<span class="hd">--      -----       ----          ----</span>');
      wins.forEach((win, index) => {
        const id = String(index + 101).padEnd(8);
        const status = (win.min ? "stopped" : "running").padEnd(12);
        const kind = String(win.kind || "window").padEnd(14);
        S.out(`<span class="p3">${esc(id)}</span><span class="ok">${esc(status)}</span>${esc(kind + win.title)}`);
      });
      S.text(`${wins.length} local process object(s)`, "dim");
    }, ["coto"]);
    cmd("open start xdg-open launch", "Open a bookmark or URL", (S, args) => {
      if (!args.length) return needArg(S, "open");
      const raw = args.join(" ");
      const n = resolve(raw, S.cwd);
      if (n && !isFolder(n)) {
        S.out('Opening <span class="lnk">' + esc(n.url) + "</span>\u2026", "ok");
        setTimeout(() => go(n.url), 200);
        return;
      }
      if (n && isFolder(n)) {
        openExplorer(n);
        S.text("Opened folder window: " + n.name, "ok");
        return;
      }
      if (looksLikeUrl(raw)) {
        S.out('Opening <span class="lnk">' + esc(normalizeUrl(raw)) + "</span>\u2026", "ok");
        setTimeout(() => go(raw), 200);
        return;
      }
      S.text("No bookmark or address matched: " + raw, "err");
    });
    cmd("cat type get-content gc", "Show a bookmark's address", (S, args) => {
      if (!args.length) return needArg(S, "cat");
      const n = resolve(args.join(" "), S.cwd);
      if (!n) {
        S.text("No such item: " + args.join(" "), "err");
        return;
      }
      if (isFolder(n)) {
        S.text((S.shell === "powershell" ? "Get-Content : " : "cat: ") + n.name + ": Is a directory", "err");
        return;
      }
      S.out('<span class="lnk" data-url="' + esc(normalizeUrl(n.url)) + '">' + esc(n.url) + "</span>");
    });
    cmd("mkdir md new-folder", "Create a folder", (S, args) => {
      if (!args.length) return needArg(S, "mkdir");
      const name = args.join(" ");
      addNode(isFolder(S.cwd) ? S.cwd : state.fs, F(name, []));
      S.text("Created folder: " + name, "ok");
    });
    cmd("add new mklink touch", "Add a bookmark: add <name> <url>", (S, args) => {
      if (args.length < 1) {
        S.text("usage: add <name> <url>   (or: add <url>)", "warn");
        return;
      }
      let name, url;
      if (args.length === 1) {
        url = normalizeUrl(args[0]);
        try {
          name = new URL(url).hostname.replace(/^www\./, "");
        } catch (e) {
          name = args[0];
        }
      } else {
        url = normalizeUrl(args[args.length - 1]);
        name = args.slice(0, -1).join(" ");
      }
      if (!looksLikeUrl(url)) {
        S.text("That doesn't look like an address: " + url, "err");
        return;
      }
      const n = addNode(S.cwd, L(name, url));
      S.out('Added <span class="ok">' + esc(n.name) + '</span> -> <span class="lnk">' + esc(n.url) + "</span>");
    });
    cmd("rm del remove-item ri rmdir", "Delete a folder or bookmark", (S, args) => {
      const spec = args.filter((a) => !a.startsWith("-")).join(" ");
      if (!spec) return needArg(S, "rm");
      const n = resolve(spec, S.cwd);
      if (!n || n === state.fs) {
        S.text("Cannot remove '" + spec + "'", "err");
        return;
      }
      if (isFolder(n) && (n.children || []).length && !args.some((a) => /^-(r|rf|f|force|recurse)/i.test(a))) {
        S.text("rm: " + n.name + " is not empty (use -r)", "err");
        return;
      }
      if (pathOf(S.cwd).some((p) => p.id === n.id)) S.cwd = parentOf[n.id] || state.fs;
      removeNode(n);
      S.text("Removed " + n.name, "ok");
    });
    cmd("mv move ren rename-item rni", "Rename: mv <old> <new-name>", (S, args) => {
      if (args.length < 2) {
        S.text("usage: mv <name> <new name>", "warn");
        return;
      }
      const n = resolve(args[0], S.cwd);
      if (!n || n === state.fs) {
        S.text("No such item: " + args[0], "err");
        return;
      }
      const rest = args.slice(1).join(" ");
      const dest = resolve(rest, S.cwd);
      if (dest && isFolder(dest) && dest !== n) {
        moveNode(n, dest);
        S.text("Moved " + n.name + " to " + pathString(dest, "win"), "ok");
        return;
      }
      renameNode(n, rest);
      S.text("Renamed to " + n.name, "ok");
    });
    cmd("tree", "Show the whole bookmark tree", (S, args) => {
      const root = resolve(args[0] || ".", S.cwd) || S.cwd;
      S.out('<span class="dir">' + esc(pathString(root, S.shell === "powershell" ? "win" : "nix")) + "</span>");
      (function walk(n, pre) {
        const kids = (n.children || []).slice().sort((a, b) => Number(isFolder(b)) - Number(isFolder(a)) || a.name.localeCompare(b.name));
        kids.forEach((c, i) => {
          const last = i === kids.length - 1;
          S.out('<span class="dim">' + pre + (last ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ") + "</span>" + (isFolder(c) ? '<span class="dir">' + esc(c.name) + "</span>" : esc(c.name)));
          if (isFolder(c)) walk(c, pre + (last ? "    " : "\u2502   "));
        });
      })(root, "");
    });
    cmd("search find s", "Search the web", (S, args) => {
      if (!args.length) {
        S.text("usage: search <words>", "warn");
        return;
      }
      const q = args.join(" ");
      S.out("Searching " + esc(ENGINES[state.engine].name) + ' for "' + esc(q) + '"\u2026', "ok");
      setTimeout(() => go(searchUrl(q)), 200);
    });
    cmd("grep where select-string", "Find bookmarks by name or url", (S, args) => {
      if (!args.length) {
        S.text("usage: grep <text>", "warn");
        return;
      }
      const q = args.join(" ").toLowerCase();
      let hits = 0;
      (function walk(n) {
        (n.children || []).forEach((c) => {
          const hay = (c.name + " " + ("url" in c ? c.url : "")).toLowerCase();
          if (hay.includes(q)) {
            hits++;
            S.out('<span class="dim">' + esc(pathString(parentOf[c.id], S.shell === "powershell" ? "win" : "nix")) + "</span>  " + (isFolder(c) ? '<span class="dir">' + esc(c.name) + "</span>" : esc(c.name) + '  <span class="lnk" data-url="' + esc(normalizeUrl(c.url)) + '">' + esc(c.url) + "</span>"));
          }
          if (isFolder(c)) walk(c);
        });
      })(state.fs);
      if (!hits) S.text("No matches.", "dim");
    });
    cmd("shell chsh set-shell", "Switch shell: shell powershell|bash|zsh|coto", (S, args) => {
      const name = (args[0] || "").toLowerCase();
      const map = { powershell: "powershell", pwsh: "powershell", ps: "powershell", ps1: "powershell", bash: "bash", sh: "bash", zsh: "zsh", coto: "coto", cs: "coto", cotosh: "coto" };
      if (!map[name]) {
        S.text("Available shells: powershell, bash, zsh, coto", "warn");
        S.text("Current: " + SHELLS[S.shell].label, "dim");
        return;
      }
      S.shell = map[name];
      state.shell = S.shell;
      save();
      applyChrome();
      renderIcons();
      S.scroll.innerHTML = "";
      banner(S);
      S.refreshPrompt();
    });
    cmd("clear cls clear-host", "Clear the screen", (S) => {
      S.scroll.innerHTML = "";
    });
    cmd("echo write-output write-host print", "Print text", (S, args) => {
      S.text(args.join(" "));
    });
    cmd("date get-date time", "Show date and time", (S) => {
      S.text((/* @__PURE__ */ new Date()).toString());
    });
    cmd("whoami", "Who am I", (S) => {
      S.text(S.shell === "powershell" ? state.host + "\\" + state.user : state.user);
    });
    cmd("history h", "Show command history", (S) => {
      S.hist.forEach((h, i) => S.out('<span class="dim">' + String(i + 1).padStart(4) + "</span>  " + esc(h)));
    });
    cmd("notepad edit nano vi vim", "Open the notepad", (S, args) => {
      openNotepad(args.length ? args.join(" ") : "welcome");
      S.text("Opening notepad\u2026", "ok");
    });
    cmd("minieditor editor npp notepad++ code", "Open MiniEditor", (S) => {
      openMiniEditor();
      S.text("Opening MiniEditor\u2026", "ok");
    });
    function printCotoDiagnostics(S, result) {
      if (!result.diagnostics.length) {
        S.text("No diagnostics. Zero Exception check passed.", "ok");
        return;
      }
      result.diagnostics.forEach((item) => {
        const location2 = `${state.coto.sourceName}:${item.line}:${item.column}`;
        S.text(`${location2} ${item.code} ${item.severity}: ${item.message}`, item.severity === "error" ? "err" : "warn");
      });
    }
    function runCotoSource(S, verifyVm = false) {
      const result = compileCoto(state.coto.source);
      printCotoDiagnostics(S, result);
      if (!result.ok) {
        S.text("Coto execution stopped: source did not pass validation.", "err");
        return;
      }
      if (verifyVm) S.text(`VM/Coto preview verified \xB7 ${result.instructions} instruction(s)`, "ok");
      if (result.output) S.text(result.output.replace(/\n$/, ""));
      result.priorityEvents.forEach((event) => S.text(`makefirst \u2192 ${event}`, "p3"));
      S.text(`RETURN-CODE ${result.returnCode}`, result.returnCode === 0 ? "dim" : "warn");
    }
    function cotoCli(S, args) {
      const sub = (args[0] || "help").toLowerCase();
      const rest = args.slice(1);
      if (sub === "help" || sub === "-h" || sub === "--help") {
        S.out('<span class="hd">Coto toolchain \u2014 MiniOS hosted subsystem preview</span>');
        S.text("The reference compiler is a local C11 prototype. This browser preview runs a safe language subset and does not replace its native backends.", "dim");
        [
          ["coto open", "open Compiler Lab"],
          ["coto source", "print saved .coto source"],
          ["coto sample [name]", "load hello, kitchen, or vm"],
          ["coto check", "parse and validate source"],
          ["coto run", "execute the hosted subset"],
          ["coto build", "build a local VM preview manifest"],
          ["coto vm-check", "verify a VM preview"],
          ["coto vm-run", "verify and execute"],
          ["coto targets", "show reference compiler targets"],
          ["coto status", "show Coto product-family status"],
          ["coto ecosystem", "open the graphical ecosystem"]
        ].forEach(([command, description]) => S.out(`  <span class="ok">${esc(command.padEnd(23))}</span>${esc(description)}`));
        return;
      }
      if (["open", "lab", "compiler"].includes(sub)) {
        openCoto("compiler");
        S.text("Opening Coto Compiler Lab\u2026", "ok");
        return;
      }
      if (["ecosystem", "home"].includes(sub)) {
        openCoto("home");
        S.text("Opening the Coto Ecosystem\u2026", "ok");
        return;
      }
      if (sub === "source") {
        S.text(`${state.coto.sourceName} \u2014 saved locally`, "hd");
        state.coto.source.split("\n").forEach((line, index) => S.out(`<span class="dim">${String(index + 1).padStart(3)}</span>  ${esc(line)}`));
        return;
      }
      if (sub === "sample") {
        const key = (rest[0] || "").toLowerCase();
        if (!key) {
          S.text("Samples: " + Object.entries(COTO_SAMPLES).map(([id, sample2]) => `${id} (${sample2.label})`).join(", "));
          return;
        }
        const sample = COTO_SAMPLES[key];
        if (!sample) {
          S.text("Unknown sample. Choose: " + Object.keys(COTO_SAMPLES).join(", "), "warn");
          return;
        }
        state.coto.sourceName = sample.name;
        state.coto.source = sample.source;
        save();
        S.text(`Loaded ${sample.name}. Use 'run' or 'source'.`, "ok");
        return;
      }
      if (sub === "check") {
        const result = compileCoto(state.coto.source);
        printCotoDiagnostics(S, result);
        if (result.ok) S.text(`CHECK OK \xB7 ${result.programId} \xB7 ${result.instructions} instruction(s)`, "ok");
        return;
      }
      if (sub === "run") {
        runCotoSource(S);
        return;
      }
      if (sub === "vm-run") {
        runCotoSource(S, true);
        return;
      }
      if (sub === "build" || sub === "vm-build" || sub === "vm-check") {
        const result = compileCoto(state.coto.source);
        printCotoDiagnostics(S, result);
        const module = buildCotoModule(state.coto.source, result);
        if (!module) {
          S.text("No module written.", "err");
          return;
        }
        S.text(`${sub === "vm-check" ? "VERIFIED" : "BUILT"} ${module.programId}.vmcoto-preview`, "ok");
        S.text(`format       ${module.format}`);
        S.text(`checksum     ${module.checksum}`);
        S.text(`size         ${module.bytes} bytes`);
        S.text(`capabilities ${module.capabilities.join(", ") || "none"}`);
        S.text("Preview manifests are intentionally not wire-compatible with reference VM/Coto modules.", "dim");
        return;
      }
      if (sub === "targets") {
        S.text("Reference compiler targets", "hd");
        COTO_TARGETS.forEach(([target, description]) => S.out(`  <span class="ok">${esc(target.padEnd(20))}</span>${esc(description)}`));
        return;
      }
      if (sub === "status" || sub === "subsystem" || sub === "version" || sub === "--version") {
        S.out('<span class="hd">Coto Product Family / MiniOS Integration</span>');
        S.out('  <span class="ok">Coto Language</span>   working v0 prototype \xB7 hosted subset active here');
        S.out('  <span class="ok">Coto Compiler</span>   local C11 reference \xB7 MiniOS parser preview active');
        S.out('  <span class="ok">Coto Shell</span>      Bash + PowerShell hybrid \xB7 local object pipeline preview');
        S.out('  <span class="warn">OS/Coto Core</span>    early boot-verified kernel foundation');
        S.out('  <span class="p3">Storage</span>         local browser state \xB7 no account \xB7 no network');
        return;
      }
      S.text(`coto: unknown command '${sub}' (try 'coto help')`, "err");
    }
    cmd("coto", "Coto compiler/subsystem: coto help", (S, args) => cotoCli(S, args));
    cmd("ecosystem mini-coto", "Open the Coto Ecosystem", (S) => cotoCli(S, ["ecosystem"]));
    cmd("check", "Check the saved Coto source", (S) => cotoCli(S, ["check"]), ["coto"]);
    cmd("run", "Run the saved Coto source", (S) => cotoCli(S, ["run"]), ["coto"]);
    cmd("build", "Build a VM/Coto preview manifest", (S) => cotoCli(S, ["build"]), ["coto"]);
    cmd("source", "Open Coto Compiler Lab", (S) => cotoCli(S, ["open"]), ["coto"]);
    cmd("samples", "List or load Coto samples", (S, args) => cotoCli(S, ["sample", ...args]), ["coto"]);
    cmd("targets", "Show reference compiler targets", (S) => cotoCli(S, ["targets"]), ["coto"]);
    cmd("subsystem", "Show OS/Coto subsystem status", (S) => cotoCli(S, ["status"]), ["coto"]);
    cmd("explorer e", "Open a folder window", (S, args) => {
      const n = resolve(args.join(" ") || ".", S.cwd);
      if (!isFolder(n)) {
        S.text("Not a folder.", "err");
        return;
      }
      openExplorer(n);
    });
    cmd("settings config prefs", "Open settings", (S) => {
      openSettings();
    });
    cmd("appearance theme os", "Switch desktop style: theme win95|macos9", (S, args) => {
      const requested = (args[0] || "").toLowerCase();
      const aliases = { win95: "win95", windows: "win95", windows95: "win95", mac: "macos9", macos: "macos9", macos9: "macos9" };
      const appearance = aliases[requested];
      if (!appearance) {
        S.text("Desktop styles: win95, macos9", "warn");
        S.text("Current: " + state.appearance, "dim");
        return;
      }
      setAppearance(appearance);
      S.text("Desktop style set to " + activeTheme.name, "ok");
    });
    cmd("engine", "Set search engine: engine google", (S, args) => {
      const k = (args[0] || "").toLowerCase();
      if (!ENGINES[k]) {
        S.text("Engines: " + Object.keys(ENGINES).join(", "), "warn");
        S.text("Current: " + ENGINES[state.engine].name, "dim");
        return;
      }
      state.engine = k;
      save();
      S.text("Search engine set to " + ENGINES[k].name, "ok");
    });
    cmd("wallpaper wall bg", "Set the wallpaper: wallpaper <file|none> [fit|center|tile|stretch]", (S, args) => {
      if (!args.length) {
        S.text("wallpaper : " + (state.wallpaper || "(none)"));
        S.text("mode      : " + state.wallpaperMode + "   size: " + state.wallpaperSize + "%   strength: " + state.wallpaperFade + "%");
        S.out('usage: <span class="hd">wallpaper &lt;file|url|none&gt; [fit|center|tile|stretch] [10-100%]</span>', "dim");
        return;
      }
      const modes = Object.keys(WALL_MODES);
      const mode = args.find((a) => modes.includes(a.toLowerCase()));
      const pct = args.find((a) => /^\d{1,3}%?$/.test(a));
      const rest = args.filter((a) => a !== mode && a !== pct).join(" ").trim();
      if (mode) state.wallpaperMode = mode.toLowerCase();
      if (pct) state.wallpaperSize = Math.max(10, Math.min(100, parseInt(pct, 10)));
      if (rest) {
        if (/^(none|off|clear)$/i.test(rest)) state.wallpaper = "";
        else if (/^(logo|flag|win95|windows)$/i.test(rest)) state.wallpaper = LOGO;
        else state.wallpaper = rest;
      }
      save();
      applyWallpaper();
      S.text("wallpaper: " + (state.wallpaper || "(none)") + "  [" + state.wallpaperMode + "]", "ok");
      if (state.wallpaper && !/^https?:/i.test(state.wallpaper))
        S.text("(the file must sit next to index.html)", "dim");
    });
    cmd("export backup", "Dump your MiniOS data as JSON", (S) => {
      openNotepad("__export__", JSON.stringify({ fs: state.fs, notes: state.notes, npp: state.npp, coto: state.coto }, null, 2), "Export.json");
      S.text("Opened export in notepad \u2014 copy it somewhere safe.", "ok");
    });
    cmd("neofetch winfetch about ver", "System info", (S) => {
      const art = [
        "        ,.=:^!^!t3Z3z.,        ",
        "       :tt:::tt333EE3         ",
        "       Et:::ztt33EEE  @Ee.,   ",
        "      ;tt:::tt333EE7 ;EEEEEEttt",
        "     :Et:::zt333EEQ. $EEEEEttt ",
        "     it::::tt333EEF @EEEEEEttt ",
        '    ;3=*^```"*4EEV :EEEEEEttt  ',
        "    ,.=::::!t=., ` @EEEEEEtttz ",
        '   @EEEEEEEtttz.  "QEEEEEEE"   '
      ];
      const nodes = Object.keys(byId).length;
      const links = Object.values(byId).filter((n) => n.type === "link").length;
      const info = [
        state.user + "@" + state.host,
        "-----------------",
        "OS: " + activeTheme.shortName + " " + (AS_EXT ? "(new tab edition)" : "(file edition)"),
        "Shell: " + SHELLS[S.shell].label,
        "Terminal: web95-term",
        "Engine: " + ENGINES[state.engine].name,
        "Folders: " + (nodes - links - 1),
        "Bookmarks: " + links,
        "Windows open: " + wins.length,
        "Resolution: " + window.innerWidth + "x" + window.innerHeight,
        "Uptime: " + Math.round((Date.now() - BOOT) / 1e3) + "s"
      ];
      const rows = Math.max(art.length, info.length);
      for (let i = 0; i < rows; i++) {
        const a = (art[i] || "").padEnd(32);
        const b = info[i] || "";
        S.out('<span class="p2">' + esc(a) + "</span>" + (i === 0 ? '<span class="p1">' + esc(b) + "</span>" : esc(b)));
      }
    });
    cmd("exit quit logout", "Close this terminal", (S) => {
      S.win.close();
    });
    cmd("reset factory-reset", "Wipe everything and start fresh", async (S) => {
      if (await ask("This erases all your folders, bookmarks and notes. Continue?", `Reset ${activeTheme.shortName}`)) {
        await wipe();
        state = defaults();
        activeTheme = themeFor(state.appearance);
        ICONS = activeTheme.icons;
        WALLPAPER_PRESETS = activeTheme.wallpapers;
        reindex();
        save();
        applyChrome();
        refreshWindowIcons();
        refreshAll();
        S.text("Reset complete.", "ok");
      } else S.text("Cancelled.", "dim");
    });
    function runCotoPipeline(S, raw) {
      const stages = splitPipeline(raw);
      if (stages.length < 2) return false;
      const source = tokenize(stages[0]);
      const sourceName = (source.shift() || "").toLowerCase();
      if (!["ls", "dir", "gci", "get-childitem", "l"].includes(sourceName)) {
        S.text("cs: an object pipeline starts with ls or Get-ChildItem", "err");
        return true;
      }
      const sourceTarget = source.filter((argument) => !argument.startsWith("-"))[0] || ".";
      const folder = resolve(sourceTarget, S.cwd);
      if (!isFolder(folder)) {
        S.text(`Get-ChildItem: '${sourceTarget}' is not a folder.`, "err");
        return true;
      }
      let objects = sortedChildren(folder);
      for (const stage of stages.slice(1)) {
        const parts = tokenize(stage);
        const stageName = (parts.shift() || "").toLowerCase();
        const expression = parts.join(" ").trim();
        if (["grep", "where", "select-string"].includes(stageName)) {
          if (!expression) {
            S.text(`${stageName}: missing filter text`, "err");
            return true;
          }
          const query = expression.toLowerCase();
          objects = objects.filter((item) => (item.name + " " + (isFolder(item) ? "folder" : item.url)).toLowerCase().includes(query));
          continue;
        }
        if (["where-object", "?"].includes(stageName)) {
          if (!expression) {
            S.text("Where-Object: use type=folder, type=link, or name=<text>", "warn");
            return true;
          }
          const typeMatch = expression.match(/(?:type|kind)?\s*(?:=|-eq)?\s*(folder|directory|dir|link|bookmark)\b/i);
          if (typeMatch) {
            const wantsFolder = /^(folder|directory|dir)$/i.test(typeMatch[1]);
            objects = objects.filter((item) => isFolder(item) === wantsFolder);
            continue;
          }
          const nameMatch = expression.match(/name\s*(?:=|~=|-like)?\s*\*?(.+?)\*?$/i);
          const query = (nameMatch?.[1] || expression).toLowerCase();
          objects = objects.filter((item) => item.name.toLowerCase().includes(query));
          continue;
        }
        if (["sort", "sort-object"].includes(stageName)) {
          const property = parts.find((part) => !part.startsWith("-"))?.toLowerCase() || "name";
          const descending = parts.some((part) => /^(?:-r|-descending)$/i.test(part));
          objects.sort((a, b) => {
            const left = property === "type" || property === "kind" ? isFolder(a) ? "folder" : "link" : a.name;
            const right = property === "type" || property === "kind" ? isFolder(b) ? "folder" : "link" : b.name;
            return left.localeCompare(right) * (descending ? -1 : 1);
          });
          continue;
        }
        if (["head", "first", "select-object"].includes(stageName)) {
          const firstIndex = parts.findIndex((part) => /^-first$/i.test(part));
          const amountText = stageName === "select-object" ? parts[firstIndex + 1] : parts[0];
          const amount = Math.max(0, Math.min(100, parseInt(amountText || "10", 10) || 10));
          objects = objects.slice(0, amount);
          continue;
        }
        if (["wc", "measure", "measure-object"].includes(stageName)) {
          S.out('<span class="p3">Count</span>  ' + objects.length);
          return true;
        }
        S.text(`cs: unsupported pipeline stage '${stageName}'`, "err");
        S.text("Try grep, Select-String, Where-Object, sort, Sort-Object, head, Select-Object -First, or Measure-Object.", "dim");
        return true;
      }
      fmtCotoObjects(S, objects, folder);
      return true;
    }
    function runCommand(S, line) {
      const raw = line.trim();
      if (!raw) return;
      if (S.shell === "coto" && runCotoPipeline(S, raw)) return;
      const parts = tokenize(raw);
      const name = parts[0].toLowerCase();
      const args = parts.slice(1);
      const c = COMMANDS[name] && (!COMMANDS[name].shells || COMMANDS[name].shells.includes(S.shell)) ? COMMANDS[name] : null;
      if (c) return c.run(S, args, raw);
      const direct = resolve(raw, S.cwd);
      if (direct && !isFolder(direct)) return COMMANDS.open.run(S, [raw]);
      if (direct && isFolder(direct)) return COMMANDS.cd.run(S, [raw]);
      if (looksLikeUrl(raw)) return COMMANDS.open.run(S, [raw]);
      notFound(S, parts[0]);
    }
    document.addEventListener("click", (e) => {
      const t = e.target.closest(".term .lnk");
      if (t && t.dataset.url) go(t.dataset.url);
    });
    function safeMarkdownHref(value) {
      const trimmed = value.trim();
      if (trimmed.startsWith("#")) return trimmed;
      try {
        const parsed = new URL(trimmed, location.href);
        return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? trimmed : null;
      } catch {
        return null;
      }
    }
    function renderMarkdownInline(source) {
      const tokens = [];
      const hold = (html) => `\0${tokens.push(html) - 1}\0`;
      let text = source.replace(/`([^`\n]+)`/g, (_match, code) => hold(`<code>${esc(code)}</code>`)).replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_match, label, url) => {
        const href = safeMarkdownHref(url);
        return href ? hold(`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`) : `[${label}](${url})`;
      });
      text = esc(text).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_\n]+)__/g, "<strong>$1</strong>").replace(/~~([^~\n]+)~~/g, "<del>$1</del>").replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>").replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
      return text.replace(/\u0000(\d+)\u0000/g, (_match, index) => tokens[Number(index)] || "");
    }
    function renderMarkdown(source) {
      const output = [];
      const lines = source.replace(/\r\n?/g, "\n").split("\n");
      let list = null;
      let code = null;
      let codeLanguage = "";
      const closeList = () => {
        if (list) {
          output.push(`</${list}>`);
          list = null;
        }
      };
      lines.forEach((line) => {
        const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
        if (fence) {
          closeList();
          if (code) {
            const label = codeLanguage ? `<span>${esc(codeLanguage)}</span>` : "";
            output.push(`<pre>${label}<code>${esc(code.join("\n"))}</code></pre>`);
            code = null;
            codeLanguage = "";
          } else {
            code = [];
            codeLanguage = fence[1] || "";
          }
          return;
        }
        if (code) {
          code.push(line);
          return;
        }
        if (!line.trim()) {
          closeList();
          output.push("");
          return;
        }
        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
          closeList();
          const level = heading[1].length;
          output.push(`<h${level}>${renderMarkdownInline(heading[2])}</h${level}>`);
          return;
        }
        if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
          closeList();
          output.push("<hr>");
          return;
        }
        const quote = line.match(/^\s*>\s?(.*)$/);
        if (quote) {
          closeList();
          output.push(`<blockquote>${renderMarkdownInline(quote[1])}</blockquote>`);
          return;
        }
        const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
        const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
        if (unordered || ordered) {
          const nextList = unordered ? "ul" : "ol";
          if (list !== nextList) {
            closeList();
            list = nextList;
            output.push(`<${list}>`);
          }
          const item = (unordered || ordered)[1];
          const task = item.match(/^\[([ xX])\]\s+(.+)$/);
          output.push(task ? `<li class="task"><input type="checkbox" disabled${task[1].toLowerCase() === "x" ? " checked" : ""}>${renderMarkdownInline(task[2])}</li>` : `<li>${renderMarkdownInline(item)}</li>`);
          return;
        }
        closeList();
        output.push(`<p>${renderMarkdownInline(line)}</p>`);
      });
      closeList();
      if (code) output.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
      return output.join("\n") || '<p class="empty-preview">Nothing to preview yet.</p>';
    }
    function openNotepad(key, seed, title) {
      const markdownMode = key !== "__export__";
      const rawName = title || (key === "welcome" ? "Untitled" : key);
      const noteName = markdownMode && !/\.[a-z0-9]+$/i.test(rawName) ? rawName + ".md" : rawName;
      const w = makeWindow({ title: noteName + " - Notepad", icon: ICONS.notepad, kind: "notepad", w: markdownMode ? 720 : 520, h: markdownMode ? 480 : 380 });
      const mb = el("div", "menubar");
      const toolbar = el("div", "note-toolbar");
      const workspace = el("div", "note-workspace edit-only");
      const ta = el("textarea", "note in");
      const preview = el("div", "note-preview in");
      const status = el("div", "status");
      const s1 = el("div");
      s1.style.flex = "1";
      const s2 = el("div", null, markdownMode ? "Markdown" : "Text");
      status.append(s1, s2);
      ta.value = seed != null ? seed : state.notes[key] || "";
      ta.spellcheck = markdownMode;
      ta.setAttribute("aria-label", markdownMode ? "Markdown source" : "Notepad text");
      preview.tabIndex = 0;
      preview.setAttribute("aria-label", "Markdown preview");
      workspace.append(ta, preview);
      let viewMode = "edit";
      let flashTimer = 0;
      let previewFrame = 0;
      const viewButtons = {};
      const store = () => {
        if (key !== "__export__") {
          state.notes[key] = ta.value;
          save();
        }
      };
      const info = () => {
        const words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
        return `${ta.value.length} chars \xB7 ${words} words \xB7 ${ta.value.split("\n").length} lines` + (key === "__export__" ? " \xB7 not saved" : " \xB7 autosaved");
      };
      const updatePreview = () => {
        if (!markdownMode) return;
        preview.innerHTML = renderMarkdown(ta.value);
      };
      const queuePreview = () => {
        if (!markdownMode || viewMode === "edit") return;
        if (previewFrame) cancelAnimationFrame(previewFrame);
        previewFrame = requestAnimationFrame(() => {
          previewFrame = 0;
          updatePreview();
        });
      };
      const flash = (message) => {
        s1.textContent = message;
        if (flashTimer) window.clearTimeout(flashTimer);
        flashTimer = window.setTimeout(() => {
          s1.textContent = info();
        }, 1400);
      };
      const changed = () => {
        store();
        s1.textContent = info();
        queuePreview();
      };
      const setView = (mode) => {
        viewMode = mode;
        workspace.className = "note-workspace " + (mode === "edit" ? "edit-only" : mode === "preview" ? "preview-only" : "split");
        Object.keys(viewButtons).forEach((name) => {
          const button = viewButtons[name];
          if (button) button.setAttribute("aria-pressed", String(name === mode));
        });
        if (mode !== "edit") updatePreview();
        s2.textContent = mode === "edit" ? "Markdown" : mode[0].toUpperCase() + mode.slice(1);
        if (mode !== "preview") setTimeout(() => ta.focus(), 0);
      };
      const replaceSelection = (before, after, placeholder) => {
        const start = ta.selectionStart, end = ta.selectionEnd;
        const selected = ta.value.slice(start, end) || placeholder;
        ta.setRangeText(before + selected + after, start, end, "end");
        ta.setSelectionRange(start + before.length, start + before.length + selected.length);
        changed();
        ta.focus();
      };
      const prefixLines = (prefix, strip) => {
        const start = ta.value.lastIndexOf("\n", Math.max(0, ta.selectionStart - 1)) + 1;
        const nextBreak = ta.value.indexOf("\n", ta.selectionEnd);
        const end = nextBreak < 0 ? ta.value.length : nextBreak;
        const replacement = ta.value.slice(start, end).split("\n").map((line) => prefix + (strip ? line.replace(strip, "") : line)).join("\n");
        ta.setRangeText(replacement, start, end, "select");
        changed();
        ta.focus();
      };
      const insertLink = () => {
        const start = ta.selectionStart, end = ta.selectionEnd;
        const label = ta.value.slice(start, end) || "link text";
        const url = "https://example.com";
        ta.setRangeText(`[${label}](${url})`, start, end, "end");
        const urlStart = start + label.length + 3;
        ta.setSelectionRange(urlStart, urlStart + url.length);
        changed();
        ta.focus();
      };
      const insertCode = () => {
        const selected = ta.value.slice(ta.selectionStart, ta.selectionEnd);
        selected.includes("\n") ? replaceSelection("```\n", "\n```", "code") : replaceSelection("`", "`", "code");
      };
      const downloadMarkdown = () => {
        const blob = new Blob([ta.value], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = noteName.replace(/[^a-z0-9._-]+/gi, "-") || "Untitled.md";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        flash("Markdown downloaded.");
      };
      const formatting = {
        heading: () => prefixLines("# ", /^#{1,6}\s+/),
        bold: () => replaceSelection("**", "**", "bold text"),
        italic: () => replaceSelection("*", "*", "italic text"),
        strike: () => replaceSelection("~~", "~~", "struck text"),
        bullet: () => prefixLines("- ", /^[-+*]\s+/),
        numbered: () => prefixLines("1. ", /^\d+[.)]\s+/),
        task: () => prefixLines("- [ ] ", /^[-+*]\s+(?:\[[ xX]\]\s+)?/),
        quote: () => prefixLines("> ", /^>\s?/),
        code: insertCode,
        link: insertLink
      };
      const addTool = (label, titleText, action) => {
        const button = el("button", null, label);
        button.type = "button";
        button.title = titleText;
        button.setAttribute("aria-label", titleText);
        button.onclick = action;
        toolbar.appendChild(button);
        return button;
      };
      if (markdownMode) {
        addTool("H1", "Heading", formatting.heading);
        addTool("B", "Bold (Ctrl+B)", formatting.bold).classList.add("strong");
        addTool("I", "Italic (Ctrl+I)", formatting.italic).classList.add("italic");
        addTool("S", "Strikethrough", formatting.strike).classList.add("strike");
        toolbar.appendChild(el("span", "sep"));
        addTool("\u2022", "Bulleted list", formatting.bullet);
        addTool("1.", "Numbered list", formatting.numbered);
        addTool("\u2610", "Task list", formatting.task);
        addTool("\u276F", "Block quote", formatting.quote);
        addTool("<>", "Inline or fenced code", formatting.code);
        addTool("\u{1F517}", "Link", formatting.link);
        toolbar.appendChild(el("span", "spacer"));
        ["edit", "split", "preview"].forEach((mode) => {
          const label = mode[0].toUpperCase() + mode.slice(1);
          viewButtons[mode] = addTool(label, `${label} view`, () => setView(mode));
        });
      }
      const copyMarkdown = () => {
        ta.select();
        const done = (ok) => flash(ok ? markdownMode ? "Copied Markdown." : "Copied text." : "Could not copy \u2014 press Ctrl+C.");
        if (navigator.clipboard && navigator.clipboard.writeText)
          navigator.clipboard.writeText(ta.value).then(() => done(true), () => done(false));
        else done(!!(document.execCommand && document.execCommand("copy")));
      };
      ["File", "Edit", ...markdownMode ? ["Format", "View"] : [], "Help"].forEach((m) => {
        const s = el("span", null, m);
        s.onclick = () => {
          const r = s.getBoundingClientRect();
          if (m === "File") menu(r.left, r.bottom, [
            { label: "Save", action: () => {
              store();
              flash("Saved.");
            } },
            { label: markdownMode ? "Copy Markdown" : "Select all & copy", action: copyMarkdown },
            ...markdownMode ? [{ label: "Download .md", action: downloadMarkdown }] : [],
            "-",
            { label: "Close", action: () => w.close() }
          ]);
          else if (m === "Edit") menu(r.left, r.bottom, [
            { label: "Select all", action: () => {
              ta.focus();
              ta.select();
            } },
            { label: "Clear", action: () => {
              ta.value = "";
              changed();
            } },
            { label: "Word wrap (always on)", disabled: true }
          ]);
          else if (m === "Format") menu(r.left, r.bottom, [
            { label: "Heading", action: formatting.heading },
            { label: "Bold", action: formatting.bold },
            { label: "Italic", action: formatting.italic },
            { label: "Strikethrough", action: formatting.strike },
            "-",
            { label: "Bulleted list", action: formatting.bullet },
            { label: "Numbered list", action: formatting.numbered },
            { label: "Task list", action: formatting.task },
            { label: "Block quote", action: formatting.quote },
            { label: "Code", action: formatting.code },
            { label: "Link", action: formatting.link }
          ]);
          else if (m === "View") menu(r.left, r.bottom, [
            { label: "Edit", action: () => setView("edit") },
            { label: "Split", action: () => setView("split") },
            { label: "Preview", action: () => setView("preview") }
          ]);
          else menu(r.left, r.bottom, markdownMode ? [
            { label: "Markdown syntax", action: () => say("# Heading\n**bold**  *italic*  ~~strike~~\n- list  1. numbered  - [ ] task\n> quote\n`inline code` or fenced code\n[link text](https://example.com)", "Markdown syntax") },
            { label: "About Notepad", action: () => say(`${activeTheme.shortName} Notepad.
Markdown text is stored in this browser only.`, "About") }
          ] : [
            { label: "About Notepad", action: () => say(`${activeTheme.shortName} Notepad.
Text is stored in this browser only.`, "About") }
          ]);
        };
        mb.appendChild(s);
      });
      w.body.appendChild(mb);
      if (markdownMode) w.body.appendChild(toolbar);
      w.body.append(workspace, status);
      ta.addEventListener("input", changed);
      ta.addEventListener("keydown", (event) => {
        if (!markdownMode || !event.ctrlKey) return;
        if (event.key.toLowerCase() === "b") {
          event.preventDefault();
          formatting.bold();
        } else if (event.key.toLowerCase() === "i") {
          event.preventDefault();
          formatting.italic();
        } else if (event.altKey && event.key.toLowerCase() === "p") {
          event.preventDefault();
          setView(viewMode === "edit" ? "split" : "edit");
        }
      });
      s1.textContent = info();
      if (markdownMode) setView("edit");
      setTimeout(() => ta.focus(), 30);
      return w;
    }
    function openMiniEditor() {
      const ex = wins.find((x) => x.kind === "npp");
      if (ex) {
        focusWin(ex);
        return ex;
      }
      const doc = state.npp = Object.assign({
        name: "Untitled.txt",
        language: "Plain text",
        wrap: false,
        fontSize: 12,
        text: ""
      }, state.npp || {});
      const w = makeWindow({ title: doc.name + " \u2014 MiniEditor", icon: ICONS.npp, kind: "npp", w: 760, h: 520 });
      const mb = el("div", "menubar");
      const toolbar = el("div", "npp-toolbar");
      const tabs = el("div", "npp-tabs");
      const tab = el("div", "npp-tab");
      const tabName = el("span", null, doc.name);
      tab.title = doc.name;
      tab.appendChild(tabName);
      tabs.appendChild(tab);
      const editor = el("div", "npp-editor");
      const lines = el("pre", "npp-lines");
      const ta = el("textarea", "npp-text");
      ta.value = doc.text || "";
      ta.spellcheck = false;
      ta.wrap = doc.wrap ? "soft" : "off";
      ta.setAttribute("aria-label", "MiniEditor document editor");
      editor.append(lines, ta);
      const status = el("div", "npp-status");
      const message = el("span", "npp-message", "Ready");
      const counts = el("span", "npp-counts", "");
      const position = el("span", "npp-position", "Ln 1, Col 1");
      const encoding = el("span", null, "UTF-8");
      const langStatus = el("span", null, doc.language);
      const zoomStatus = el("span", "npp-zoom", "100%");
      status.append(message, counts, position, encoding, langStatus, zoomStatus);
      let flashTimer = null;
      const flash = (text) => {
        clearTimeout(flashTimer);
        message.textContent = text;
        flashTimer = setTimeout(() => {
          message.textContent = "Saved locally";
        }, 1500);
      };
      const saveNow = () => {
        doc.text = ta.value;
        state.npp = doc;
        save();
      };
      const queueSavedMessage = () => {
        clearTimeout(flashTimer);
        message.textContent = "Saving\u2026";
        flashTimer = setTimeout(() => {
          message.textContent = "Saved locally";
        }, 260);
      };
      const refreshPosition = () => {
        const before = ta.value.slice(0, ta.selectionStart);
        const line = before.split("\n").length;
        const lastBreak = before.lastIndexOf("\n");
        const selected = Math.abs(ta.selectionEnd - ta.selectionStart);
        position.textContent = "Ln " + line + ", Col " + (before.length - lastBreak) + (selected ? " \xB7 Sel " + selected : "");
      };
      const refreshEditor = () => {
        const lineCount = Math.max(1, ta.value.split("\n").length);
        const wordCount = (ta.value.match(/\S+/g) || []).length;
        lines.textContent = Array.from({ length: lineCount }, (_, i) => i + 1).join("\n");
        lines.style.flexBasis = Math.max(44, String(lineCount).length * 8 + 20) + "px";
        counts.textContent = lineCount + " lines \xB7 " + wordCount + " words \xB7 " + ta.value.length + " chars";
        refreshPosition();
      };
      const syncDocumentName = () => {
        tabName.textContent = doc.name;
        tab.title = doc.name;
        w.setTitle(doc.name + " \u2014 MiniEditor");
      };
      const setWrap = (on) => {
        doc.wrap = !!on;
        ta.wrap = doc.wrap ? "soft" : "off";
        ta.classList.toggle("wrap", doc.wrap);
        bWrap.classList.toggle("pressed", doc.wrap);
        bWrap.setAttribute("aria-pressed", doc.wrap ? "true" : "false");
        saveNow();
      };
      const setFontSize = (size) => {
        doc.fontSize = Math.max(10, Math.min(18, Number(size) || 12));
        editor.style.setProperty("--editor-font-size", doc.fontSize + "px");
        zoomStatus.textContent = Math.round(doc.fontSize / 12 * 100) + "%";
        saveNow();
      };
      const rename = async () => {
        const r = await dialog({ title: "Rename document", icon: ICONS.npp, fields: [{ key: "name", label: "File name:", value: doc.name }] });
        if (!r || !r.name.trim()) return;
        doc.name = r.name.trim();
        syncDocumentName();
        saveNow();
        flash("Renamed");
      };
      const newDocument = async () => {
        if (ta.value.trim() && !await ask("Start a new document? Your current document is already saved locally.", "MiniEditor")) return;
        ta.value = "";
        doc.name = "Untitled.txt";
        doc.language = "Plain text";
        language.value = doc.language;
        langStatus.textContent = doc.language;
        syncDocumentName();
        saveNow();
        refreshEditor();
        ta.focus();
        flash("New document");
      };
      let lastFind = "";
      const findNext = (query) => {
        const needleText = query || lastFind;
        if (!needleText) {
          findText();
          return;
        }
        lastFind = needleText;
        const haystack = ta.value.toLowerCase(), needle = needleText.toLowerCase();
        let at = haystack.indexOf(needle, ta.selectionEnd);
        if (at < 0) at = haystack.indexOf(needle, 0);
        if (at < 0) {
          flash("Text not found");
          return;
        }
        ta.focus();
        ta.setSelectionRange(at, at + needleText.length);
        refreshPosition();
        flash("Match selected");
      };
      const findText = async () => {
        const r = await dialog({ title: "Find", icon: ICONS.find, fields: [{ key: "query", label: "Find what:", value: lastFind }] });
        if (!r || !r.query) return;
        findNext(r.query);
      };
      const replaceText = async () => {
        const selected = ta.value.slice(ta.selectionStart, ta.selectionEnd);
        const r = await dialog({ title: "Replace all", icon: ICONS.find, fields: [
          { key: "find", label: "Find what:", value: selected || lastFind },
          { key: "replacement", label: "Replace with:", value: "" }
        ], buttons: [{ label: "Replace all", value: true, primary: true }, { label: "Cancel", value: null }] });
        if (!r || !r.find) return;
        lastFind = r.find;
        const pieces = ta.value.split(r.find);
        const replacements = pieces.length - 1;
        if (!replacements) {
          flash("Text not found");
          ta.focus();
          return;
        }
        ta.value = pieces.join(r.replacement);
        saveNow();
        refreshEditor();
        queueSavedMessage();
        ta.focus();
        flash(replacements + (replacements === 1 ? " replacement" : " replacements"));
      };
      const goToLine = async () => {
        const current = ta.value.slice(0, ta.selectionStart).split("\n").length;
        const r = await dialog({ title: "Go to line", icon: ICONS.find, fields: [{ key: "line", label: "Line number:", value: String(current) }] });
        if (!r) return;
        const allLines = ta.value.split("\n");
        const target = Math.max(1, Math.min(allLines.length, parseInt(r.line, 10) || 1));
        const at = allLines.slice(0, target - 1).reduce((n, line) => n + line.length + 1, 0);
        ta.focus();
        ta.setSelectionRange(at, at);
        refreshPosition();
        flash("Line " + target);
      };
      const copyAll = () => {
        ta.select();
        const done = (ok) => flash(ok ? "Copied to clipboard" : "Press Ctrl+C to copy");
        if (navigator.clipboard && navigator.clipboard.writeText)
          navigator.clipboard.writeText(ta.value).then(() => done(true), () => done(false));
        else done(!!(document.execCommand && document.execCommand("copy")));
      };
      const downloadDocument = () => {
        saveNow();
        const safeName = (doc.name || "Untitled.txt").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
        const url = URL.createObjectURL(new Blob([ta.value], { type: "text/plain;charset=utf-8" }));
        const a = el("a");
        a.href = url;
        a.download = safeName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1e3);
        flash("Downloaded " + safeName);
      };
      const fileInput = el("input", "npp-file-input");
      fileInput.type = "file";
      fileInput.accept = ".txt,.md,.markdown,.coto,.js,.mjs,.cjs,.html,.htm,.css,.json,.xml,.csv,.log,.sh,.ps1,text/*";
      const languageForName = (name) => {
        const ext = (name.split(".").pop() || "").toLowerCase();
        return { coto: "Coto", js: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", html: "HTML", htm: "HTML", css: "CSS", json: "JSON", md: "Markdown", markdown: "Markdown", sh: "Shell", ps1: "PowerShell" }[ext] || "Plain text";
      };
      const loadFile = async (file) => {
        if (!file) return;
        if (ta.value.trim() && !await ask("Open '" + file.name + "'? Your current document is already saved locally.", "MiniEditor")) return;
        try {
          ta.value = await file.text();
          doc.name = file.name || "Untitled.txt";
          doc.language = languageForName(doc.name);
          language.value = doc.language;
          langStatus.textContent = doc.language;
          syncDocumentName();
          saveNow();
          refreshEditor();
          ta.scrollTop = 0;
          lines.scrollTop = 0;
          ta.focus();
          flash("Opened " + doc.name);
        } catch (e) {
          say("MiniEditor could not read that file.", "Open file");
        }
      };
      fileInput.onchange = () => {
        const file = fileInput.files && fileInput.files[0];
        loadFile(file).finally(() => {
          fileInput.value = "";
        });
      };
      ["File", "Edit", "View", "Language", "Help"].forEach((name) => {
        const item = el("span", null, name);
        item.onclick = () => {
          const r = item.getBoundingClientRect();
          if (name === "File") menu(r.left, r.bottom, [
            { label: "New                 Ctrl+N", action: newDocument },
            { label: "Open text file\u2026  Ctrl+O", action: () => fileInput.click() },
            "-",
            { label: "Save locally      Ctrl+S", action: () => {
              saveNow();
              flash("Saved locally");
            } },
            { label: "Download copy\u2026", action: downloadDocument },
            { label: "Rename\u2026", action: rename },
            "-",
            { label: "Select all & copy", action: copyAll },
            "-",
            { label: "Close", action: () => w.close() }
          ]);
          else if (name === "Edit") menu(r.left, r.bottom, [
            { label: "Undo              Ctrl+Z", action: () => {
              ta.focus();
              document.execCommand("undo");
              refreshEditor();
              saveNow();
            } },
            { label: "Redo              Ctrl+Y", action: () => {
              ta.focus();
              document.execCommand("redo");
              refreshEditor();
              saveNow();
            } },
            "-",
            { label: "Select all        Ctrl+A", action: () => {
              ta.focus();
              ta.select();
              refreshPosition();
            } },
            "-",
            { label: "Find\u2026             Ctrl+F", action: findText },
            { label: "Find next              F3", action: () => findNext() },
            { label: "Replace all\u2026      Ctrl+H", action: replaceText },
            { label: "Go to line\u2026       Ctrl+G", action: goToLine }
          ]);
          else if (name === "View") menu(r.left, r.bottom, [
            { label: (doc.wrap ? "\u2713 " : "") + "Word wrap", action: () => setWrap(!doc.wrap) },
            "-",
            { label: "Zoom in        Ctrl++", action: () => setFontSize(doc.fontSize + 1) },
            { label: "Zoom out       Ctrl+-", action: () => setFontSize(doc.fontSize - 1) },
            { label: "Reset zoom     Ctrl+0", action: () => setFontSize(12) }
          ]);
          else if (name === "Language") menu(r.left, r.bottom, LANGUAGES.map((label) => ({ label: (doc.language === label ? "\u2713 " : "") + label, action: () => setLanguage(label) })));
          else menu(r.left, r.bottom, [{ label: "Keyboard shortcuts", action: () => say("Ctrl+N  New document\nCtrl+O  Open text file\nCtrl+S  Save locally\nCtrl+F  Find\nF3  Find next\nCtrl+H  Replace all\nCtrl+G  Go to line\nCtrl++ / Ctrl+-  Zoom\nTab / Shift+Tab  Indent / outdent", "MiniEditor shortcuts") }, "-", { label: "About MiniEditor", action: () => say(`A small, focused editor for ${activeTheme.shortName}. Documents autosave in this browser, and can be opened from or downloaded to your computer.`, "MiniEditor") }]);
        };
        mb.appendChild(item);
      });
      const bNew = el("button", null, "New");
      bNew.onclick = newDocument;
      const bOpen = el("button", null, "Open");
      bOpen.onclick = () => fileInput.click();
      const bSave = el("button", null, "Save");
      bSave.onclick = () => {
        saveNow();
        flash("Saved locally");
      };
      const bDownload = el("button", null, "Download");
      bDownload.onclick = downloadDocument;
      const bFind = el("button", null, "Find");
      bFind.onclick = findText;
      const bWrap = el("button", null, "Wrap");
      bWrap.onclick = () => setWrap(!doc.wrap);
      [[bNew, "New document (Ctrl+N)"], [bOpen, "Open a text file (Ctrl+O)"], [bSave, "Save in this browser (Ctrl+S)"], [bDownload, "Download a copy"], [bFind, "Find text (Ctrl+F)"], [bWrap, "Toggle word wrap"]].forEach(([button, title]) => button.title = title);
      const language = el("select");
      const LANGUAGES = ["Plain text", "Coto", "JavaScript", "HTML", "CSS", "JSON", "Markdown", "Shell", "PowerShell"];
      LANGUAGES.forEach((name) => {
        const o = el("option", null, name);
        o.value = name;
        if (name === doc.language) o.selected = true;
        language.appendChild(o);
      });
      const setLanguage = (name) => {
        doc.language = name;
        language.value = name;
        langStatus.textContent = name;
        saveNow();
        flash(name + " mode");
      };
      language.onchange = () => setLanguage(language.value);
      const languageLabel = el("label");
      languageLabel.append(el("span", null, "Language:"), language);
      toolbar.append(bNew, bOpen, bSave, bDownload, el("span", "sep"), bFind, bWrap, el("span", "sep"), languageLabel, fileInput);
      ta.addEventListener("input", () => {
        saveNow();
        refreshEditor();
        queueSavedMessage();
      });
      ta.addEventListener("scroll", () => {
        lines.scrollTop = ta.scrollTop;
      });
      ["click", "keyup", "select"].forEach((type) => ta.addEventListener(type, refreshPosition));
      ta.addEventListener("keydown", (e) => {
        if (e.ctrlKey && (e.key === "n" || e.key === "N")) {
          e.preventDefault();
          newDocument();
          return;
        }
        if (e.ctrlKey && (e.key === "o" || e.key === "O")) {
          e.preventDefault();
          fileInput.click();
          return;
        }
        if (e.ctrlKey && (e.key === "s" || e.key === "S")) {
          e.preventDefault();
          saveNow();
          flash("Saved locally");
          return;
        }
        if (e.ctrlKey && (e.key === "f" || e.key === "F")) {
          e.preventDefault();
          findText();
          return;
        }
        if (e.ctrlKey && (e.key === "h" || e.key === "H")) {
          e.preventDefault();
          replaceText();
          return;
        }
        if (e.ctrlKey && (e.key === "g" || e.key === "G")) {
          e.preventDefault();
          goToLine();
          return;
        }
        if (e.key === "F3") {
          e.preventDefault();
          findNext();
          return;
        }
        if (e.ctrlKey && (e.key === "+" || e.key === "=")) {
          e.preventDefault();
          setFontSize(doc.fontSize + 1);
          return;
        }
        if (e.ctrlKey && e.key === "-") {
          e.preventDefault();
          setFontSize(doc.fontSize - 1);
          return;
        }
        if (e.ctrlKey && e.key === "0") {
          e.preventDefault();
          setFontSize(12);
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          const start = ta.selectionStart, end = ta.selectionEnd;
          const lineStart = ta.value.lastIndexOf("\n", start - 1) + 1;
          const block = ta.value.slice(lineStart, end);
          if (start !== end) {
            const changed = e.shiftKey ? block.replace(/^( {1,2}|\t)/gm, "") : block.replace(/^/gm, "  ");
            ta.setRangeText(changed, lineStart, end, "select");
          } else if (e.shiftKey) {
            const prefix = (ta.value.slice(lineStart).match(/^( {1,2}|\t)/) || [""])[0];
            if (prefix) {
              ta.setRangeText("", lineStart, lineStart + prefix.length, "end");
              ta.setSelectionRange(Math.max(lineStart, start - prefix.length), Math.max(lineStart, start - prefix.length));
            }
          } else ta.setRangeText("  ", start, end, "end");
          saveNow();
          refreshEditor();
          queueSavedMessage();
        }
      });
      editor.addEventListener("dragover", (e) => {
        if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault();
          editor.classList.add("drop-target");
        }
      });
      editor.addEventListener("dragleave", (e) => {
        if (!editor.contains(e.relatedTarget)) editor.classList.remove("drop-target");
      });
      editor.addEventListener("drop", (e) => {
        e.preventDefault();
        editor.classList.remove("drop-target");
        loadFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
      });
      w.onClose = saveNow;
      w.body.append(mb, toolbar, tabs, editor, status);
      setFontSize(doc.fontSize);
      setWrap(doc.wrap);
      refreshEditor();
      setTimeout(() => ta.focus(), 40);
      return w;
    }
    const COTO_ACCENTS = {
      orbit: { name: "Orbit violet", note: "Curious and composed" },
      coral: { name: "Human coral", note: "Warm and energetic" },
      mint: { name: "Fresh mint", note: "Clear and restorative" }
    };
    function openCoto(initialView = "home") {
      const existing = wins.find((x) => x.kind === "coto");
      if (existing) {
        focusWin(existing);
        existing.api.openView?.(initialView);
        return existing;
      }
      const w = makeWindow({ title: "Coto Ecosystem \u2014 OS/Coto Subsystem Preview", icon: ICONS.coto, kind: "coto", w: 900, h: 610 });
      w.node.classList.add("coto-window");
      const app = el("div", "coto-app");
      app.dataset.accent = state.coto.accent;
      const sidebar = el("aside", "coto-sidebar");
      const brand = el("div", "coto-brand");
      const brandIcon = el("img");
      brandIcon.src = ICONS.coto;
      brandIcon.alt = "";
      const brandCopy = el("span");
      brandCopy.append(el("strong", null, "coto"), el("small", null, "subsystem preview"));
      brand.append(brandIcon, brandCopy);
      const nav = el("nav", "coto-nav");
      nav.setAttribute("aria-label", "Coto sections");
      const navItems = [
        { view: "home", icon: "\u2302", label: "Home" },
        { view: "compiler", icon: "\u203A_", label: "Compiler" },
        { view: "capture", icon: "+", label: "Capture" },
        { view: "studio", icon: "\u25C7", label: "Studio" },
        { view: "system", icon: "\u25CE", label: "System" }
      ];
      const navButtons = /* @__PURE__ */ new Map();
      navItems.forEach((item) => {
        const button = el("button", "coto-nav-button");
        button.type = "button";
        button.append(el("span", "coto-nav-icon", item.icon), el("span", null, item.label));
        button.onclick = () => setView(item.view);
        navButtons.set(item.view, button);
        nav.appendChild(button);
      });
      const localStatus = el("div", "coto-local-status");
      localStatus.append(el("i"), el("span", null, "Saved on this device"));
      sidebar.append(brand, nav, localStatus);
      const main = el("main", "coto-main");
      const topbar = el("header", "coto-topbar");
      const heading = el("div");
      const eyebrow = el("div", "coto-eyebrow", "COTO ECOSYSTEM");
      const viewTitle = el("div", "coto-view-title", "Home");
      heading.append(eyebrow, viewTitle);
      const localPill = el("span", "coto-local-pill");
      localPill.append(el("i"), document.createTextNode(" LOCAL"));
      topbar.append(heading, localPill);
      const surface = el("div", "coto-surface");
      main.append(topbar, surface);
      app.append(sidebar, main);
      w.body.appendChild(app);
      const actionButton = (label, className, action) => {
        const button = el("button", className, label);
        button.type = "button";
        button.onclick = action;
        return button;
      };
      const sectionHeading = (title, note) => {
        const wrap = el("div", "coto-section-heading");
        const copy = el("div");
        copy.append(el("h3", null, title), el("p", null, note));
        wrap.appendChild(copy);
        return wrap;
      };
      const moduleCard = (mark, title, copy, detail, view) => {
        const card = el("article", "coto-module-card");
        const top = el("div", "coto-module-top");
        top.append(el("span", "coto-module-mark", mark), el("span", "coto-module-detail", detail));
        const open = actionButton("Open \u2192", "coto-text-button", () => setView(view));
        card.append(top, el("h4", null, title), el("p", null, copy), open);
        return card;
      };
      let compilerTranscript = "Ready. Check, run, or build the saved Coto source.";
      let compilerTone = "idle";
      const renderHome = () => {
        const page = el("div", "coto-page coto-home");
        const hero = el("section", "coto-hero");
        const heroCopy = el("div", "coto-hero-copy");
        heroCopy.append(
          el("span", "coto-kicker", "OS/COTO SUBSYSTEM PREVIEW / 01"),
          el("h2", null, "A small window into the Coto platform."),
          el("p", null, "Explore the language, compiler workflow, shell, and local-first ecosystem together inside MiniOS.")
        );
        const heroActions = el("div", "coto-actions");
        heroActions.append(
          actionButton("Try the compiler", "coto-button coto-button-primary", () => setView("compiler")),
          actionButton("Open Coto Shell", "coto-button coto-button-quiet", () => openTerminal("coto"))
        );
        heroCopy.appendChild(heroActions);
        const orbit = el("div", "coto-orbit");
        orbit.setAttribute("aria-hidden", "true");
        orbit.append(el("i"), el("i"), el("i"), el("b", null, "C"));
        hero.append(heroCopy, orbit);
        const stats = el("section", "coto-stats");
        const openCount = state.coto.captures.filter((item) => !item.done).length;
        [
          [String(openCount).padStart(2, "0"), "open ideas"],
          [SHELLS[state.shell].short, "current shell"],
          ["LOCAL", "storage mode"]
        ].forEach(([value, label]) => {
          const stat = el("div", "coto-stat");
          stat.append(el("strong", null, value), el("span", null, label));
          stats.appendChild(stat);
        });
        const heading2 = sectionHeading("The mini ecosystem", "A connected taste of the compiler, language, shell, and product system.");
        const modules = el("section", "coto-module-grid");
        modules.append(
          moduleCard("\u203A_", "Compiler Lab", "Edit, check, and run a real hosted Coto subset.", state.coto.sourceName, "compiler"),
          moduleCard("+", "Capture", "Save the thought before it disappears.", `${state.coto.captures.length} saved`, "capture"),
          moduleCard("\u25C7", "Studio", "Try the color, type, and component rhythm.", COTO_ACCENTS[state.coto.accent].name, "studio"),
          moduleCard("\u25CE", "System", "See the principles holding everything together.", "4 principles", "system")
        );
        page.append(hero, stats, heading2, modules);
        return page;
      };
      const renderCompiler = () => {
        const page = el("div", "coto-page coto-compiler-page");
        const intro = sectionHeading("Compiler Lab", "A browser-local host for the Coto v0 structure, FIRE/HOLD values, display, checked ints, and VM preview manifests.");
        const openShell = actionButton("Open Coto Shell", "coto-button coto-button-quiet", () => openTerminal("coto"));
        intro.appendChild(openShell);
        const toolbar = el("div", "coto-compiler-toolbar");
        const sampleLabel = el("label");
        sampleLabel.appendChild(el("span", null, "Sample"));
        const sampleSelect = el("select");
        Object.entries(COTO_SAMPLES).forEach(([key, sample]) => {
          const option = el("option", null, sample.label);
          option.value = key;
          sampleSelect.appendChild(option);
        });
        sampleSelect.value = Object.entries(COTO_SAMPLES).find(([, sample]) => sample.name === state.coto.sourceName)?.[0] || "";
        sampleLabel.appendChild(sampleSelect);
        const checkButton = actionButton("Check", "coto-button coto-button-quiet", () => execute("check"));
        const runButton = actionButton("Run", "coto-button coto-button-primary", () => execute("run"));
        const buildButton = actionButton("Build VM preview", "coto-button coto-button-quiet", () => execute("build"));
        toolbar.append(sampleLabel, checkButton, runButton, buildButton);
        const workspace = el("div", "coto-compiler-workspace");
        const editorPanel = el("section", "coto-code-panel");
        const editorHead = el("div", "coto-code-head");
        const fileName = el("input", "coto-file-name");
        fileName.type = "text";
        fileName.value = state.coto.sourceName;
        fileName.maxLength = 80;
        fileName.setAttribute("aria-label", "Coto source file name");
        editorHead.append(el("span", null, "SOURCE"), fileName);
        const source = el("textarea", "coto-source");
        source.value = state.coto.source;
        source.spellcheck = false;
        source.wrap = "off";
        source.setAttribute("aria-label", "Coto source editor");
        editorPanel.append(editorHead, source);
        const consolePanel = el("section", "coto-code-panel coto-console-panel");
        const consoleHead = el("div", "coto-code-head");
        const status = el("span", "coto-compiler-status " + compilerTone, compilerTone === "ok" ? "PASSED" : compilerTone === "error" ? "FAILED" : "LOCAL PREVIEW");
        consoleHead.append(el("span", null, "DIAGNOSTICS / OUTPUT"), status);
        const output = el("pre", "coto-compiler-output", compilerTranscript);
        consolePanel.append(consoleHead, output);
        workspace.append(editorPanel, consolePanel);
        const syncSource = () => {
          state.coto.source = source.value;
          state.coto.sourceName = (fileName.value.trim() || "UNTITLED.coto").replace(/[^A-Za-z0-9._-]/g, "-");
          if (!state.coto.sourceName.toLowerCase().endsWith(".coto")) state.coto.sourceName += ".coto";
          save();
        };
        function execute(mode) {
          syncSource();
          const result = compileCoto(state.coto.source);
          const lines = [`${mode.toUpperCase()} ${state.coto.sourceName}`, `${result.programId} \xB7 ${result.instructions} instruction(s)`];
          if (result.diagnostics.length) {
            lines.push("");
            result.diagnostics.forEach((item) => lines.push(`${item.severity.toUpperCase()} ${item.code} ${item.line}:${item.column}  ${item.message}`));
          } else lines.push("", "No diagnostics. Zero Exception check passed.");
          if (result.ok && mode === "run") {
            lines.push("", "--- PROGRAM OUTPUT ---", result.output.replace(/\n$/, "") || "(no display output)");
            result.priorityEvents.forEach((event) => lines.push(`makefirst \u2192 ${event}`));
            lines.push(`RETURN-CODE ${result.returnCode}`);
          }
          if (result.ok && mode === "build") {
            const module = buildCotoModule(state.coto.source, result);
            lines.push("", "--- VM PREVIEW MANIFEST ---", JSON.stringify(module, null, 2), "", "Not wire-compatible with reference VM/Coto modules.");
          }
          compilerTone = result.ok ? "ok" : "error";
          compilerTranscript = lines.join("\n");
          output.textContent = compilerTranscript;
          status.className = "coto-compiler-status " + compilerTone;
          status.textContent = result.ok ? mode === "run" ? "RETURN " + result.returnCode : "PASSED" : "FAILED";
        }
        source.addEventListener("input", syncSource);
        fileName.addEventListener("change", syncSource);
        sampleSelect.onchange = () => {
          const sample = COTO_SAMPLES[sampleSelect.value];
          if (!sample) return;
          source.value = sample.source;
          fileName.value = sample.name;
          syncSource();
          compilerTone = "idle";
          compilerTranscript = `Loaded ${sample.name}. Ready to check or run.`;
          output.textContent = compilerTranscript;
          status.className = "coto-compiler-status idle";
          status.textContent = "LOCAL PREVIEW";
          source.focus();
        };
        const reference = el("section", "coto-language-reference");
        [
          ["STRUCTURE", "IDENTIFICATION DIVISION.\nPROCEDURE DIVISION."],
          ["VALUES", "int \xB7 string \xB7 bool\nFIRE \xB7 HOLD"],
          ["RUNTIME", "display(\u2026) \xB7 return\nmakefirst(\u2026)"],
          ["PORTABLE", "vm-build \xB7 vm-check\nvm-run \xB7 VM/Coto 2.0"]
        ].forEach(([label, copy]) => {
          const card = el("article");
          card.append(el("strong", null, label), el("pre", null, copy));
          reference.appendChild(card);
        });
        page.append(intro, toolbar, workspace, reference);
        return page;
      };
      const renderCapture = () => {
        const page = el("div", "coto-page");
        const intro = sectionHeading("Capture", "A lightweight inbox for thoughts worth keeping.");
        const tools = el("div", "coto-inline-actions");
        const exportCapture = actionButton("Send to Notepad", "coto-button coto-button-quiet", () => {
          const lines = state.coto.captures.map((item) => `${item.done ? "[x]" : "[ ]"} ${item.text}`);
          state.notes["coto-capture"] = `Coto Capture
============

${lines.join("\n") || "No captured ideas yet."}
`;
          save();
          openNotepad("coto-capture", void 0, "Coto Capture");
        });
        const clearDone = actionButton("Clear completed", "coto-text-button", () => {
          state.coto.captures = state.coto.captures.filter((item) => !item.done);
          save();
          render();
        });
        clearDone.disabled = !state.coto.captures.some((item) => item.done);
        tools.append(exportCapture, clearDone);
        intro.appendChild(tools);
        const form = el("form", "coto-capture-form");
        const input = el("input");
        input.type = "text";
        input.maxLength = 140;
        input.placeholder = "What do you want to remember?";
        input.setAttribute("aria-label", "New Coto idea");
        const add = el("button", "coto-button coto-button-primary", "Add idea");
        add.type = "submit";
        form.append(input, add);
        form.onsubmit = (event) => {
          event.preventDefault();
          const text = input.value.trim();
          if (!text) return;
          state.coto.captures.unshift({ id: nid(), text, done: false, createdAt: Date.now() });
          save();
          render();
          setTimeout(() => surface.querySelector(".coto-capture-form input")?.focus(), 0);
        };
        const list = el("section", "coto-capture-list");
        if (!state.coto.captures.length) {
          const empty = el("div", "coto-empty");
          empty.append(el("span", null, "\u25CB"), el("strong", null, "Room for a new thought"), el("p", null, "Your captures stay here, on this device."));
          list.appendChild(empty);
        } else {
          state.coto.captures.forEach((item) => {
            const row = el("article", "coto-capture-item" + (item.done ? " done" : ""));
            const check = el("button", "coto-check", item.done ? "\u2713" : "");
            check.type = "button";
            check.title = item.done ? "Mark as open" : "Mark as complete";
            check.setAttribute("aria-label", `${check.title}: ${item.text}`);
            check.onclick = () => {
              item.done = !item.done;
              save();
              render();
            };
            const copy = el("div", "coto-capture-copy");
            const date = new Date(item.createdAt || Date.now()).toLocaleDateString(void 0, { month: "short", day: "numeric" });
            copy.append(el("strong", null, item.text), el("small", null, `${item.done ? "Completed" : "Captured"} \xB7 ${date}`));
            const remove = el("button", "coto-remove", "\xD7");
            remove.type = "button";
            remove.title = "Delete idea";
            remove.setAttribute("aria-label", `Delete: ${item.text}`);
            remove.onclick = () => {
              state.coto.captures = state.coto.captures.filter((x) => x.id !== item.id);
              save();
              render();
            };
            row.append(check, copy, remove);
            list.appendChild(row);
          });
        }
        page.append(intro, form, list);
        return page;
      };
      const renderStudio = () => {
        const page = el("div", "coto-page");
        page.appendChild(sectionHeading("Coto Studio", "A small, interactive sample of the Coto design language."));
        const palettePanel = el("section", "coto-panel");
        palettePanel.append(el("span", "coto-panel-label", "ACCENT SYSTEM"), el("h3", null, "Choose the energy"), el("p", null, "Color changes the character, while the structure stays familiar."));
        const palette = el("div", "coto-palette");
        Object.keys(COTO_ACCENTS).forEach((accent) => {
          const option = el("button", "coto-accent-option" + (state.coto.accent === accent ? " selected" : ""));
          option.type = "button";
          const swatch = el("span", "coto-accent-swatch");
          swatch.dataset.swatch = accent;
          const copy = el("span");
          copy.append(el("strong", null, COTO_ACCENTS[accent].name), el("small", null, COTO_ACCENTS[accent].note));
          option.append(swatch, copy);
          option.setAttribute("aria-pressed", state.coto.accent === accent ? "true" : "false");
          option.onclick = () => {
            state.coto.accent = accent;
            app.dataset.accent = accent;
            save();
            render();
          };
          palette.appendChild(option);
        });
        palettePanel.appendChild(palette);
        const showcase = el("section", "coto-showcase-grid");
        const typePanel = el("article", "coto-panel coto-type-panel");
        typePanel.append(el("span", "coto-panel-label", "TYPE RHYTHM"), el("div", "coto-type-display", "Make space\nfor meaning."), el("p", null, "A confident headline, compact labels, and relaxed reading text create a clear path through the interface."));
        const componentPanel = el("article", "coto-panel");
        componentPanel.append(el("span", "coto-panel-label", "COMPONENTS"), el("h3", null, "Soft edges, clear actions"));
        const demo = el("div", "coto-component-demo");
        const demoInput = el("input");
        demoInput.type = "text";
        demoInput.placeholder = "A useful little thought";
        demoInput.setAttribute("aria-label", "Coto component preview");
        const badge = el("span", "coto-demo-badge", "IN PROGRESS");
        const progress = el("span", "coto-demo-progress");
        progress.appendChild(el("i"));
        const demoActions = el("div", "coto-actions");
        demoActions.append(actionButton("Continue", "coto-button coto-button-primary", () => {
        }), actionButton("Later", "coto-button coto-button-quiet", () => {
        }));
        demo.append(badge, demoInput, progress, demoActions);
        componentPanel.appendChild(demo);
        showcase.append(typePanel, componentPanel);
        page.append(palettePanel, showcase);
        return page;
      };
      const renderSystem = () => {
        const page = el("div", "coto-page");
        const manifesto = el("section", "coto-manifesto");
        const mark = el("div", "coto-manifesto-mark", "C");
        const copy = el("div");
        copy.append(el("span", "coto-kicker", "THE COTO SYSTEM"), el("h2", null, "Designed to feel clear before it feels clever."), el("p", null, "Coto connects calm surfaces, expressive details, and useful defaults into one recognizable experience."));
        manifesto.append(mark, copy);
        const principles = el("section", "coto-principles");
        [
          ["01", "Warm structure", "Strong hierarchy without coldness or clutter."],
          ["02", "Clear rhythm", "Space and type lead the eye before decoration does."],
          ["03", "Local by default", "The experience stays useful without an account or network."],
          ["04", "Playful restraint", "Personality appears in small, intentional moments."]
        ].forEach(([number, title, description]) => {
          const card = el("article", "coto-principle");
          card.append(el("span", null, number), el("h3", null, title), el("p", null, description));
          principles.appendChild(card);
        });
        const architecture = el("section", "coto-architecture");
        const archCopy = el("div");
        archCopy.append(el("strong", null, "OS/Coto Subsystem Preview is truly part of MiniOS."), el("p", null, "Native DOM \xB7 TypeScript \xB7 local compiler host \xB7 local storage \xB7 no external services"));
        architecture.append(archCopy, actionButton("Open Compiler Lab", "coto-button coto-button-primary", () => setView("compiler")));
        const productStatus = el("section", "coto-product-status");
        [
          ["ACTIVE", "Coto Language", "Working v0 reference; hosted MiniOS subset available."],
          ["ACTIVE", "Coto Compiler", "Local C11 prototype; interactive MiniOS parser preview."],
          ["PREVIEW", "Coto Shell", "Bash flow, PowerShell verbs, and a lightweight local object pipeline."],
          ["FOUNDATION", "OS/Coto Core", "Boot-verified early kernel work; not yet a usable operating system."]
        ].forEach(([badge, title, note]) => {
          const row = el("article");
          row.append(el("span", null, badge), el("div", null));
          row.lastElementChild.append(el("strong", null, title), el("p", null, note));
          productStatus.appendChild(row);
        });
        page.append(manifesto, principles, productStatus, architecture);
        return page;
      };
      const titles = { home: "Home", compiler: "Compiler Lab", capture: "Capture", studio: "Studio", system: "System" };
      let currentView = initialView;
      function render() {
        viewTitle.textContent = titles[currentView];
        navButtons.forEach((button, view) => {
          const selected = view === currentView;
          button.classList.toggle("selected", selected);
          if (selected) button.setAttribute("aria-current", "page");
          else button.removeAttribute("aria-current");
        });
        surface.replaceChildren(
          currentView === "capture" ? renderCapture() : currentView === "compiler" ? renderCompiler() : currentView === "studio" ? renderStudio() : currentView === "system" ? renderSystem() : renderHome()
        );
      }
      function setView(view) {
        currentView = view;
        render();
      }
      w.api.openView = setView;
      render();
      return w;
    }
    function openSettings() {
      const ex = wins.find((w2) => w2.kind === "settings");
      if (ex) {
        focusWin(ex);
        return;
      }
      const w = makeWindow({ title: "Appearance & Shell", icon: ICONS.settings, kind: "settings", w: 540, h: 520 });
      const box = el("div", "fields in");
      box.style.background = "var(--face)";
      const fsSystem = el("fieldset");
      fsSystem.appendChild(el("legend", null, "Desktop style"));
      const systemChoices = el("div", "os-choices");
      ["win95", "macos9"].forEach((appearance) => {
        const profile = THEMES[appearance];
        const label = el("label", "os-choice");
        const radio = el("input");
        radio.type = "radio";
        radio.name = "appearance";
        radio.value = appearance;
        radio.checked = state.appearance === appearance;
        const preview2 = el("img");
        preview2.src = profile.icons.computer;
        preview2.alt = "";
        const copy = el("span");
        copy.append(el("strong", null, profile.name), el("small", null, appearance === "win95" ? "Windows desktop and taskbar" : "Platinum windows and menu bar"));
        radio.onchange = () => {
          if (!radio.checked) return;
          setAppearance(appearance);
          w.close();
          setTimeout(openSettings, 0);
        };
        label.append(radio, preview2, copy);
        systemChoices.appendChild(label);
      });
      fsSystem.append(systemChoices, el("div", "hint", "The same folders, notes, apps, and terminal are shared between both styles."));
      box.appendChild(fsSystem);
      const fsShell = el("fieldset");
      fsShell.appendChild(el("legend", null, "Default shell"));
      const rowShell = el("div", "row");
      Object.keys(SHELLS).forEach((k) => {
        const lab = el("label");
        const r = el("input");
        r.type = "radio";
        r.name = "shell";
        r.value = k;
        r.checked = state.shell === k;
        r.onchange = () => {
          state.shell = k;
          save();
          applyChrome();
          renderIcons();
        };
        lab.append(r, el("span", null, SHELLS[k].label));
        rowShell.appendChild(lab);
      });
      fsShell.appendChild(rowShell);
      fsShell.appendChild(el("div", "hint", "New terminals start in this shell. Switch any time with: shell bash, shell zsh, shell powershell, or shell coto (CS)."));
      box.appendChild(fsShell);
      const fsSearch = el("fieldset");
      fsSearch.appendChild(el("legend", null, "Search & links"));
      const r1 = el("div", "row");
      r1.appendChild(el("span", null, "Search engine:"));
      const sel = el("select");
      Object.keys(ENGINES).forEach((k) => {
        const o = el("option", null, ENGINES[k].name);
        o.value = k;
        if (state.engine === k) o.selected = true;
        sel.appendChild(o);
      });
      sel.onchange = () => {
        state.engine = sel.value;
        save();
        applyChrome();
      };
      r1.appendChild(sel);
      fsSearch.appendChild(r1);
      const r2 = el("div", "row");
      r2.appendChild(el("span", null, "Open links in:"));
      [["same", "This tab"], ["new", "New tab"]].forEach(([v, lbl]) => {
        const lab = el("label");
        const r = el("input");
        r.type = "radio";
        r.name = "lt";
        r.checked = state.linkTarget === v;
        r.onchange = () => {
          state.linkTarget = v;
          save();
        };
        lab.append(r, el("span", null, lbl));
        r2.appendChild(lab);
      });
      fsSearch.appendChild(r2);
      const r2b = el("div", "row");
      const labOmni = el("label");
      const cbOmni = el("input");
      cbOmni.type = "checkbox";
      cbOmni.checked = !!state.showOmni;
      cbOmni.onchange = () => {
        state.showOmni = cbOmni.checked;
        save();
        applyChrome();
      };
      labOmni.append(cbOmni, el("span", null, "Show the search bar on the desktop"));
      r2b.appendChild(labOmni);
      fsSearch.appendChild(r2b);
      const r2c = el("div", "row");
      const labToday = el("label");
      const cbToday = el("input");
      cbToday.type = "checkbox";
      cbToday.checked = !!state.showToday;
      cbToday.onchange = () => {
        state.showToday = cbToday.checked;
        save();
        applyChrome();
      };
      labToday.append(cbToday, el("span", null, "Show MiniOS Today on the desktop"));
      r2c.appendChild(labToday);
      fsSearch.appendChild(r2c);
      box.appendChild(fsSearch);
      const fsLook = el("fieldset");
      fsLook.appendChild(el("legend", null, "Appearance"));
      const r3 = el("div", "row");
      r3.appendChild(el("span", null, "Desktop colour:"));
      ["#008080", "#3a6ea5", "#5f89b4", "#7b78a8", "#000000", "#7e9c7e", "#a08050"].forEach((c) => {
        const b = el("button");
        b.style.background = c;
        b.style.minWidth = "26px";
        b.style.width = "26px";
        b.style.height = "20px";
        b.title = c;
        b.onclick = () => {
          state.desktopColor = c;
          save();
          applyChrome();
        };
        r3.appendChild(b);
      });
      fsLook.appendChild(r3);
      const r4 = el("div", "row");
      r4.appendChild(el("span", null, "User / host:"));
      const iu = el("input");
      iu.type = "text";
      iu.value = state.user;
      iu.style.width = "90px";
      const ih = el("input");
      ih.type = "text";
      ih.value = state.host;
      ih.style.width = "90px";
      iu.oninput = () => {
        state.user = iu.value.replace(/\s/g, "") || "user";
        save();
        updateToday(/* @__PURE__ */ new Date());
      };
      ih.oninput = () => {
        state.host = ih.value.replace(/\s/g, "") || "web95";
        save();
      };
      r4.append(iu, el("span", null, "@"), ih);
      fsLook.appendChild(r4);
      const rCrt = el("div", "row");
      const labCrt = el("label");
      const cbCrt = el("input");
      cbCrt.type = "checkbox";
      cbCrt.checked = state.crtEffect !== false;
      cbCrt.onchange = () => {
        state.crtEffect = cbCrt.checked;
        save();
        applyChrome();
      };
      labCrt.append(cbCrt, el("span", null, "Enable CRT screen effect"));
      rCrt.appendChild(labCrt);
      fsLook.appendChild(rCrt);
      fsLook.appendChild(el("div", "hint", "Adds scanlines, phosphor texture, glass shading and a very subtle flicker."));
      box.appendChild(fsLook);
      const fsWall = el("fieldset");
      fsWall.appendChild(el("legend", null, "Wallpaper"));
      fsWall.appendChild(el("div", "hint", "Choose a built-in desktop:"));
      const grid = el("div", "wallpaper-grid");
      const presetButtons = [];
      WALLPAPER_PRESETS.forEach((p) => {
        const b = el("button", "wallpaper-choice");
        const img = el("img");
        img.src = p.src;
        img.alt = "";
        b.append(img, el("span", null, p.name));
        b.title = "Use " + p.name;
        b.onclick = () => {
          state.wallpaper = p.src;
          state.wallpaperMode = p.mode;
          state.wallpaperSize = p.size;
          state.wallpaperFade = 100;
          state.desktopColor = p.color;
          iw.value = p.src;
          save();
          applyChrome();
          refreshWallpaperControls();
        };
        presetButtons.push({ button: b, preset: p });
        grid.appendChild(b);
      });
      fsWall.appendChild(grid);
      const st1 = el("div", "hint");
      const rw1 = el("div", "row");
      rw1.appendChild(el("span", null, "Custom:"));
      const iw = el("input");
      iw.type = "text";
      iw.value = state.wallpaper || "";
      iw.style.flex = "1";
      iw.style.minWidth = "180px";
      iw.placeholder = "file beside index.html, or an image URL";
      const preview = el("img");
      preview.alt = "Current wallpaper preview";
      Object.assign(preview.style, { width: "64px", height: "42px", objectFit: "cover", background: "var(--desktop)", border: "1px solid #808080" });
      rw1.append(iw, preview);
      fsWall.appendChild(rw1);
      const modeRadios = [];
      const rw2 = el("div", "row");
      rw2.appendChild(el("span", null, "Display:"));
      [["fit", "Fit"], ["center", "Centre"], ["tile", "Tile"], ["stretch", "Fill screen"]].forEach(([v, lbl]) => {
        const lab = el("label");
        const r = el("input");
        r.type = "radio";
        r.name = "wallmode";
        r.checked = state.wallpaperMode === v;
        r.onchange = () => {
          state.wallpaperMode = v;
          save();
          applyWallpaper();
        };
        modeRadios.push({ input: r, value: v });
        lab.append(r, el("span", null, lbl));
        rw2.appendChild(lab);
      });
      fsWall.appendChild(rw2);
      const rwS = el("div", "row");
      rwS.appendChild(el("span", null, "Size:"));
      const sz = el("input");
      sz.type = "range";
      sz.min = "10";
      sz.max = "100";
      sz.step = "5";
      sz.value = String(state.wallpaperSize);
      sz.style.flex = "1";
      const szv = el("span", null, state.wallpaperSize + "%");
      szv.style.minWidth = "34px";
      sz.oninput = () => {
        state.wallpaperSize = Number(sz.value);
        szv.textContent = sz.value + "%";
        save();
        applyWallpaper();
      };
      sz.title = "Applies to Fit";
      rwS.append(sz, szv);
      fsWall.appendChild(rwS);
      const rw3 = el("div", "row");
      rw3.appendChild(el("span", null, "Strength:"));
      const sl = el("input");
      sl.type = "range";
      sl.min = "0";
      sl.max = "100";
      sl.step = "5";
      sl.value = String(state.wallpaperFade);
      sl.style.flex = "1";
      const slv = el("span", null, state.wallpaperFade + "%");
      slv.style.minWidth = "34px";
      sl.oninput = () => {
        state.wallpaperFade = Number(sl.value);
        slv.textContent = sl.value + "%";
        save();
        applyWallpaper();
      };
      rw3.append(sl, slv);
      fsWall.appendChild(rw3);
      const refreshWallpaperControls = () => {
        preview.style.background = state.desktopColor;
        if (state.wallpaper) {
          preview.style.display = "";
          preview.src = state.wallpaper;
        } else preview.style.display = "none";
        modeRadios.forEach((x) => {
          x.input.checked = state.wallpaperMode === x.value;
        });
        sz.value = String(state.wallpaperSize);
        szv.textContent = sz.value + "%";
        sl.value = String(state.wallpaperFade);
        slv.textContent = sl.value + "%";
        presetButtons.forEach((x) => {
          const selected = state.wallpaper === x.preset.src;
          x.button.classList.toggle("selected", selected);
          x.button.setAttribute("aria-pressed", selected ? "true" : "false");
        });
        st1.textContent = "You can also use a file in the MiniOS folder or paste an image URL.";
      };
      const syncWall = () => {
        state.wallpaper = iw.value.trim();
        save();
        applyWallpaper();
        refreshWallpaperControls();
      };
      iw.oninput = syncWall;
      preview.onload = () => {
        st1.textContent = "You can also use a file in the MiniOS folder or paste an image URL.";
      };
      preview.onerror = () => {
        st1.textContent = "That image did not load \u2014 check the file name.";
      };
      const bNone = el("button", null, "No wallpaper");
      bNone.onclick = () => {
        iw.value = "";
        syncWall();
      };
      const rw4 = el("div", "row");
      rw4.appendChild(bNone);
      fsWall.append(rw4, st1);
      box.appendChild(fsWall);
      refreshWallpaperControls();
      const fsData = el("fieldset");
      fsData.appendChild(el("legend", null, "Your data"));
      const r5 = el("div", "row");
      const bExp = el("button", null, "Export\u2026");
      bExp.onclick = () => openNotepad("__export__", JSON.stringify({ fs: state.fs, notes: state.notes, npp: state.npp, coto: state.coto }, null, 2), "Export.json");
      const bImp = el("button", null, "Import\u2026");
      bImp.onclick = async () => {
        const r = await dialog({ title: "Import", fields: [{ key: "json", label: "Paste an exported JSON:", value: "", type: "textarea" }] });
        if (!r || !r.json.trim()) return;
        try {
          const data = JSON.parse(r.json);
          if (!data.fs) throw new Error("No 'fs' in that JSON.");
          state.fs = data.fs;
          if (data.notes) state.notes = data.notes;
          if (data.npp) state.npp = data.npp;
          if (data.coto) {
            const accent = ["orbit", "coral", "mint"].includes(data.coto.accent) ? data.coto.accent : state.coto.accent;
            const captures = Array.isArray(data.coto.captures) ? data.coto.captures : state.coto.captures;
            state.coto = { ...state.coto, ...data.coto, accent, captures };
          }
          reindex();
          save();
          refreshAll();
          say("Import complete.", "Import");
        } catch (e) {
          say("That JSON could not be read:\n" + e.message, "Import failed");
        }
      };
      const bBook = el("button", null, "Import browser bookmarks\u2026");
      bBook.style.minWidth = "0";
      bBook.onclick = () => importBookmarks(state.fs);
      r5.append(bExp, bImp);
      const rBook = el("div", "row");
      rBook.appendChild(bBook);
      fsData.append(r5, rBook);
      const r6 = el("div", "row");
      const bReset = el("button", null, "Reset everything");
      bReset.onclick = async () => {
        if (await ask("Erase all folders, bookmarks, notes and settings?", `Reset ${activeTheme.shortName}`)) {
          await wipe();
          state = defaults();
          activeTheme = themeFor(state.appearance);
          ICONS = activeTheme.icons;
          WALLPAPER_PRESETS = activeTheme.wallpapers;
          reindex();
          save();
          applyChrome();
          refreshWindowIcons();
          refreshAll();
        }
      };
      r6.appendChild(bReset);
      fsData.appendChild(r6);
      box.appendChild(fsData);
      const foot = el("div", "row");
      foot.style.justifyContent = "flex-end";
      const bOk = el("button", null, "OK");
      bOk.onclick = () => w.close();
      foot.appendChild(bOk);
      box.appendChild(foot);
      w.body.appendChild(box);
      return w;
    }
    cmd("import-html", "Paste an exported bookmarks.html", async (S) => {
      const n = await importFromPaste(S.cwd);
      if (n == null) {
        S.text("Cancelled.", "dim");
        return;
      }
      S.text("Imported " + n + " bookmark(s) into " + pathString(S.cwd, "win"), "ok");
    });
    cmd("import-browser import", "Import this browser's own bookmarks", (S) => {
      if (!AS_EXT) {
        S.text("Only the installed extension can read the browser's bookmarks.", "warn");
        S.out('Run <span class="hd">import-html</span> to paste an export instead.', "dim");
        return;
      }
      if (bookmarksApi()) {
        importFromBrowser(S.cwd).then((n) => S.text("Imported " + n + " bookmark(s) into " + pathString(S.cwd, "win"), "ok"));
        return;
      }
      S.text("Permission needed. Settings \u2192 Import browser bookmarks\u2026 asks for it (a click is required).", "warn");
      openSettings();
    });
    function importNetscape(html, into) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      let n = 0;
      function walkDL(dl, folder) {
        Array.from(dl.children).forEach((child) => {
          if (child.tagName !== "DT") return;
          const h3 = child.querySelector(":scope > H3");
          const a = child.querySelector(":scope > A");
          if (h3) {
            const sub = F(h3.textContent.trim() || "Folder", []);
            folder.children = folder.children || [];
            sub.name = uniqueName(folder, sub.name);
            folder.children.push(sub);
            const inner = child.querySelector(":scope > DL");
            if (inner) walkDL(inner, sub);
          } else if (a) {
            const href = (a.getAttribute("href") || "").trim();
            if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) return;
            const node = L(a.textContent.trim() || href, href);
            folder.children = folder.children || [];
            node.name = uniqueName(folder, node.name);
            folder.children.push(node);
            n++;
          }
        });
      }
      doc.querySelectorAll("body > dl, body > DL").forEach((dl) => walkDL(dl, into));
      if (!n) {
        doc.querySelectorAll("a[href]").forEach((a) => {
          const href = (a.getAttribute("href") || "").trim();
          if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) return;
          const node = L(a.textContent.trim() || href, href);
          node.name = uniqueName(into, node.name);
          (into.children = into.children || []).push(node);
          n++;
        });
      }
      reindex();
      save();
      return n;
    }
    const bookmarksApi = () => typeof chrome !== "undefined" && chrome.bookmarks ? chrome.bookmarks : null;
    async function importFromPaste(into) {
      const r = await dialog({
        title: "Import bookmarks.html",
        message: AS_EXT ? `${activeTheme.shortName} can read your bookmarks directly if you grant it permission \u2014 click \u201CImport browser bookmarks\u2026\u201D again and accept the browser's prompt.

Or do it by hand: bookmark manager (Ctrl+Shift+O) \u2192 \u22EE \u2192 Export bookmarks, open the saved file in a text editor, and paste it here.` : "As a plain file this page cannot read your bookmarks. Export them from the browser (Ctrl+Shift+O \u2192 \u22EE \u2192 Export bookmarks), open the saved file in a text editor, then paste everything here.",
        fields: [{ key: "html", label: "bookmarks.html contents:", value: "", type: "textarea" }]
      });
      if (!r || !r.html.trim()) return null;
      const n = importNetscape(r.html, into);
      refreshAll();
      return n;
    }
    function importFromBrowser(into) {
      return new Promise((resolve2) => {
        const api = bookmarksApi();
        if (!api) return resolve2(null);
        api.getTree((roots) => {
          const box = F("Browser bookmarks", []);
          let n = 0;
          (function walk(nodes, folder) {
            (nodes || []).forEach((nd) => {
              if (nd.children) {
                const sub = F((nd.title || "").trim() || "Folder", []);
                walk(nd.children, sub);
                if (sub.children.length) {
                  sub.name = uniqueName(folder, sub.name);
                  folder.children.push(sub);
                }
              } else if (nd.url && /^https?:/i.test(nd.url)) {
                const l = L((nd.title || "").trim() || nd.url, nd.url);
                l.name = uniqueName(folder, l.name);
                folder.children.push(l);
                n++;
              }
            });
          })(roots && roots[0] ? roots[0].children : roots, box);
          if (n) {
            box.name = uniqueName(into, box.name);
            (into.children = into.children || []).push(box);
            reindex();
            save();
            refreshAll();
          }
          resolve2(n);
        });
      });
    }
    function importBookmarks(into) {
      const canAsk = AS_EXT && typeof chrome !== "undefined" && chrome.permissions && chrome.permissions.request;
      if (!canAsk) {
        importFromPaste(into).then((n) => {
          if (n != null) say("Imported " + n + " bookmark(s).", "Import bookmarks");
        });
        return;
      }
      chrome.permissions.request({ permissions: ["bookmarks"] }, (granted) => {
        if (granted && bookmarksApi()) {
          importFromBrowser(into).then((n) => {
            say(n ? "Imported " + n + " bookmark(s) into a new folder called \u201CBrowser bookmarks\u201D." : "The browser reported no bookmarks to import.", "Import bookmarks");
          });
          return;
        }
        importFromPaste(into).then((n) => {
          if (n != null) say("Imported " + n + " bookmark(s).", "Import bookmarks");
        });
      });
    }
    function openHelp() {
      const ex = wins.find((w2) => w2.kind === "help");
      if (ex) {
        focusWin(ex);
        return;
      }
      const w = makeWindow({ title: `Read Me \u2014 ${activeTheme.shortName}`, icon: ICONS.help, kind: "help", w: 600, h: 440 });
      const box = el("div", "fields in");
      box.style.background = "#fff";
      box.style.userSelect = "text";
      box.innerHTML = `
    <h2 style="margin:0 0 6px;font-size:15px">${esc(activeTheme.shortName)}</h2>
    <div class="hint" style="margin-bottom:10px">A new tab page that behaves like a small classic desktop. Switch between Windows 95 and Mac OS 9 without changing your folders, notes, or apps.</div>
    <fieldset><legend>Desktop</legend>
      <div class="hint">
        \u2022 <b>Double-click</b> a folder to open a window; double-click a shortcut to go there.<br>
        \u2022 <b>Right-click</b> the desktop or inside a folder for <i>New Folder</i> / <i>New Shortcut</i>.<br>
        \u2022 <b>Drag</b> icons anywhere; drag items in a folder window onto another folder to move them.<br>
        \u2022 <b>MiniOS Today</b> keeps your daily folder and scratch pad close; hide or restore it in Settings.<br>
        \u2022 The <b>CRT screen effect</b> can be switched on or off under Settings \u2192 Appearance.<br>
        \u2022 <b>MiniEditor</b> adds line numbers, open/download, find and replace, language modes, word wrap and an autosaved document.<br>
        \u2022 Right-click any item for Rename, Move, Delete, Properties.
      </div>
    </fieldset>
    <fieldset><legend>Terminal</legend>
      <div class="hint">
        Pick your shell in Settings, or type <kbd>shell bash</kbd> / <kbd>shell zsh</kbd> / <kbd>shell powershell</kbd> / <kbd>shell coto</kbd>.<br><br>
        <b>Coto subsystem:</b> <kbd>coto help</kbd> <kbd>coto open</kbd> <kbd>coto check</kbd> <kbd>coto run</kbd> <kbd>coto build</kbd> <kbd>coto status</kbd><br>
        Coto Shell blends Bash flow with PowerShell verbs and structured output. Try <kbd>aliases</kbd>, <kbd>ls | grep dev</kbd>, or <kbd>Get-ChildItem | Where-Object type=folder</kbd>.<br>
        Compiler Lab runs a safe browser-hosted subset inspired by the working Coto v0 reference compiler.<br><br>
        <b>Getting around:</b> <kbd>ls</kbd> <kbd>cd Dev</kbd> <kbd>cd ..</kbd> <kbd>pwd</kbd> <kbd>tree</kbd><br>
        <b>Using links:</b> <kbd>open github</kbd> <kbd>cat github</kbd> <kbd>grep hacker</kbd> <kbd>search rust traits</kbd><br>
        <b>Editing:</b> <kbd>mkdir Recipes</kbd> <kbd>add Docs docs.claude.com</kbd> <kbd>mv old new</kbd> <kbd>rm -r Old</kbd><br>
        <b>Looks:</b> <kbd>wallpaper logo fit 45%</kbd> <kbd>wallpaper none</kbd> <kbd>wallpaper tile</kbd><br>
        <b>Extras:</b> <kbd>coto</kbd> <kbd>neofetch</kbd> <kbd>history</kbd> <kbd>notepad</kbd> <kbd>minieditor</kbd> <kbd>export</kbd> <kbd>import-browser</kbd> <kbd>help</kbd><br><br>
        PowerShell names work too \u2014 <kbd>Get-ChildItem</kbd>, <kbd>Set-Location</kbd>, <kbd>Remove-Item</kbd>, <kbd>cls</kbd>.
        <kbd>Tab</kbd> completes, <kbd>\u2191</kbd>/<kbd>\u2193</kbd> walks history, <kbd>Ctrl+L</kbd> clears.
      </div>
    </fieldset>
    <fieldset><legend>Shortcuts</legend>
      <div class="hint">
        ${AS_EXT ? `<b>Click the desktop once first.</b> A new tab opens with the cursor in the browser's address bar, so
        keystrokes go there, not here \u2014 that is the browser's behaviour and a page cannot take the focus back.<br><br>` : ``}
        <kbd>Ctrl</kbd>+<kbd>\`</kbd> new terminal \xB7 <kbd>Ctrl</kbd>+<kbd>K</kbd> focus search \xB7 <kbd>Ctrl</kbd>+<kbd>E</kbd> ${esc(activeTheme.computerName)} \xB7
        <kbd>Esc</kbd> close menus \xB7 <kbd>F2</kbd> settings
      </div>
    </fieldset>
    <fieldset><legend>${AS_EXT ? "Where this is running" : "Make this your new tab and home page"}</legend>
      <div class="hint" id="helpwhere"></div>
    </fieldset>`;
      const where = box.querySelector("#helpwhere");
      const here = location.href.replace(/#.*$/, "");
      if (AS_EXT) {
        where.innerHTML = `Loaded as the <b>${esc(activeTheme.shortName)}</b> extension, so it already replaces <b>every new tab</b>.<br><br>To use it for the <b>Home button</b> and on <b>startup</b> too, paste this address into those settings:<br><code style="user-select:all">${esc(here)}</code><br><br><b>Edge:</b> Settings \u2192 Start, home, and new tabs.  <b>Chrome / Brave:</b> Settings \u2192 On startup, and Appearance \u2192 Show home button.<br><br>Not shown on <b>incognito</b> new tabs \u2014 browsers always use their own page there.<br><br>Your folders live in this extension's storage, which survives browser restarts, browser updates, and moving the folder on disk (the extension ID is pinned in <code>manifest.json</code>). <b>Removing the extension erases it</b>, and so does loading a copy that has no <code>key</code> \u2014 keep a backup with <i>Export</i> in Settings.`;
      } else {
        where.innerHTML = `Running as a plain file, so it is <b>not</b> your new tab yet \u2014 a page can only take over the new tab as an extension. The folder this file sits in is already a loadable extension: open <code>edge://extensions</code> (or <code>chrome://extensions</code>), turn on <b>Developer mode</b>, click <b>Load unpacked</b>, and pick that folder.<br><br>For the Home button and startup pages, paste this address:<br><code style="user-select:all">${esc(here)}</code><br><b>Edge:</b> Settings \u2192 Start, home, and new tabs.  <b>Chrome / Brave:</b> Settings \u2192 On startup, and Appearance \u2192 Show home button.<br><br>Anything you add is stored per address, so the file and the extension keep <b>separate</b> sets. If you build folders here and then install the extension, carry them over with <i>Export</i> here and <i>Import</i> there.`;
      }
      w.body.appendChild(box);
      return w;
    }
    function buildStart() {
      const list = $("#startlist");
      list.innerHTML = "";
      const mkItem = (label, icon, action, sub) => {
        const d = el("div", "mi");
        const i = el("img");
        i.src = icon;
        i.alt = "";
        d.append(i, el("span", null, label));
        if (sub) {
          d.appendChild(el("span", "arrow", "\u25B6"));
          const s = el("div", "submenu out");
          sub(s);
          d.appendChild(s);
        } else if (action) {
          d.onclick = () => {
            hideMenus();
            action();
          };
        }
        return d;
      };
      list.appendChild(mkItem(activeTheme.menu.applications, ICONS.computer, null, (s) => {
        [
          ["Terminal \u2014 PowerShell", ICONS.terminal, () => openTerminal("powershell")],
          ["Terminal \u2014 Bash", ICONS.bash, () => openTerminal("bash")],
          ["Terminal \u2014 Zsh", ICONS.zsh, () => openTerminal("zsh")],
          ["Coto Shell (CS) \u2014 Bash + PowerShell", ICONS.cotosh, () => openTerminal("coto")],
          ["Notepad", ICONS.notepad, () => openNotepad("welcome")],
          ["MiniEditor", ICONS.npp, () => openMiniEditor()],
          ["Coto Ecosystem", ICONS.coto, () => openCoto()],
          [activeTheme.computerName, ICONS.computer, () => openExplorer(state.fs)]
        ].forEach(([l, ic, a]) => s.appendChild(mkItem(l, ic, a)));
      }));
      list.appendChild(mkItem(activeTheme.menu.favorites, ICONS.folder, null, (s) => {
        const kids = state.fs.children || [];
        if (!kids.length) s.appendChild(mkItem("(empty)", ICONS.folder, null));
        kids.forEach((n) => {
          if (isFolder(n)) {
            s.appendChild(mkItem(n.name, ICONS.folder, null, (s2) => {
              const items = n.children || [];
              if (!items.length) s2.appendChild(mkItem("(empty)", ICONS.link, null));
              items.forEach((c) => s2.appendChild(mkItem(c.name, iconFor(c), () => openNode(c))));
            }));
          } else s.appendChild(mkItem(n.name, ICONS.link, () => go(n.url)));
        });
      }));
      list.appendChild(mkItem(activeTheme.menu.settings, ICONS.settings, () => openSettings()));
      list.appendChild(mkItem("Find\u2026", ICONS.find, () => {
        const query = $("#q");
        query.focus();
        query.select();
      }));
      list.appendChild(mkItem("Help", ICONS.help, () => openHelp()));
      list.appendChild(mkItem("Run\u2026", ICONS.run, async () => {
        const r = await dialog({
          title: "Run",
          msgIcon: ICONS.run,
          message: `Type a command, a bookmark name or an address, and ${activeTheme.shortName} will open it.`,
          fields: [{ key: "cmd", label: "Open:", value: "" }]
        });
        if (!r || !r.cmd.trim()) return;
        const v = r.cmd.trim();
        if (looksLikeUrl(v)) return go(v);
        const n = resolve(v, state.fs);
        if (n) return openNode(n);
        const S = openTerminal();
        setTimeout(() => {
          S.out("");
          runCommand(S, v);
          S.refreshPrompt();
        }, 60);
      }));
      list.appendChild(el("div", "mdiv"));
      list.appendChild(mkItem(activeTheme.menu.shutdown, ICONS.shutdown, async () => {
        if (await ask(`Are you sure you want to shut down ${activeTheme.shortName}?`, activeTheme.menu.shutdown.replace("\u2026", ""))) $("#shutdown").classList.add("open");
      }));
    }
    $("#start").onclick = (e) => {
      e.stopPropagation();
      const m = $("#startmenu");
      const open = m.classList.toggle("open");
      $("#start").classList.toggle("pressed", open);
      if (open) {
        buildStart();
        m.style.zIndex = String(++zTop);
      }
    };
    $("#shutdown").onclick = () => $("#shutdown").classList.remove("open");
    $("#omniform").addEventListener("submit", (e) => {
      e.preventDefault();
      const query = $("#q");
      const v = query.value.trim();
      if (!v) return;
      if (looksLikeUrl(v)) return go(v);
      const n = resolve(v, state.fs);
      if (n) {
        openNode(n);
        query.value = "";
        return;
      }
      go(searchUrl(v));
    });
    $("#omniterm").onclick = () => openTerminal();
    const TODAY_TIPS = [
      "Start typing anywhere on the desktop to search.",
      "Double-click a folder to browse your favorite places.",
      "Press Ctrl+` to open a terminal in a flash.",
      "Right-click the desktop to add a folder or shortcut.",
      "Use Ctrl+E to open My Computer from anywhere.",
      "Your Scratch Pad is saved automatically in this browser.",
      "Click the shell badge by the clock to change terminals."
    ];
    const TIPS_PER_DAY = 3;
    const WEEKDAY_STATUS = [
      "Sunday pace. Take it easy.",
      "Monday reset. A fresh week begins.",
      "Tuesday momentum is building.",
      "Wednesday \u2014 halfway through.",
      "Thursday. The weekend is in sight.",
      "Friday finish line.",
      "Saturday mode. No rush."
    ];
    function displayName(name) {
      const clean = String(name || "friend").replace(/[._-]+/g, " ").trim();
      return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "Friend";
    }
    function dayOfYear(d) {
      return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 864e5);
    }
    function isoWeek(d) {
      const u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const weekday = u.getUTCDay() || 7;
      u.setUTCDate(u.getUTCDate() + 4 - weekday);
      const yearStart = new Date(Date.UTC(u.getUTCFullYear(), 0, 1));
      return Math.ceil(((u.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
    }
    function updateToday(d) {
      const h = d.getHours();
      const greeting = h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
      const year = d.getFullYear();
      const todayNumber = dayOfYear(d);
      const daysThisYear = new Date(year, 1, 29).getMonth() === 1 ? 366 : 365;
      const yearPercent = Math.round(todayNumber / daysThisYear * 100);
      const tomorrow = new Date(year, d.getMonth(), d.getDate() + 1);
      $("#today-greeting").textContent = greeting + ", " + displayName(state.user) + ".";
      $("#today-cal-weekday").textContent = d.toLocaleDateString(void 0, { weekday: "short" });
      $("#today-cal-day").textContent = String(d.getDate());
      $("#today-date").textContent = d.toLocaleDateString(void 0, { month: "long", year: "numeric" });
      $("#today-week").textContent = "Week " + isoWeek(d) + " \xB7 Day " + todayNumber + " of " + daysThisYear;
      $("#today-tomorrow").textContent = "Tomorrow: " + tomorrow.toLocaleDateString(void 0, { weekday: "short", month: "short", day: "numeric" });
      $("#today-year-label").textContent = String(year);
      $("#today-year-progress").style.width = yearPercent + "%";
      $("#today-year-percent").textContent = yearPercent + "%";
      $("#today-status-text").textContent = WEEKDAY_STATUS[d.getDay()];
      const firstTip = (todayNumber - 1) * TIPS_PER_DAY % TODAY_TIPS.length;
      $("#today-tips").replaceChildren(...Array.from({ length: TIPS_PER_DAY }, (_, i) => {
        const item = document.createElement("li");
        item.textContent = TODAY_TIPS[(firstTip + i) % TODAY_TIPS.length];
        return item;
      }));
    }
    $("#today-close").onclick = () => {
      state.showToday = false;
      save();
      applyChrome();
    };
    $("#today-daily").onclick = () => {
      const daily = findChild(state.fs, "Daily");
      openExplorer(isFolder(daily) ? daily : state.fs);
    };
    $("#today-note").onclick = () => openNotepad("welcome");
    const CLOCK_MINUTE_MS = 6e4;
    const clockTimeFormat = new Intl.DateTimeFormat(void 0, {
      hour: "numeric",
      minute: "2-digit"
    });
    const clockDateFormat = new Intl.DateTimeFormat(void 0, {
      month: "numeric",
      day: "numeric",
      year: "2-digit"
    });
    const clockLabelFormat = new Intl.DateTimeFormat(void 0, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    });
    let clockTimer;
    function clock() {
      const d = /* @__PURE__ */ new Date();
      const label = clockLabelFormat.format(d);
      const clockElement = $("#clock");
      const dateElement = $("#tray-date");
      clockElement.textContent = clockTimeFormat.format(d).replace(/[\u00a0\u202f]/g, " ");
      dateElement.textContent = clockDateFormat.format(d);
      clockElement.title = label;
      dateElement.title = label;
      $("#tray-time").setAttribute("aria-label", label);
      updateToday(d);
    }
    function scheduleClock() {
      if (clockTimer !== void 0) window.clearTimeout(clockTimer);
      clock();
      if (document.hidden) {
        clockTimer = void 0;
        return;
      }
      const untilNextMinute = CLOCK_MINUTE_MS - Date.now() % CLOCK_MINUTE_MS;
      clockTimer = window.setTimeout(scheduleClock, untilNextMinute + 25);
    }
    scheduleClock();
    window.addEventListener("focus", scheduleClock);
    document.addEventListener("visibilitychange", scheduleClock);
    const WALL_MODES = {
      /* fit scales to a share of the desktop height, keeping the aspect ratio */
      fit: {
        size: () => "auto " + Math.max(5, Math.min(100, Number(state.wallpaperSize) || 45)) + "%",
        repeat: "no-repeat",
        position: "center center",
        sized: true
      },
      center: { size: "auto", repeat: "no-repeat", position: "center center" },
      tile: { size: "auto", repeat: "repeat", position: "left top" },
      stretch: { size: "cover", repeat: "no-repeat", position: "center center" }
    };
    function rgba(hex, a) {
      const h = String(hex).replace("#", "");
      const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
      return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a.toFixed(3) + ")";
    }
    function applyWallpaper() {
      const d = $("#desktop");
      const src = (state.wallpaper || "").trim();
      d.style.backgroundColor = state.desktopColor;
      if (!src) {
        d.style.backgroundImage = "none";
        return;
      }
      const m = WALL_MODES[state.wallpaperMode] || WALL_MODES.fit;
      const mSize = typeof m.size === "function" ? m.size() : m.size;
      const url = 'url("' + src.replace(/"/g, "%22") + '")';
      const f = Math.max(0, Math.min(100, Number(state.wallpaperFade))) / 100;
      const veil = f >= 1 ? "" : "linear-gradient(" + rgba(state.desktopColor, 1 - f) + "," + rgba(state.desktopColor, 1 - f) + ")";
      d.style.backgroundImage = veil ? veil + ", " + url : url;
      d.style.backgroundSize = veil ? "auto, " + mSize : mSize;
      d.style.backgroundRepeat = veil ? "repeat, " + m.repeat : m.repeat;
      d.style.backgroundPosition = veil ? "center, " + m.position : m.position;
    }
    function applyChrome() {
      activeTheme = themeFor(state.appearance);
      ICONS = activeTheme.icons;
      WALLPAPER_PRESETS = activeTheme.wallpapers;
      applyThemeIdentity(activeTheme);
      document.documentElement.style.setProperty("--desktop", state.desktopColor);
      document.body.classList.toggle("crt-on", state.crtEffect !== false);
      $("#shellbadge").textContent = SHELLS[state.shell].short;
      $("#shellbadge").title = "Default shell: " + SHELLS[state.shell].label;
      $("#omni").style.display = state.showOmni ? "" : "none";
      $("#today").style.display = state.showToday ? "" : "none";
      const activeEngine = ENGINES[state.engine] || ENGINES.duckduckgo;
      $("#engine-label").textContent = "Search powered by " + activeEngine.name;
      const startButton = $("#start");
      const si = startButton.querySelector("img");
      const startLabel = startButton.querySelector("span");
      startButton.title = activeTheme.launcherTitle;
      startButton.setAttribute("aria-label", activeTheme.launcherTitle);
      if (startLabel) startLabel.textContent = activeTheme.launcherLabel;
      if (!si) throw new Error("The desktop launcher icon is missing.");
      si.src = ICONS.win;
      si.style.display = "";
      si.onerror = () => {
        si.style.display = "none";
      };
      const shutdownMessage = document.querySelector("#shutdown-message");
      if (shutdownMessage) shutdownMessage.textContent = state.appearance === "macos9" ? "Your Macintosh is now ready to shut down." : "It\u2019s now safe to turn off your computer.";
      applyWallpaper();
    }
    function refreshWindowIcons() {
      const iconsByKind = {
        explorer: ICONS.folderOpen,
        notepad: ICONS.notepad,
        npp: ICONS.npp,
        coto: ICONS.coto,
        settings: ICONS.settings,
        help: ICONS.help
      };
      wins.forEach((w) => {
        const nextIcon = iconsByKind[w.kind];
        if (nextIcon) {
          w.icon = nextIcon;
          w.iconEl.src = nextIcon;
        }
        if (w.kind === "help") w.setTitle(`Read Me \u2014 ${activeTheme.shortName}`);
      });
      syncTasks();
    }
    function refreshAll() {
      renderIcons();
      explorers.forEach((x) => x.render());
    }
    $("#shellbadge").onclick = () => {
      const order = ["powershell", "bash", "zsh", "coto"];
      state.shell = order[(order.indexOf(state.shell) + 1) % order.length];
      save();
      applyChrome();
      renderIcons();
    };
    document.addEventListener("keydown", (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (e.key === "Escape") {
        hideMenus();
        return;
      }
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        openTerminal();
        return;
      }
      if (e.ctrlKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        const query = $("#q");
        query.focus();
        query.select();
        return;
      }
      if (e.ctrlKey && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        openExplorer(state.fs);
        return;
      }
      if (e.key === "F2" && !typing) {
        e.preventDefault();
        openSettings();
        return;
      }
      if (!typing && !e.ctrlKey && !e.altKey && !e.metaKey && /^[a-z0-9]$/i.test(e.key) && state.showOmni) {
        $("#q").focus();
      }
    });
    let rz = null;
    window.addEventListener("resize", () => {
      clearTimeout(rz);
      rz = setTimeout(renderIcons, 150);
      wins.forEach((w) => {
        if (w.max) Object.assign(w.node.style, { width: desktop.clientWidth + "px", height: desktop.clientHeight + "px" });
        w.node.style.left = Math.min(w.node.offsetLeft, Math.max(0, desktop.clientWidth - 60)) + "px";
        w.node.style.top = Math.min(w.node.offsetTop, Math.max(0, desktop.clientHeight - 24)) + "px";
      });
    });
    const BOOT = Date.now();
    applyChrome();
    renderIcons();
    save();
    try {
      if (!await stateStore.hasSeenOnboarding()) {
        await stateStore.markOnboardingSeen();
        setTimeout(openHelp, 250);
      }
    } catch (e) {
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void stateStore.save(state);
    });
  }
  void boot().catch((error) => {
    console.error("MiniOS could not start", error);
    document.body.innerHTML = `<main class="boot-error"><h1>MiniOS could not start</h1><p>${esc(error instanceof Error ? error.message : error)}</p></main>`;
  });
})();
