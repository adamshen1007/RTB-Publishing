import { materialHash } from "./common.mjs";

/** Integrity-only check. Publication authority comes exclusively from a completed durable finalization. */
export function verifyManifestChecksum(manifest) { const { manifestHash, ...material } = manifest; if (materialHash(material) !== manifestHash) throw new Error("Release manifest has drifted."); return true; }
