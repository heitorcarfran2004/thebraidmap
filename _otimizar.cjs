// Otimização de performance (PageSpeed) aplicada DEPOIS do _montar.cjs, só no HTML gerado.
// Não muda design, copy, integrações nem scripts externos (UTMify, CashFlow, pixel): só a forma de carregar.
//   - fontes hospedadas aqui (assets/fonts/) com preload, no lugar do CSS bloqueante do Google Fonts
//   - loading="lazy" nas imagens abaixo da dobra (as do hero, com fetchpriority, ficam como estão)
//   - srcset com versão de 800 px das imagens grandes (assets/<nome>-800.webp), para o celular baixar menos
//   - CSS e JS inline minificados (esbuild); comentários HTML removidos
// Chamado pelo _montar.cjs. Precisa do esbuild em ~/.ferramentas-web (npm i esbuild).
const fs = require('fs');
const path = require('path');
const os = require('os');

let esbuild = null;
try { esbuild = require(path.join(os.homedir(), '.ferramentas-web', 'node_modules', 'esbuild')); }
catch (e) { console.log('  aviso: esbuild não encontrado em ~/.ferramentas-web; CSS/JS ficam sem minificar'); }

const FONTES_CSS = path.join(__dirname, 'assets', 'fonts', 'fontes.css');
const PRELOAD = ['Newsreader-normal-2.woff2', 'Inter-normal-0.woff2'];
// imagem -> [largura da versão menor, sizes]. As versões ficam em assets/<nome>-<largura>.webp
// (larguras medidas na tela: carrossel 220 px no celular e 300 no PC, capas dos bônus 96 px, pacote até 460 px).
const VARIANTES = {
  'antes-depois-en': [800, '(max-width: 899px) calc(100vw - 32px), 900px'],
  'en-tres': [800, '(max-width: 899px) calc(100vw - 32px), 1000px'],
  'pacote': [800, '(max-width: 899px) calc(100vw - 58px), 460px'],
};
['en-p1', 'en-p2', 'en-p3', 'en-m18-p1', 'en-m18-p2', 'en-m18-p3', 'en-m34-p1', 'en-m34-p2', 'en-m34-p3']
  .forEach((n) => { VARIANTES[n] = [440, '(max-width: 899px) 220px, 300px']; });
[1, 2, 3, 4, 5, 6].forEach((n) => { VARIANTES['bonus-' + n] = [200, '96px']; });

module.exports = function otimizar(html, base) {
  base = base || '';
  // 1) fontes: troca os 3 <link> do Google Fonts por preload + @font-face local
  if (fs.existsSync(FONTES_CSS) && html.includes('fonts.googleapis.com/css2')) {
    const css = fs.readFileSync(FONTES_CSS, 'utf8').replace(/url\(assets\/fonts\//g, 'url(/assets/fonts/');
    const pre = PRELOAD.map((f) => `<link rel="preload" href="/assets/fonts/${f}" as="font" type="font/woff2" crossorigin>`).join('\n');
    html = html
      .replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*/, '')
      .replace(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\s*/, '')
      .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2[^>]*>/, pre + '\n<style>' + css + '</style>');
  }
  // 2) imagens abaixo da dobra: lazy (não toca nas que têm fetchpriority ou loading)
  // (as páginas do carrossel "por dentro" ficam fora: ele anda sozinho e um slide não pode aparecer em branco)
  html = html.replace(/<img\b(?![^>]*\b(?:fetchpriority|loading)=)(?![^>]*assets\/en-(?:p|m\d+-p)\d\.webp)([^>]*?)>/g, '<img loading="lazy"$1>');
  // 3) srcset com versão menor (o navegador escolhe pelo tamanho da tela)
  const b = base.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  for (const [n, [vw, sizes]] of Object.entries(VARIANTES)) {
    if (!fs.existsSync(path.join(__dirname, 'assets', `${n}-${vw}.webp`))) continue;
    const re = new RegExp(`<img([^>]*?) src="(${b}assets/${n}\\.webp)" width="(\\d+)"`, 'g');
    html = html.replace(re, (m, antes, src, w) => {
      if (m.includes('srcset')) return m;
      return `<img${antes} src="${src}" srcset="${src.replace(/\.webp$/, `-${vw}.webp`)} ${vw}w, ${src} ${w}w" sizes="${sizes}" width="${w}"`;
    });
  }
  // hero: acrescenta a versão de 800 px entre a de 640 e a de 1100 (o celular com tela densa pegava a de 1100)
  if (fs.existsSync(path.join(__dirname, 'assets', 'hero-06-800.webp')))
    html = html.replace(/(assets\/hero-06-640\.webp 640w, )/g, `$1${base}assets/hero-06-800.webp 800w, `);
  // 4) CSS e JS inline minificados
  if (esbuild) {
    html = html.replace(/<style>([\s\S]*?)<\/style>/g, (m, css) => {
      try { return '<style>' + esbuild.transformSync(css, { loader: 'css', minify: true }).code.trim() + '</style>'; } catch (e) { return m; }
    });
    html = html.replace(/<script>([\s\S]*?)<\/script>/g, (m, js) => {
      if (!js.trim()) return m;
      try { return '<script>' + esbuild.transformSync(js, { loader: 'js', minify: true, target: 'es2017' }).code.trim() + '</script>'; } catch (e) { console.log('  aviso: script inline não minificado:', e.message.split('\n')[0]); return m; }
    });
  }
  // 5) comentários HTML (menos os condicionais) e espaços entre tags
  html = html.replace(/<!--(?!\[if)[\s\S]*?-->/g, '').replace(/>\s*\n\s*</g, '>\n<');
  return html;
};
