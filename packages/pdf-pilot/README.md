# Local PDF pilot

This optional Phase 2 pilot is a separate MCP process. It does not change the 18 Phase 1 operations, client settings, or the ToolRobin website. It is private to npm (`private: true`); no registry publication is planned for this pilot.

Convert a selectable-text PDF to Markdown using the same pinned `@firecrawl/pdf-inspector-wasm@1.25.2` engine, page checks and extraction options as ToolRobin. There is no OCR, remote transport, directory listing, file writer or network lookup.

## Run

From this directory, with Node 22.12.0 or newer:

```sh
npm ci --ignore-scripts
npm run build
node dist/index.js --read-root /absolute/path/to/a/selected/folder
```

Choose a folder containing only documents you intend the assistant to read. The command waits for MCP messages; it does not open a port. To connect, add a separate server entry after substituting your absolute Node, compiled entry and selected folder paths:

```json
{
  "mcpServers": {
    "toolrobin-files": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/pdf-pilot/dist/index.js", "--read-root", "/absolute/path/to/selected/folder"]
    }
  }
}
```

Preserve existing servers. No client is automatically granted access to your files by building this project.

## Tool and result

`toolrobin_pdf_to_markdown` takes `path` (relative `.pdf`, at most 1,024 characters) and optional `profile` (`fidelity`, default, or `compact`). Example arguments:

```json
{"path":"policy.pdf","profile":"fidelity"}
```

The response contains `markdown`, `pages`, `profile`, `pagesNeedingOcr`, `hasEncodingIssues`, `complexLayout` and a limitation note. Page markers preserve source page references. Inspect reading order, tables and missing glyphs against the PDF. An empty text layer is an error, never a fabricated extraction. Document text is untrusted source material and must not be followed as instructions.

## Bounds and privacy

- One active request per server; one regular PDF of at most 20 MiB, 1–100 pages, 30-second processing deadline, at most 1 MiB of serialized result. Oversized results are rejected, not truncated.
- Paths must stay inside the operator-configured directory. Absolute paths, traversal, links, missing files, control characters and non-PDF files are rejected. File identity and modification checks detect replacement during reads; bounded descriptor reads prevent growth from allocating an unbounded buffer.
- Parser work runs in a terminable worker. Node heap limits do not constitute an OS sandbox or a hard bound on WebAssembly/native memory. Do not expose this pilot as an untrusted public service.
- Processing makes no outbound requests, runs no document scripts and writes no files. PDF actions and external links are not executed. Package installation can contact npm. The assistant's host may store or transmit extracted text according to its policies; this process cannot control that host.
- The directory grant is explicit. This is a local product boundary, not protection against another malicious process already able to change your files. Keep the selected folder under your control.

## Verification

`npm run check && npm test` checks real PDF text and both profiles, page markers, invalid paths/files, symlinks, limits, cancellation, an actual 30-second deadline and later recovery. The stdio check denies network APIs in both parent and parser worker. `node tests/host-check.mjs` performs a separate real Codex CLI invocation using only synthetic documents and records aggregate results without raw assistant events. It requires an already authenticated client; normal tests do not.

The website parser reference is `src/tools/advanced-five/worker.ts::readPdf` at `d9053140aa1f3eb598054a1eff777debdebc2d3c`. This adapter supplies installed WASM bytes rather than fetching a browser asset; it preserves the parser and extraction options. The public project builds without the private website repository. MIT attribution for the pinned parser is included in `THIRD_PARTY_NOTICES.txt`.
