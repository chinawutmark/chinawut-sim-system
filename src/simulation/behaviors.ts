import type { BehaviorFactory, ComponentBehavior, SignalValue } from "./types.js";
import { digital } from "./signals.js";

export class BehaviorRegistry {
  readonly #factories = new Map<string, BehaviorFactory>();
  register(id: string, factory: BehaviorFactory): this { if (this.#factories.has(id)) throw new Error(`Behavior '${id}' is already registered`); this.#factories.set(id, factory); return this; }
  get(id: string): BehaviorFactory | undefined { return this.#factories.get(id); }
}
export type LogicExpression = { input: string } | { constant: SignalValue } | { op: "not"; value: LogicExpression } | { op: "and" | "or"; values: LogicExpression[] } | { op: "gt" | "gte" | "lt" | "lte" | "eq"; left: LogicExpression; right: LogicExpression };
export interface LogicRule { output: string; value: LogicExpression; delayMs?: number }
function scalar(value: SignalValue | undefined): unknown { if (!value) return undefined; if (value.kind === "digital") return value.level === "HIGH"; if (value.kind === "analog") return value.value; if (value.kind === "pwm") return value.dutyCycle; if (value.kind === "data") return value.value; return value; }
function expression(expr: LogicExpression, read: (id: string) => SignalValue | undefined): SignalValue {
  if ("input" in expr) return read(expr.input) ?? digital("UNKNOWN"); if ("constant" in expr) return expr.constant;
  if (expr.op === "not") return digital(Boolean(!scalar(expression(expr.value, read))) ? "HIGH" : "LOW");
  if (expr.op === "and" || expr.op === "or") { const values=expr.values.map(v=>Boolean(scalar(expression(v,read)))); return digital((expr.op === "and" ? values.every(Boolean) : values.some(Boolean)) ? "HIGH":"LOW"); }
  const comparison = expr as Extract<LogicExpression, { left: LogicExpression }>;
  const l=scalar(expression(comparison.left,read)); const r=scalar(expression(comparison.right,read)); let result=false;
  if (expr.op === "eq") result=l===r; else if (typeof l === "number" && typeof r === "number") result=expr.op === "gt"?l>r:expr.op === "gte"?l>=r:expr.op === "lt"?l<r:l<=r;
  return digital(result?"HIGH":"LOW");
}
export const logicalController = (rules: readonly LogicRule[]): ComponentBehavior => ({ evaluate(ctx) { for (const rule of rules) ctx.drive(rule.output, expression(rule.value, id=>ctx.readInput(id)), rule.delayMs); } });
export const digitalSource = (output="out", initial: "LOW"|"HIGH"="LOW"): ComponentBehavior => ({ initialize: ctx=>ctx.drive(output,digital(initial)), onEvent(ctx,event) { if (event.type === "external-input") ctx.drive(output,event.payload as SignalValue); } });
export const analogSource = (output="out", initial=0, unit="V"): ComponentBehavior => ({ initialize: ctx=>ctx.drive(output,{kind:"analog",value:initial,unit}), onEvent(ctx,event) { if(event.type==="external-input") ctx.drive(output,event.payload as SignalValue); } });
export const pwmSource = (output="out", dutyCycle=0, frequencyHz=1000): ComponentBehavior => ({ initialize:ctx=>ctx.drive(output,{kind:"pwm",dutyCycle,frequencyHz}), onEvent(ctx,event){if(event.type==="external-input")ctx.drive(output,event.payload as SignalValue);} });
export const digitalIndicator = (input="in"): ComponentBehavior => ({ initialize:ctx=>ctx.setState("on",false), evaluate(ctx){ const v=ctx.readInput(input); ctx.setState("on",v?.kind==="digital"&&v.level==="HIGH"); } });
export const relayBehavior = (input="control"): ComponentBehavior => ({ initialize:ctx=>ctx.setState("energized",false), evaluate(ctx){const v=ctx.readInput(input);ctx.setState("energized",v?.kind==="digital"&&v.level==="HIGH");} });
export const pwmActuator = (input="pwm"): ComponentBehavior => ({ initialize:ctx=>ctx.setState("speedCommand",0), evaluate(ctx){const v=ctx.readInput(input);ctx.setState("speedCommand",v?.kind==="pwm"?v.dutyCycle:0);} });
