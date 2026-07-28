import { resolve } from "node:path";
import { inspectBetaMaterial } from "./beta-material.mjs";

/** Prepare exact Beta lifecycle material from canonical Markdown and the fixed local Notion receipt. */
export class BetaPreparationService {
  constructor({ book, bindingProvider, actorResolver, stateFile } = {}) {
    if (!book?.legacyRoot || !book?.id) throw new Error("Beta preparation requires a resolved canonical Book Project.");
    if (typeof bindingProvider?.registerBeta !== "function") throw new Error("Beta preparation requires the authoritative lifecycle binding provider.");
    if (typeof actorResolver !== "function") throw new Error("Beta preparation requires a server-side actor resolver.");
    this.book = book;
    this.bindingProvider = bindingProvider;
    this.actorResolver = actorResolver;
    this.stateFile = stateFile ?? resolve(book.legacyRoot, ".rtb-publishing", "notion", "sync-state.json");
  }

  inspect() { return inspectBetaMaterial(this.book, this.stateFile); }

  async prepare() {
    const inspected = this.inspect();
    if (inspected.state !== "ready") throw new Error(inspected.message);
    const actor = this.actorResolver();
    if (actor?.type !== "human" || typeof actor.id !== "string" || actor.id.trim().length < 2) throw new Error("Beta preparation requires a server-resolved human reviewer.");
    const registration = await this.bindingProvider.registerBeta({ betaSnapshotHash: inspected.betaSnapshotHash, policyResultsHash: inspected.policyResultsHash, reviewerId: actor.id.trim() });
    return { state: "prepared", message: "Exact Beta material was prepared from the current canonical chapters and private Notion receipt.", chapterCount: inspected.chapterCount, registration };
  }
}
