const fs = require('fs');
const path = require('path');

function readPackage() {
  const p = path.resolve(process.cwd(), 'package.json');
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function listTopLevelDirs() {
  return fs.readdirSync(process.cwd(), { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(n => !['node_modules', '.git', '.github', 'dist'].includes(n))
    .sort();
}

function gatherDocs() {
  const docsDir = path.resolve(process.cwd(), 'docs');
  if (!fs.existsSync(docsDir)) return [];
  return fs.readdirSync(docsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const full = path.join(docsDir, f);
      const content = fs.readFileSync(full, 'utf8');
      const titleMatch = content.split('\n').find(l => l.trim().startsWith('#')) || '';
      const title = titleMatch.replace(/^#+/, '').trim() || f;
      return { file: path.join('docs', f), title };
    })
    .sort((a,b)=> a.file.localeCompare(b.file));
}

function buildReadme(pkg, dirs, docs) {
  const lines = [];
  const title = pkg.name || path.basename(process.cwd());
  lines.push(`# ${title}`);
  if (pkg.description) lines.push('', pkg.description);

  lines.push('');
  lines.push('## Quick Links');
  if (pkg.homepage) lines.push(`- Homepage: ${pkg.homepage}`);
  if (pkg.repository && pkg.repository.url) lines.push(`- Repository: ${pkg.repository.url}`);
  if (pkg.license) lines.push(`- License: ${pkg.license}`);
  lines.push('');

  if (docs.length) {
    lines.push('## Docs');
    docs.forEach(d => lines.push(`- [${d.title}](${d.file})`));
    lines.push('');
  }

  lines.push('## Project Structure');
  dirs.forEach(d => lines.push(`- ${d}`));
  lines.push('');

  lines.push('## Package Scripts');
  if (pkg.scripts) {
    Object.keys(pkg.scripts).forEach(k => lines.push('- `' + k + '`: ' + pkg.scripts[k]));
  } else {
    lines.push('- (no scripts defined)');
  }
  lines.push('');

  lines.push('## How to generate this README');
  lines.push('Run `npm run generate-readme` to regenerate this file.');

  return lines.join('\n');
}

function main(){
  const pkg = readPackage();
  const dirs = listTopLevelDirs();
  const docs = gatherDocs();
  const out = buildReadme(pkg, dirs, docs);
  fs.writeFileSync(path.resolve(process.cwd(), 'README.md'), out, 'utf8');
  console.log('README.md generated');
}

main();
