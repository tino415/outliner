import { Amount, parseAmount } from "./properties";

/*
 * Formulas of computed columns (doc/adr/0022): arithmetic on amounts, the
 * values of other columns on this item, its parent and its previous sibling,
 * and sums over siblings before it or over its children.
 *
 *   parent.start + before(effort)        clock(parent.start + before(effort))
 *   calories * 4.184                     sum(effort) - effort
 */

export type Formula =
  | { kind: "amount"; amount: Amount }
  | { kind: "value"; of: "self" | "parent" | "previous"; key: string }
  | { kind: "call"; name: FunctionName; argument: Formula | string }
  | { kind: "binary"; operator: "+" | "-" | "*" | "/"; left: Formula; right: Formula }
  | { kind: "negate"; operand: Formula };

type FunctionName = "before" | "sum" | "min" | "max" | "mean" | "clock";

const OVER_ITEMS: FunctionName[] = ["before", "sum", "min", "max", "mean"];

/** What a formula can ask about the item it is computed for. */
export interface Scope {
  value(of: "self" | "parent" | "previous", key: string): Amount | null;
  totalBefore(key: string): Amount;
  children(key: string): Amount[];
}

export class FormulaError extends Error {}

// ---- parsing ---------------------------------------------------------------------------

const TOKEN = /\s*(?:(\d+:[0-5]\d|\d[\d.,]*(?:\s*\p{L}+(?:\s*\d[\d.,]*\s*\p{L}+)*)?)|((?:[\p{L}_][\p{L}\p{N}_]*(?:-[\p{L}_][\p{L}\p{N}_]*)*)(?:\.[\p{L}_][\p{L}\p{N}_]*(?:-[\p{L}_][\p{L}\p{N}_]*)*)?)|([-+*/()]))/uy;

export function parseFormula(source: string): Formula {
  const tokens = tokenize(source);
  let at = 0;
  const peek = () => tokens[at];
  const take = () => tokens[at++];
  const expect = (wanted: string) => {
    if (take() !== wanted) throw new FormulaError(`expected ${wanted}`);
  };

  const sum = (): Formula => {
    let left = product();
    while (peek() === "+" || peek() === "-") left = { kind: "binary", operator: take() as "+" | "-", left, right: product() };
    return left;
  };
  const product = (): Formula => {
    let left = unary();
    while (peek() === "*" || peek() === "/") left = { kind: "binary", operator: take() as "*" | "/", left, right: unary() };
    return left;
  };
  const unary = (): Formula => (peek() === "-" ? (take(), { kind: "negate", operand: unary() }) : atom());
  const atom = (): Formula => {
    const token = take();
    if (token === undefined) throw new FormulaError("the formula ends too soon");
    if (token === "(") {
      const inner = sum();
      expect(")");
      return inner;
    }
    const amount = /^\d/.test(token) ? parseAmount(token) : null;
    if (amount) return { kind: "amount", amount };
    if (!/^[\p{L}_]/u.test(token)) throw new FormulaError(`unexpected ${token}`);
    if (peek() === "(") return call(token);
    const [first, second] = token.toLowerCase().split(".");
    if (second === undefined) return { kind: "value", of: "self", key: first };
    if (first === "parent" || first === "previous") return { kind: "value", of: first, key: second };
    throw new FormulaError(`unknown ${first}: use parent.${second} or previous.${second}`);
  };
  const call = (name: string): Formula => {
    const fn = name.toLowerCase() as FunctionName;
    if (![...OVER_ITEMS, "clock"].includes(fn)) throw new FormulaError(`unknown function ${name}`);
    expect("(");
    const argument = OVER_ITEMS.includes(fn) ? keyArgument(take()) : sum();
    expect(")");
    return { kind: "call", name: fn, argument };
  };

  const formula = sum();
  if (at < tokens.length) throw new FormulaError(`unexpected ${peek()}`);
  return formula;
}

function keyArgument(token: string | undefined): string {
  if (!token || !/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(token)) throw new FormulaError("expected a column name");
  return token.toLowerCase();
}

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  const text = source.trim();
  while (TOKEN.lastIndex < text.length) {
    const start = TOKEN.lastIndex;
    const match = TOKEN.exec(text);
    if (!match) throw new FormulaError(`cannot read “${text.slice(start)}”`);
    tokens.push((match[1] ?? match[2] ?? match[3]).trim());
  }
  return tokens;
}

// ---- evaluating ------------------------------------------------------------------------

export function evaluate(formula: Formula, scope: Scope): Amount | null {
  switch (formula.kind) {
    case "amount":
      return formula.amount;
    case "value":
      return scope.value(formula.of, formula.key);
    case "negate": {
      const operand = evaluate(formula.operand, scope);
      return operand && scale(operand, -1);
    }
    case "call":
      return call(formula.name, formula.argument, scope);
    case "binary":
      return combine(formula.operator, evaluate(formula.left, scope), evaluate(formula.right, scope));
  }
}

function call(name: FunctionName, argument: Formula | string, scope: Scope): Amount | null {
  if (name === "clock") {
    const value = evaluate(argument as Formula, scope);
    if (value && value.kind !== "duration") throw new FormulaError("clock() takes a duration or a time");
    return value && { ...value, clock: true };
  }
  if (name === "before") return scope.totalBefore(argument as string);
  const values = scope.children(argument as string);
  if (values.length === 0) return null;
  if (name === "sum") return values.reduce((total, value) => combine("+", total, value)!);
  if (name === "mean") return scale(values.reduce((total, value) => combine("+", total, value)!), 1 / values.length);
  const pick = name === "min" ? Math.min : Math.max;
  const best = pick(...values.map(magnitude));
  return values.find((value) => magnitude(value) === best)!;
}

/** What nothing before the first item adds up to; it adds to a duration as well as to a number. */
export const PLAIN_ZERO: Amount = { kind: "number", value: 0, unit: "" };

function isPlainZero(amount: Amount): boolean {
  return amount.kind === "number" && amount.value === 0 && amount.unit === "";
}

export function add(left: Amount, right: Amount): Amount {
  return combine("+", left, right)!;
}

function combine(operator: "+" | "-" | "*" | "/", left: Amount | null, right: Amount | null): Amount | null {
  if (!left || !right) return null;
  if (operator === "+" || operator === "-") {
    const sign = operator === "+" ? 1 : -1;
    if (isPlainZero(right)) return left;
    if (isPlainZero(left)) return scale(right, sign);
    if (left.kind === "duration" && right.kind === "duration") {
      const isTime = operator === "+" ? Boolean(left.clock || right.clock) : Boolean(left.clock && !right.clock);
      return { kind: "duration", minutes: left.minutes + sign * right.minutes, ...(isTime ? { clock: true } : {}) };
    }
    if (left.kind === "number" && right.kind === "number") return { kind: "number", value: left.value + sign * right.value, unit: commonUnit(left.unit, right.unit) };
    throw new FormulaError("cannot add a duration and a number");
  }
  if (right.kind === "number" && operator === "*") return scale(left, right.value);
  if (right.kind === "number" && operator === "/") {
    if (right.value === 0) throw new FormulaError("division by zero");
    const ratio = scale(left, 1 / right.value);
    return ratio.kind === "number" && right.unit !== "" && ratio.unit === right.unit ? { ...ratio, unit: "" } : ratio;
  }
  if (left.kind === "number" && operator === "*") return scale(right, left.value);
  if (operator === "/" && left.kind === right.kind) {
    const divisor = magnitude(right);
    if (divisor === 0) throw new FormulaError("division by zero");
    return { kind: "number", value: magnitude(left) / divisor, unit: "" };
  }
  throw new FormulaError("cannot multiply two durations");
}

function commonUnit(left: string, right: string): string {
  if (left && right && left.toLowerCase() !== right.toLowerCase()) throw new FormulaError(`cannot add ${left} and ${right}`);
  return left || right;
}

function scale(amount: Amount, factor: number): Amount {
  return amount.kind === "duration" ? { ...amount, minutes: Math.round(amount.minutes * factor) } : { ...amount, value: amount.value * factor };
}

function magnitude(amount: Amount): number {
  return amount.kind === "duration" ? amount.minutes : amount.value;
}
