---
title: About
layout: page
date: 2025-01-15
---

# About Bolota

Bolota is a minimal static site generator (SSG) built with **Bun** and **TypeScript**. It was created as a style exercise to explore Bun's native APIs — `Bun.Glob`, `Bun.file`, `Bun.write`, `Bun.serve`, and `Bun.markdown`.

## Design Goals

- **Zero runtime dependencies**: No external template engine, no lockfile bloat
- **Native Bun APIs**: File I/O, globbing, server, Markdown parser
- **Type-safe**: Strict TypeScript throughout
- **Pleasant developer experience**: Live-reload dev server, clean code

## Inspirations

Bolota draws inspiration from:

- [Lume](https://lume.land) — Deno's SSG, elegant and simple
- [Eleventy](https://www.11ty.dev) — JavaScript-based, flexible
- [Hugo](https://gohugo.io) — The gold standard for speed

## Features

| Feature | Implementation |
|---|---|
| Content | Markdown with YAML/TOML frontmatter |
| Templating | Native JavaScript/TypeScript functions |
| Layouts | Reusable `.ts` layout modules |
| Assets | Auto-copy from `public/` and co-located assets |
| Dev server | `Bun.serve()` with SSE live-reload |
