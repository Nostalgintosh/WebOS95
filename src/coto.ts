export type CotoValue = string | number | boolean;

export interface CotoDiagnostic {
  severity: "error" | "warning";
  code: string;
  message: string;
  line: number;
  column: number;
}

export interface CotoCompileResult {
  ok: boolean;
  programId: string;
  output: string;
  priorityEvents: string[];
  returnCode: number;
  diagnostics: CotoDiagnostic[];
  instructions: number;
  variables: Record<string, { type: string; value: CotoValue }>;
}

export interface CotoModulePreview {
  format: "minios-vmcoto-preview/1";
  programId: string;
  checksum: string;
  bytes: number;
  instructions: number;
  capabilities: string[];
}

export const COTO_TARGETS = [
  ["macos-arm64", "Mach-O / AAPCS64"],
  ["macos-x86_64", "Mach-O / System V"],
  ["linux-x86_64", "ELF64 / Linux syscalls"],
  ["unix-x86_64", "ELF64 / BSD syscalls"],
  ["windows-x64", "COFF / Microsoft x64"],
  ["windows-arm64", "COFF / AAPCS64"],
  ["x86_64-uefi", "freestanding OS/Coto payload"],
  ["VM/Coto 1.1 + 2.0", "verified portable modules"]
] as const;

export const COTO_SAMPLES = {
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
} as const;

type TokenKind = "number" | "string" | "identifier" | "operator" | "eof";
interface Token { kind: TokenKind; value: string; position: number; }

class ExpressionError extends Error {
  constructor(message: string, readonly position = 0){ super(message); }
}

function tokenizeExpression(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while(i < source.length){
    const ch = source[i];
    if(/\s/.test(ch)){ i++; continue; }
    if(ch === '"' || ch === "'"){
      const quote = ch; const start = i++; let value = "", closed = false;
      while(i < source.length){
        const next = source[i++];
        if(next === quote){ closed = true; break; }
        if(next === "\\"){
          if(i >= source.length) break;
          const escaped = source[i++];
          value += ({ n:"\n", r:"\r", t:"\t", "\\":"\\", '"':'"', "'":"'" } as Record<string,string>)[escaped] ?? escaped;
        }else value += next;
      }
      if(!closed) throw new ExpressionError("unterminated string literal", start);
      tokens.push({ kind:"string", value, position:start });
      continue;
    }
    if(/\d/.test(ch)){
      const start = i;
      while(i < source.length && /[\d.]/.test(source[i])) i++;
      const value = source.slice(start,i);
      if(!/^\d+(?:\.\d+)?$/.test(value)) throw new ExpressionError("invalid numeric literal", start);
      tokens.push({ kind:"number", value, position:start });
      continue;
    }
    if(/[A-Za-z_]/.test(ch)){
      const start = i++;
      while(i < source.length && /[A-Za-z0-9_]/.test(source[i])) i++;
      tokens.push({ kind:"identifier", value:source.slice(start,i), position:start });
      continue;
    }
    const pair = source.slice(i,i+2);
    if(["..","==","!=","<=",">=","&&","||"].includes(pair)){
      tokens.push({ kind:"operator", value:pair, position:i }); i += 2; continue;
    }
    if("+-*/%()!<>".includes(ch)){
      tokens.push({ kind:"operator", value:ch, position:i }); i++; continue;
    }
    throw new ExpressionError(`unexpected token '${ch}'`, i);
  }
  tokens.push({ kind:"eof", value:"", position:source.length });
  return tokens;
}

function valueText(value: CotoValue): string {
  return typeof value === "boolean" ? (value ? "FIRE" : "HOLD") : String(value);
}

function evaluateExpression(source: string, variables: Map<string,{ type:string; value:CotoValue }>): CotoValue {
  const tokens = tokenizeExpression(source);
  let at = 0;
  const peek = () => tokens[at];
  const take = (value?: string) => {
    const token = tokens[at];
    if(value != null && token.value !== value) throw new ExpressionError(`expected '${value}'`, token.position);
    at++; return token;
  };
  const numeric = (value:CotoValue, token:Token) => {
    if(typeof value !== "number" || !Number.isSafeInteger(value)) throw new ExpressionError("numeric expression requires a checked int value", token.position);
    return value;
  };
  const checked = (value:number, token:Token) => {
    if(!Number.isSafeInteger(value)) throw new ExpressionError("integer overflow in checked Coto expression",token.position);
    return value;
  };
  const truthy = (value:CotoValue, token:Token) => {
    if(typeof value !== "boolean") throw new ExpressionError("boolean expression requires FIRE or HOLD", token.position);
    return value;
  };

  const primary = (): CotoValue => {
    const token = peek();
    if(token.kind === "number"){
      take(); const value=Number(token.value);
      if(!Number.isSafeInteger(value)) throw new ExpressionError("decimal literals are not executable in the hosted int preview",token.position);
      return value;
    }
    if(token.kind === "string"){ take(); return token.value; }
    if(token.kind === "identifier"){
      take();
      const name = token.value;
      if(/^FIRE$/i.test(name) || /^true$/i.test(name)) return true;
      if(/^HOLD$/i.test(name) || /^false$/i.test(name)) return false;
      const variable = variables.get(name);
      if(!variable) throw new ExpressionError(`unknown identifier '${name}'`, token.position);
      return variable.value;
    }
    if(token.value === "("){
      take("("); const value = concat(); take(")"); return value;
    }
    throw new ExpressionError("expected a value", token.position);
  };
  const unary = (): CotoValue => {
    const token = peek();
    if(token.value === "-"){ take(); return -numeric(unary(),token); }
    if(token.value === "!"){ take(); return !truthy(unary(),token); }
    return primary();
  };
  const multiply = (): CotoValue => {
    let left = unary();
    while(["*","/","%"].includes(peek().value)){
      const operator = take(); const right = numeric(unary(),operator); const first = numeric(left,operator);
      if((operator.value === "/" || operator.value === "%") && right === 0) throw new ExpressionError("division by zero",operator.position);
      left = checked(operator.value === "*" ? first * right : operator.value === "/" ? Math.trunc(first / right) : first % right,operator);
    }
    return left;
  };
  const add = (): CotoValue => {
    let left = multiply();
    while(["+","-"].includes(peek().value)){
      const operator = take(); const right = numeric(multiply(),operator); const first = numeric(left,operator);
      left = checked(operator.value === "+" ? first + right : first - right,operator);
    }
    return left;
  };
  const compare = (): CotoValue => {
    let left = add();
    while(["<","<=",">",">="].includes(peek().value)){
      const operator = take(); const right = numeric(add(),operator); const first = numeric(left,operator);
      left = operator.value === "<" ? first < right : operator.value === "<=" ? first <= right : operator.value === ">" ? first > right : first >= right;
    }
    return left;
  };
  const equality = (): CotoValue => {
    let left = compare();
    while(["==","!="].includes(peek().value)){
      const operator = take(); const right = compare(); left = operator.value === "==" ? left === right : left !== right;
    }
    return left;
  };
  const and = (): CotoValue => {
    let left = equality();
    while(peek().value === "&&"){ const operator=take(); left = truthy(left,operator) && truthy(equality(),operator); }
    return left;
  };
  const or = (): CotoValue => {
    let left = and();
    while(peek().value === "||"){ const operator=take(); left = truthy(left,operator) || truthy(and(),operator); }
    return left;
  };
  const concat = (): CotoValue => {
    let left = or();
    while(peek().value === ".."){ take(); left = valueText(left) + valueText(or()); }
    return left;
  };

  const result = concat();
  if(peek().kind !== "eof") throw new ExpressionError(`unexpected token '${peek().value}'`,peek().position);
  return result;
}

function stripComments(source: string): string {
  let out = "", mode: "code"|"string"|"line"|"block" = "code", quote = "";
  for(let i=0;i<source.length;i++){
    const ch=source[i], next=source[i+1];
    if(mode === "line"){
      if(ch === "\n"){ mode="code"; out += ch; } else out += " ";
    }else if(mode === "block"){
      if(ch === "*" && next === "/"){ out += "  "; i++; mode="code"; }
      else out += ch === "\n" ? "\n" : " ";
    }else if(mode === "string"){
      out += ch;
      if(ch === "\\" && next != null){ out += next; i++; }
      else if(ch === quote) mode="code";
    }else if(ch === "/" && next === "/"){
      out += "  "; i++; mode="line";
    }else if(ch === "/" && next === "*"){
      out += "  "; i++; mode="block";
    }else{
      out += ch;
      if(ch === '"' || ch === "'"){ mode="string"; quote=ch; }
    }
  }
  return out;
}

function lineColumn(source:string,index:number){
  const before=source.slice(0,Math.max(0,index));
  const lines=before.split("\n");
  return { line:lines.length, column:(lines[lines.length-1]?.length || 0)+1 };
}

function findClosingBrace(source:string,open:number):number {
  let depth=0, quote="";
  for(let i=open;i<source.length;i++){
    const ch=source[i];
    if(quote){ if(ch === "\\") i++; else if(ch === quote) quote=""; continue; }
    if(ch === '"' || ch === "'"){ quote=ch; continue; }
    if(ch === "{") depth++;
    else if(ch === "}" && --depth === 0) return i;
  }
  return -1;
}

function splitStatements(body:string,offset:number){
  const statements:Array<{ text:string; index:number }> = [];
  let start=0, quote="", parens=0;
  for(let i=0;i<body.length;i++){
    const ch=body[i];
    if(quote){ if(ch === "\\") i++; else if(ch === quote) quote=""; continue; }
    if(ch === '"' || ch === "'"){ quote=ch; continue; }
    if(ch === "(") parens++;
    else if(ch === ")") parens--;
    else if(ch === ";" && parens === 0){
      const raw=body.slice(start,i); const leading=raw.search(/\S/);
      if(leading >= 0) statements.push({ text:raw.trim(), index:offset+start+leading });
      start=i+1;
    }
  }
  const rest=body.slice(start); const leading=rest.search(/\S/);
  return { statements, trailing:leading >= 0 ? { text:rest.trim(), index:offset+start+leading } : null };
}

export function compileCoto(source:string):CotoCompileResult {
  const clean=stripComments(source);
  const diagnostics:CotoDiagnostic[]=[];
  const variables=new Map<string,{ type:string; value:CotoValue }>();
  const addDiagnostic=(severity:CotoDiagnostic["severity"],code:string,message:string,index:number) => {
    diagnostics.push({ severity,code,message,...lineColumn(source,index) });
  };
  const programId=clean.match(/PROGRAM-ID\.\s+([A-Z0-9-]+)\s*\./i)?.[1] || "UNTITLED-COTO";
  if(!/IDENTIFICATION\s+DIVISION\./i.test(clean)) addDiagnostic("warning","COTO2001","IDENTIFICATION DIVISION is recommended for a visible program contract",0);
  if(!/PROCEDURE\s+DIVISION\./i.test(clean)) addDiagnostic("warning","COTO2002","PROCEDURE DIVISION is recommended for executable source",0);

  const main=/func\s+int\s+main\s*\(\s*\)\s*\{/i.exec(clean);
  if(!main){
    addDiagnostic("error","COTO1001","expected 'func int main() {' entry point",0);
    return { ok:false,programId,output:"",priorityEvents:[],returnCode:1,diagnostics,instructions:0,variables:{} };
  }
  const open=clean.indexOf("{",main.index), close=findClosingBrace(clean,open);
  if(close < 0){
    addDiagnostic("error","COTO1002","main function is missing a closing '}'",open);
    return { ok:false,programId,output:"",priorityEvents:[],returnCode:1,diagnostics,instructions:0,variables:{} };
  }
  const {statements,trailing}=splitStatements(clean.slice(open+1,close),open+1);
  if(trailing) addDiagnostic("error","COTO1003",`missing semicolon after '${trailing.text.slice(0,28)}${trailing.text.length>28?"…":""}'`,trailing.index);

  let output="", returnCode=0, returned=false, instructions=0;
  const priorityEvents:string[]=[];
  for(const statement of statements){
    if(returned){ addDiagnostic("warning","COTO2004","unreachable statement after return",statement.index); continue; }
    try{
      let match:RegExpExecArray|null;
      if((match=/^display\s*\(([\s\S]*)\)$/i.exec(statement.text))){
        output += valueText(evaluateExpression(match[1],variables)); instructions++;
      }else if((match=/^makefirst\s*\(([\s\S]*)\)$/i.exec(statement.text))){
        priorityEvents.push(valueText(evaluateExpression(match[1],variables))); instructions++;
      }else if((match=/^return\s+([\s\S]+)$/i.exec(statement.text))){
        const value=evaluateExpression(match[1],variables);
        if(typeof value !== "number" || !Number.isSafeInteger(value)) throw new ExpressionError("main must return a checked int value");
        returnCode=value; returned=true; instructions++;
      }else if((match=/^(int|string|bool)\s+([A-Za-z_]\w*)(?:\s*=\s*([\s\S]+))?$/i.exec(statement.text))){
        const type=match[1].toLowerCase(), name=match[2];
        if(variables.has(name)) throw new ExpressionError(`duplicate variable '${name}'`);
        const value=match[3] != null ? evaluateExpression(match[3],variables) : type === "int" ? 0 : type === "string" ? "" : false;
        const actual=typeof value === "number" ? "int" : typeof value === "string" ? "string" : "bool";
        if(actual !== type || (type === "int" && !Number.isSafeInteger(value))) throw new ExpressionError(`type mismatch: ${name} expects ${type}, received ${actual}`);
        variables.set(name,{type,value}); instructions++;
      }else if((match=/^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/.exec(statement.text))){
        const variable=variables.get(match[1]);
        if(!variable) throw new ExpressionError(`unknown identifier '${match[1]}'`);
        const value=evaluateExpression(match[2],variables);
        const actual=typeof value === "number" ? "int" : typeof value === "string" ? "string" : "bool";
        if(actual !== variable.type) throw new ExpressionError(`type mismatch: ${match[1]} expects ${variable.type}, received ${actual}`);
        variable.value=value; instructions++;
      }else{
        throw new ExpressionError("statement is outside the MiniOS hosted preview subset");
      }
    }catch(error){
      const expressionError=error instanceof ExpressionError ? error : new ExpressionError(String(error));
      addDiagnostic("error","COTO1100",expressionError.message,statement.index+expressionError.position);
    }
  }
  if(!returned && !diagnostics.some(item=>item.severity === "error")) addDiagnostic("warning","COTO2003","main has no explicit return; preview uses RETURN-CODE 0",close);
  const variableRecord=Object.fromEntries(variables.entries());
  return { ok:!diagnostics.some(item=>item.severity === "error"),programId,output,priorityEvents,returnCode,diagnostics,instructions,variables:variableRecord };
}

function checksum(source:string):string {
  let hash=0x811c9dc5;
  for(let i=0;i<source.length;i++){ hash ^= source.charCodeAt(i); hash=Math.imul(hash,0x01000193)>>>0; }
  return hash.toString(16).padStart(8,"0");
}

export function buildCotoModule(source:string,result: CotoCompileResult):CotoModulePreview|null {
  if(!result.ok) return null;
  return {
    format:"minios-vmcoto-preview/1",
    programId:result.programId,
    checksum:checksum(source),
    bytes:new TextEncoder().encode(source).length + result.instructions*8 + 24,
    instructions:result.instructions,
    capabilities:["console.display",...(result.priorityEvents.length?["priority.dispatch"]:[])]
  };
}
