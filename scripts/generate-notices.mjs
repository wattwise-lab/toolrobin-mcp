import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const paths = execFileSync(
  "npm",
  ["ls", "--omit=dev", "--all", "--parseable"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .slice(1);
const sections = [];
for (const path of paths) {
  const pkg = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
  const licenses = readdirSync(path, { withFileTypes: true }).filter(
    (f) => f.isFile() && /^(licen[cs]e|copying|notice)(\.|$)/i.test(f.name),
  );
  sections.push(
    `${pkg.name}@${pkg.version}\nDeclared license: ${typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license)}\n` +
      licenses
        .map((f) => `${f.name}\n${readFileSync(join(path, f.name), "utf8")}`)
        .join("\n"),
  );
}
sections.sort();
const noticeText =
  "Third-party production dependencies. Generated from the locked installation.\nThese retain their respective licenses. ToolRobin source provenance is in PROVENANCE.json.\n\n" +
    sections.join("\n\n" + "=".repeat(72) + "\n\n");
writeFileSync("THIRD_PARTY_NOTICES.txt", noticeText.replace(/\r\n?/g,"\n").replace(/[ \t]+$/gm,"").trimEnd()+"\n");
process.stdout.write(
  `Recorded notices for ${sections.length} installed production packages.\n`,
);
