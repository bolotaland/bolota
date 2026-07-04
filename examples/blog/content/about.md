---
title: About
layout: post
date: 2025-01-15
---

# About Ignis

Ignis is a minimal static site generator (SSG) built with **Bun** and **TypeScript**. It was created as a style exercise to explore Bun's native APIs — `Bun.Glob`, `Bun.file`, `Bun.write`, `Bun.serve`, and `Bun.markdown`.

## Design Goals

- **Zero bloat**: Only one external dependency (`ventojs`)
- **Native Bun APIs**: File I/O, globbing, server, Markdown parser
- **Type-safe**: Strict TypeScript throughout
- **Pleasant developer experience**: Live-reload dev server, clean code

## Inspirations

Ignis draws inspiration from:

- [Lume](https://lume.land) — Deno's SSG, elegant and simple
- [Eleventy](https://www.11ty.dev) — JavaScript-based, flexible
- [Hugo](https://gohugo.io) — The gold standard for speed

## Features

| Feature | Implementation |
|---|---|
| Content | Markdown with YAML/TOML frontmatter |
| Templating | Vento (`{{ }}`, `{{ if }}`, `{{ for }}`) |
| Layouts | Reusable `.vto` templates |
| Assets | Auto-copy from `public/` |
| Dev server | `Bun.serve()` with SSE live-reload |
