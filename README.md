# Ignis

A minimal static site generator (SSG) powered by [Bun](https://bun.sh) and vanilla TypeScript. Built to explore Bun's native APIs while remaining fully functional and pleasant to use.

> **Inspirations**: [Lume](https://lume.land) · [Eleventy](https://www.11ty.dev) · [Hugo](https://gohugo.io)

---

## ✨ Features

| Feature | Details |
|---|---|
| **Content** | `.md` files with YAML/TOML frontmatter |
| **Templating** | [Vento](https://vento.js.org) `.vto` templates |
| **Layouts** | Reusable templates in `layouts/` |
| **Assets** | Auto-copy `public/` → `_site/` |
| **Dev server** | `Bun.serve()` with SSE live-reload |
| **Watch mode** | Auto-rebuild on file change |
| **Zero config** | Sensible defaults out of the box |

---

## 🚀 Quick start

### Prerequisites

- [Bun](https://bun.sh) installed (v1.0+)

### Installation

```bash
cd /Users/normcore/Code/ignis
bun install
```

> **Dependencies**: `ventojs` (template engine) + `@types/bun` (dev). That's it.

### Usage

```bash
# Static build
bun run build

# Dev server with live-reload
bun run serve

# Watch without server
bun run watch
```

### Example

```bash
cd examples/blog
bun run serve
# → http://localhost:3000
```

---

## 📁 Project structure

```
my-site/
├── ignis.config.ts      # Optional config
├── content/             # Markdown files
├── layouts/             # Vento .vto templates
└── public/              # Static assets
```

---

## 🛠️ Tech stack

- **Runtime**: Bun (JavaScriptCore)
- **Language**: Strict TypeScript, native ESM
- **Markdown**: `Bun.markdown.html()` — native Zig parser
- **Templating**: [Vento](https://vento.js.org)
- **File I/O**: `Bun.file`, `Bun.write`, `Bun.Glob`
- **Server**: `Bun.serve` with SSE live-reload

---

## 📜 License

MIT
