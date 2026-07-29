import { resolve } from "node:path";
import { command } from "./common.mjs";
export function renderHtml(snapshot, output) { command("pandoc", [snapshot.markdown, "--from=markdown+yaml_metadata_block-raw_html", "--to=html5", "--standalone", "--toc", "--embed-resources", `--css=${resolve(snapshot.root, "styles.css")}`, "--resource-path", snapshot.root, "--output", output], { env: { SOURCE_DATE_EPOCH: "1785196800" } }); return output; }
