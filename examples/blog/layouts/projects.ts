import { escapeHTML } from "../../../src/core/html.ts";

interface Project {
  name: string;
  url: string;
  desc: string;
}

interface ProjectsData {
  title: string;
  content: string;
  projects?: Project[];
}

export default ({ title, content, projects }: ProjectsData) => `
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

      ${projects && projects.length > 0 ? `
        <h2>Featured Projects</h2>
        <ul class="project-list">
          ${projects.map((project) => `
            <li>
              <p class="project-name">
                <a href="${escapeHTML(project.url)}">${escapeHTML(project.name)}</a>
              </p>
              <p class="project-desc">${escapeHTML(project.desc)}</p>
            </li>
          `).join("")}
        </ul>
      ` : `<p>No projects listed yet.</p>`}
    </main>
  </div>

  <footer class="site-footer">
    <p>Generated with <a href="https://github.com/bolotaland/bolota">Bolota</a></p>
  </footer>
</body>
</html>
`;
