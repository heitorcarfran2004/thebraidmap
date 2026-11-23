// Monta a página de vendas a partir do layout (_fonte/*.html) + textos de um idioma (textos/<idioma>.json).
//   node _montar.cjs        -> monta os dois: inglês (textos/en.json, nesta pasta) e português (textos/pt.json, em pt/)
//   node _montar.cjs en     -> só o inglês (o que vai ao ar)
//   node _montar.cjs pt     -> só o português (para o Heitor revisar; não vai ao ar)
// Mesmo motor de funis/hidroponia-vertical e funis/hidrodiag. Nunca edite index.html/promo.html gerados:
// edite _fonte/ (layout) ou textos/ (texto, preço, checkout).
//
// Marcações do layout:
//   {{a.b}}                  texto (procura no item do laço atual e depois na raiz)
//   {{#lista}}...{{/lista}}  repete para cada item; se não for lista, mostra o bloco quando verdadeiro
//   {{^chave}}...{{/chave}}  mostra quando falso/vazio
//   {{.}} item simples · {{@n}} número do item (1, 2, 3...)
const fs = require('fs');
const path = require('path');

const pedidos = process.argv[2] ? [process.argv[2]] : ['en', 'pt'];
let erro = false;

for (const idioma of pedidos) {
  const T = JSON.parse(fs.readFileSync(path.join(__dirname, 'textos', idioma + '.json'), 'utf8'));
  const C = T.config;

  // ---------- preço na moeda do idioma ----------
  const fmt = (v) => {
    const m = C.moeda;
    let [int, dec] = Number(v).toFixed(2).split('.');
    int = int.replace(/\B(?=(\d{3})+(?!\d))/g, m.milhar);
    const num = dec === '00' ? int : int + m.decimal + dec;
    const sp = m.espaco ? ' ' : '';
    return m.antes ? m.simbolo + sp + num : num + sp + m.simbolo;
  };
  const P = C.precos;
  const itensBonus = T.bonus.itens || [];
  const totalBonus = itensBonus.reduce((s, b) => s + (b.valor || 0), 0);
  itensBonus.forEach((b) => { b.valorFmt = fmt(b.valor); });
  const total = P.valorGuia + totalBonus;
  T.p = {
    essencial: fmt(P.essencial), completo: fmt(P.completo), popup: fmt(P.popup), saida: fmt(P.saida),
    valorGuia: fmt(P.valorGuia), totalBonus: fmt(totalBonus), total: fmt(total),
    difPopup: fmt(P.popup - P.essencial), ecoCompleto: fmt(total - P.completo),
    trancista: fmt(P.trancista), trancistaAno: fmt(P.trancista * P.visitasAno),
    trancistaDuas: fmt(P.trancista * P.visitasAno * 2)
  };
  T.garantiaDias = C.garantiaDias;
  T.base = (C.saida && C.saida !== '.') ? '../' : '';

  // ---------- motor de modelo ----------
  const faltando = new Set();
  const busca = (nome, pilha) => {
    if (nome === '.') return pilha[0];
    if (nome.startsWith('@')) return pilha.__n;
    const partes = nome.split('.');
    for (const f of pilha) {
      let v = f;
      let ok = true;
      for (const k of partes) {
        if (v != null && typeof v === 'object' && k in v) v = v[k]; else { ok = false; break; }
      }
      if (ok) return v;
    }
    return undefined;
  };
  const render = (tpl, pilha, n) => {
    pilha.__n = n;
    const bloco = /\{\{([#^])([\w.@]+)\}\}([\s\S]*?)\{\{\/\2\}\}/;
    let m;
    while ((m = bloco.exec(tpl))) {
      const [tudo, tipo, nome, dentro] = m;
      const v = busca(nome, pilha);
      let out = '';
      if (tipo === '^') out = (!v || (Array.isArray(v) && !v.length)) ? render(dentro, pilha, n) : '';
      else if (Array.isArray(v)) out = v.map((it, i) => render(dentro, Object.assign([it, ...pilha]), i + 1)).join('');
      else if (v) out = render(dentro, pilha, n);
      pilha.__n = n;
      tpl = tpl.slice(0, m.index) + out + tpl.slice(m.index + tudo.length);
    }
    return tpl.replace(/\{\{([\w.@]+)\}\}/g, (_, nome) => {
      const v = busca(nome, pilha);
      if (v === undefined) { faltando.add(nome); return '{{' + nome + '}}'; }
      const s = String(v);
      return s.includes('{{') ? render(s, [T], n) : s;
    });
  };

  const pastaSaida = path.join(__dirname, C.saida || '.');
  fs.mkdirSync(pastaSaida, { recursive: true });
  for (const arq of fs.readdirSync(path.join(__dirname, '_fonte')).filter((f) => f.endsWith('.html'))) {
    const tpl = fs.readFileSync(path.join(__dirname, '_fonte', arq), 'utf8');
    // performance (PageSpeed): fontes locais, lazy, srcset e minificação; ver _otimizar.cjs
    fs.writeFileSync(path.join(pastaSaida, arq), require('./_otimizar.cjs')(render(tpl, [T], 0), T.base));
    console.log('ok [' + idioma + ']', path.relative(__dirname, path.join(pastaSaida, arq)));
  }
  if (faltando.size) { console.log('TEXTOS QUE FALTAM no ' + idioma + '.json:', [...faltando].join(', ')); erro = true; }
}
if (erro) process.exitCode = 1;
