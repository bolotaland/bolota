import { escapeHTML } from "../../../src/core/html.ts";

export default ({ title, content }: { title: string; content: string }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(title)} — Bolota Blog</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header class="site-header">
    <div class="inner">
      <a href="/" class="site-title">Bolota Blog</a>
      <nav>
        <ul class="site-nav">
          <li><a href="/">Home</a></li>
          <li><a href="/about/">About</a></li>
          <li><a href="/projects/">Projects</a></li>
        </ul>
      </nav>
    </div>
  </header>

  <div class="page">
    <main>
      ${content}
    </main>
  </div>

  <footer class="site-footer">
    <p>Generated with <a href="https://github.com/bolotaland/bolota">Bolota</a></p>
  </footer>
</body>
</html>
`;
