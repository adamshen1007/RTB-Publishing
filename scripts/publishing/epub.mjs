import { resolve } from "node:path";
import { command } from "./common.mjs";
export function renderEpub(snapshot, output) { command("pandoc", [snapshot.markdown, "--from=markdown+yaml_metadata_block-raw_html", "--to=epub3", "--toc", `--css=${resolve(snapshot.root, "epub.css")}`, "--resource-path", snapshot.root, "--output", output], { env: { SOURCE_DATE_EPOCH: "1785196800" } }); return output; }
