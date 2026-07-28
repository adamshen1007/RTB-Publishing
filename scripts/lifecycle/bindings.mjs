import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const hash = (v) => createHash("sha256").update(Buffer.isBuffer(v) || typeof v === "string" ? v : JSON.stringify(v, Object.keys(v).sort())).digest("hex");
export class CanonicalLifecycleBindingProvider { constructor({ book }) { this.book = book; } resolve(gate) { if (gate !== "blueprint") return { available: false, message: `${gate} is unavailable until an authoritative verified record exists.` }; const b = this.book.blueprint; return { available: true, bindings: { briefHash: hash(readFileSync(this.book.metadataPath)), sourcePolicyHash: hash(b.source_policy), budgetsHash: hash(b.budgets), egressPolicyHash: hash(b.provider_egress_policy), blueprintHash: hash(readFileSync(resolve(this.book.root, this.book.manifest.blueprint.path))) } }; } }
export class StaticLifecycleBindingProvider { constructor(values = {}) { this.values = values; } resolve(gate) { return this.values[gate] ? { available: true, bindings: this.values[gate] } : { available: false, message: "No verified binding is available." }; } }
