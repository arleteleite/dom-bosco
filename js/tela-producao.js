// Tela de Produção (etapa 14): meta e fornadas do dia, sobras e descarte, e a conciliação do fim do dia.
// SIMULAÇÃO para a proprietária dizer como a produção funciona hoje e o que cabe registrar na rotina. Nada é gravado.
// Registrar uma fornada baixa os insumos do estoque de verdade (dentro do piloto): dá para ver o efeito na tela Estoque.

import {
  DESTINOS, producao, produtosDeProducao, metaDe, definirMeta, previaDaFornada, registrarFornada, desfazerFornada, produzidoHoje,
  consumoDoDia, registrarSaida, removerSaida, vendidoHoje, definirContagem, conciliar, limparDia, preencherDiaDeExemplo,
} from './producao.js';
import { AREAS } from './produtos.js';
import { fmtMoeda, fmtNumero, fmtQtd, fmtHora, esc } from './formato.js';

const ABAS = { hoje: 'Produção do dia', sobras: 'Sobras e descarte', fim: 'Fim do dia' };
const ui = { produto: '', qtd: '', quem: '', aviso: '', erro: '', sobraProduto: '', sobraQtd: '', sobraDestino: 'descarte', sobraObs: '' };
const hoje = () => new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const numeroOuNulo = (t) => (String(t).trim() === '' || !Number.isFinite(Number(String(t).replace(',', '.'))) ? null : Number(String(t).replace(',', '.')));

export function telaProducao() { return '<div data-producao></div>'; }

const opcoesProdutos = (selecionado) => `<option value="">Escolha o produto…</option>${produtosDeProducao().map((p) => `<option value="${esc(p.id)}"${p.id === selecionado ? ' selected' : ''}>${esc(p.nome)} (${esc(AREAS[p.area].toLowerCase())})</option>`).join('')}`;

function htmlTopo(aba) {
  return `
    <nav class="abas" aria-label="Visões da produção">
      ${Object.entries(ABAS).map(([k, r]) => `<a class="aba" href="#/producao/${k === 'hoje' ? '' : k}"${aba === k ? ' aria-current="page"' : ''}>${r}</a>`).join('')}
      <span class="abas__offline abas__grupo">
        <button type="button" class="botao botao--pequeno botao--secundario" data-exemplo-dia>Preencher um dia de exemplo</button>
        <button type="button" class="botao botao--pequeno botao--secundario" data-limpar-dia>Limpar o dia</button>
      </span>
    </nav>
    <p class="sub">Hoje: ${esc(hoje())}. As vendas vêm do Balcão (com as vendas de exemplo ligadas, se estiverem). O "dia de exemplo" é inventado.</p>
    ${ui.aviso ? `<p class="conferencia conferencia--ok" role="status">${ui.aviso}</p>` : ''}`;
}

// ---- Produção do dia ---------------------------------------------------------------------------------

function htmlPrevia() {
  const qtd = numeroOuNulo(ui.qtd);
  if (!ui.produto || !(qtd > 0)) return '<p class="sub">Escolha o produto e a quantidade para ver quais insumos vão sair do estoque.</p>';
  const linhas = previaDaFornada(ui.produto, qtd);
  const faltas = linhas.filter((l) => l.faltara > 0.0005);
  return `
    <p class="rotulo-pequeno">Vai sair do estoque (pela ficha técnica)</p>
    <ul class="previa">${linhas.map((l) => `<li><span>${esc(l.nome)}</span><strong>${fmtQtd(l.qtd, l.uso)}</strong><span class="sub">saldo ${fmtQtd(l.saldo, l.uso)}</span>${l.faltara > 0.0005 ? `<span class="chip chip--alerta">falta ${fmtQtd(l.faltara, l.uso)}</span>` : ''}</li>`).join('')}</ul>
    ${faltas.length ? '<p class="conferencia conferencia--alerta" role="status">O estoque não tem tudo isso. Pode ser que a contagem do Estoque esteja desatualizada: o saldo vai a zero e a falta fica registrada na fornada.</p>' : ''}`;
}

function htmlProducaoDoDia() {
  const linhas = produtosDeProducao().map((p) => {
    const meta = metaDe(p.id);
    const prod = produzidoHoje(p.id);
    const pct = meta > 0 ? Math.min(100, Math.round((prod / meta) * 100)) : 0;
    return `
      <tr data-produto="${esc(p.id)}">
        <td><strong>${esc(p.nome)}</strong><span class="sub">${esc(AREAS[p.area])}</span></td>
        <td class="num"><input class="campo campo--pequeno campo--numero" type="number" min="0" step="1" inputmode="numeric" data-meta value="${meta}" aria-label="Meta do dia de ${esc(p.nome)}"></td>
        <td class="num"><strong>${fmtNumero(prod)}</strong></td>
        <td><span class="barra" aria-hidden="true"><span style="width:${Math.max(prod > 0 ? 3 : 0, pct)}%"></span></span><span class="sub">${meta > 0 ? `${pct}% da meta${prod > meta ? ` (passou ${fmtNumero(prod - meta)})` : ''}` : 'sem meta'}</span></td>
        <td class="num">${fmtNumero(vendidoHoje(p.id))}</td>
        <td><button type="button" class="botao botao--pequeno botao--secundario" data-fornada-de="${esc(p.id)}">Registrar fornada</button></td>
      </tr>`;
  }).join('');

  const fornadas = producao.fornadas.slice().reverse().map((f) => {
    const faltou = f.baixas.filter((b) => b.faltou > 0.0005).length;
    return `
      <li class="fornada" data-fornada="${f.id}">
        <strong>${fmtNumero(f.qtd)} × ${esc(f.nome)}</strong>
        <span class="sub">${fmtHora(f.quando)}${f.quem ? ` · ${esc(f.quem)}` : ''} · ${f.baixas.length} insumos baixados${faltou ? ` · <strong>faltou saldo de ${faltou}</strong>` : ''}${f.exemplo ? ' · exemplo' : ''}</span>
        <button type="button" class="botao botao--pequeno botao--secundario" data-desfazer-fornada>Desfazer</button>
      </li>`;
  }).join('');

  const consumo = consumoDoDia();
  const linhasConsumo = consumo.map((c) => `
    <tr><td>${esc(c.insumo.nome)}</td><td class="num">${fmtQtd(c.total, c.insumo.uso)}</td><td class="num">${c.padaria ? fmtQtd(c.padaria, c.insumo.uso) : '—'}</td><td class="num">${c.pizzaria ? fmtQtd(c.pizzaria, c.insumo.uso) : '—'}</td><td class="num">${fmtQtd(c.insumo.estoque.saldo, c.insumo.uso)}</td></tr>`).join('');

  return `
    <section class="cartao cartao--nota"><span class="selo">Hipótese [P]</span>
      <p>A quantidade a produzir por dia já é definida hoje. Aqui ela vira uma <strong>meta</strong>, cada fornada é <strong>registrada</strong> e os insumos <strong>saem do estoque pela ficha técnica</strong> (RF-011). Pergunta para você: quem registraria e em que aparelho, com a mão suja de farinha?</p></section>

    <h2>Meta do dia e o que já saiu do forno</h2>
    <div class="tabela-wrap"><table class="tabela tabela--compacta">
      <thead><tr><th>Produto</th><th class="num">Meta</th><th class="num">Produzido</th><th>Andamento</th><th class="num">Vendido</th><th></th></tr></thead>
      <tbody>${linhas}</tbody></table></div>

    <h2 id="registrar">Registrar uma fornada</h2>
    <form class="cartao" data-form-fornada novalidate>
      <div class="janela__grade">
        <label class="janela__largo"><span class="rotulo-pequeno">Produto</span><select class="campo" name="produto" data-fp>${opcoesProdutos(ui.produto)}</select></label>
        <div><span class="rotulo-pequeno">Quantas unidades saíram do forno</span>
          <span class="janela__par"><input class="campo" type="number" min="1" step="1" inputmode="numeric" name="qtd" data-fq value="${esc(ui.qtd)}">
            <button type="button" class="botao botao--secundario" data-completar-meta>Completar a meta</button></span></div>
        <label><span class="rotulo-pequeno">Quem produziu (opcional)</span><input class="campo" name="quem" data-fquem maxlength="40" autocomplete="off" value="${esc(ui.quem)}"></label>
      </div>
      <div data-previa>${htmlPrevia()}</div>
      <p class="manual__erro" role="alert" data-erro>${esc(ui.erro)}</p>
      <div class="janela__acoes"><button type="submit" class="botao botao--primario botao--grande">Registrar e baixar do estoque</button></div>
    </form>

    ${producao.fornadas.length ? `<h2>Fornadas de hoje</h2><ul class="fornadas">${fornadas}</ul>` : ''}
    ${consumo.length ? `
      <h2>Insumos consumidos hoje, por área</h2>
      <div class="tabela-wrap"><table class="tabela tabela--compacta">
        <thead><tr><th>Insumo</th><th class="num">Total</th><th class="num">Padaria</th><th class="num">Pizzaria</th><th class="num">Saldo agora</th></tr></thead><tbody>${linhasConsumo}</tbody></table></div>
      <p class="sub">Cada produto pertence à padaria ou à pizzaria (RN-005, hipótese): é assim que o consumo se separa por área. O saldo agora é o da tela Estoque.</p>` : ''}`;
}

// ---- Sobras e descarte -------------------------------------------------------------------------------

function htmlSobras() {
  const lista = producao.saidas.slice().reverse().map((s) => `
    <li class="fornada" data-saida="${s.id}">
      <strong>${fmtNumero(s.qtd)} × ${esc(s.nome)}</strong>
      <span class="sub">${esc(DESTINOS[s.destino])} · custo ${fmtMoeda(s.custo)}${s.obs ? ` · ${esc(s.obs)}` : ''}</span>
      <button type="button" class="botao botao--pequeno botao--secundario" data-remover-saida>Remover</button>
    </li>`).join('');
  const totais = Object.keys(DESTINOS).map((d) => {
    const itens = producao.saidas.filter((s) => s.destino === d);
    return { destino: d, qtd: itens.reduce((s, x) => s + x.qtd, 0), custo: itens.reduce((s, x) => s + x.custo, 0) };
  });
  return `
    <section class="cartao cartao--nota"><span class="selo">Hipótese [P]</span>
      <p>O que sobra no fim do dia tem destinos diferentes: <strong>descarte</strong> (perda), <strong>reaproveitamento</strong> (o pão francês vira torrada) ou <strong>doação e consumo da casa</strong>. Registrar o destino mostra quanto dinheiro se perdeu. Pergunta para você: o que acontece de verdade com as sobras de cada produto?</p></section>
    <form class="cartao" data-form-sobra novalidate>
      <div class="janela__grade">
        <label class="janela__largo"><span class="rotulo-pequeno">Produto</span><select class="campo" name="produto" data-sp>${opcoesProdutos(ui.sobraProduto)}</select></label>
        <label><span class="rotulo-pequeno">Quantidade</span><input class="campo" type="number" min="1" step="1" inputmode="numeric" name="qtd" data-sq value="${esc(ui.sobraQtd)}"></label>
        <label><span class="rotulo-pequeno">O que aconteceu</span><select class="campo" name="destino" data-sd>${Object.entries(DESTINOS).map(([k, v]) => `<option value="${k}"${ui.sobraDestino === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
        <label class="janela__largo"><span class="rotulo-pequeno">Observação (opcional)</span><input class="campo" name="obs" data-so maxlength="80" autocomplete="off" value="${esc(ui.sobraObs)}" placeholder="ex.: virou torrada, queimou, caiu no chão"></label>
      </div>
      <p class="manual__erro" role="alert" data-erro>${esc(ui.erro)}</p>
      <div class="janela__acoes"><button type="submit" class="botao botao--primario botao--grande">Registrar</button></div>
    </form>
    <dl class="indicadores">${totais.map((t) => `<div><dt>${esc(DESTINOS[t.destino])}</dt><dd>${fmtNumero(t.qtd)} un · ${fmtMoeda(t.custo)}</dd><dd class="sub">custo dos ingredientes (sem gastos gerais)</dd></div>`).join('')}</dl>
    ${producao.saidas.length ? `<h2>Registradas hoje</h2><ul class="fornadas">${lista}</ul>` : '<p class="vazio">Nenhuma sobra registrada hoje.</p>'}`;
}

// ---- Fim do dia: conciliação --------------------------------------------------------------------------

function celulasDeDivergencia(x) {
  if (x.divergencia === null) return { texto: '<span class="sub">informe a contagem</span>', chip: '' };
  const d = x.divergencia;
  const texto = `<strong>${d > 0 ? '+' : ''}${fmtNumero(d)}</strong>${d !== 0 ? `<span class="sub">${fmtMoeda(Math.abs(x.valor))} ${d < 0 ? 'sem explicação' : 'a mais'}</span>` : ''}`;
  const chip = d === 0 ? '<span class="chip chip--ok">fecha</span>' : x.alerta ? `<span class="chip chip--alerta">${d < 0 ? 'faltou' : 'sobrou a mais'}: passa de ${fmtNumero(producao.toleranciaPct)}%</span>` : '<span class="chip chip--neutro">dentro da tolerância</span>';
  return { texto, chip };
}

function htmlFim() {
  const linhas = conciliar().filter((x) => x.ativo);
  const corpo = linhas.map((x) => {
    const c = celulasDeDivergencia(x);
    return `
      <tr data-conc="${esc(x.produto.id)}" class="${x.alerta ? 'linha-alerta' : ''}">
        <td><strong>${esc(x.produto.nome)}</strong><span class="sub">${esc(AREAS[x.produto.area])}</span></td>
        <td class="num">${fmtNumero(x.produzido)}</td>
        <td class="num">− ${fmtNumero(x.vendido)}</td>
        <td class="num">− ${fmtNumero(x.saidas)}</td>
        <td class="num"><strong data-esperado>${fmtNumero(x.esperado)}</strong></td>
        <td class="num"><input class="campo campo--pequeno campo--numero" type="number" min="0" step="1" inputmode="numeric" data-contagem value="${x.contado ?? ''}" aria-label="Sobra contada de ${esc(x.produto.nome)}"></td>
        <td class="num"><span data-div>${c.texto}</span><span data-chip class="conc__status">${c.chip}</span></td>
      </tr>`;
  }).join('');
  const total = linhas.filter((x) => x.valor !== null && x.valor < 0).reduce((s, x) => s + Math.abs(x.valor), 0);
  const contados = linhas.filter((x) => x.contado !== null).length;
  return `
    <section class="cartao cartao--nota"><span class="selo">Hipótese [P]</span>
      <p><strong>Conciliação do dia (RF-019):</strong> produzido − vendido no Balcão − sobras registradas = <strong>sobra esperada</strong>. Você conta o que sobrou na prateleira e a diferença aparece. Hoje as vendas só são conhecidas pela sobra no fim do dia; aqui o sistema já sabe o que vendeu.</p></section>
    ${linhas.length === 0 ? '<p class="vazio">Ainda não há produção nem vendas hoje. Registre fornadas ou use "Preencher um dia de exemplo".</p>' : `
    <label class="gastos__dias"><span class="rotulo-pequeno">Destacar quando a diferença passar de (% do produzido)</span>
      <input class="campo campo--pequeno campo--numero" type="number" min="0" max="100" step="1" data-tolerancia value="${esc(producao.toleranciaPct)}"></label>
    <div class="tabela-wrap"><table class="tabela tabela--compacta tabela--conc">
      <thead><tr><th>Produto</th><th class="num">Produ&shy;zido</th><th class="num">Vendido</th><th class="num">Sobras anotadas</th><th class="num">Esperada</th><th class="num">Contada</th><th class="num">Diferença</th></tr></thead>
      <tbody>${corpo}</tbody></table></div>
    <p class="sub" data-resumo-conc>${contados === 0 ? 'Nenhuma contagem informada ainda.' : `${contados} de ${linhas.length} produtos contados. Valor do que faltou sem explicação (a preço de custo): <strong>${fmtMoeda(total)}</strong>.`}</p>
    <p class="sub"><strong>Faltou</strong> (diferença negativa): vendido sem registro, consumo da casa, perda não anotada ou contagem errada. <strong>Sobrou a mais</strong>: fornada esquecida, venda registrada a mais ou contagem errada. O piloto não sabe qual; ele só aponta onde olhar.</p>`}`;
}

// ---- Montagem e eventos ----------------------------------------------------------------------------------

export function iniciarProducao(conteudo, parametro = '') {
  const raiz = conteudo.querySelector('[data-producao]');
  const aba = ABAS[parametro] ? parametro : 'hoje';
  ui.erro = '';
  const desenhar = () => {
    raiz.innerHTML = htmlTopo(aba) + (aba === 'hoje' ? htmlProducaoDoDia() : aba === 'sobras' ? htmlSobras() : htmlFim());
  };
  const redesenhar = (foco) => { desenhar(); if (foco) raiz.querySelector(foco)?.focus(); };
  desenhar();

  raiz.addEventListener('click', (e) => {
    const alvo = (s) => e.target.closest(s);
    if (alvo('[data-exemplo-dia]')) { preencherDiaDeExemplo(); ui.aviso = 'Dia de exemplo preenchido (inventado): fornadas, sobras e contagem, com diferenças de propósito. Os insumos já saíram do Estoque.'; return redesenhar(); }
    if (alvo('[data-limpar-dia]')) { limparDia(); ui.aviso = 'Dia limpo: as fornadas foram desfeitas e os insumos voltaram ao Estoque.'; return redesenhar(); }
    const forn = alvo('[data-fornada-de]');
    if (forn) { ui.produto = forn.dataset.fornadaDe; ui.qtd = ''; ui.erro = ''; ui.aviso = ''; desenhar(); raiz.querySelector('[data-fq]').focus(); return raiz.querySelector('#registrar').scrollIntoView({ block: 'start' }); }
    if (alvo('[data-completar-meta]')) {
      if (!ui.produto) { ui.erro = 'Escolha o produto primeiro.'; return redesenhar(); }
      ui.qtd = String(Math.max(0, metaDe(ui.produto) - produzidoHoje(ui.produto)) || ''); ui.erro = ''; return redesenhar('[data-fq]');
    }
    const des = alvo('[data-desfazer-fornada]');
    if (des) { desfazerFornada(Number(des.closest('[data-fornada]').dataset.fornada)); ui.aviso = 'Fornada desfeita: os insumos voltaram ao Estoque.'; return redesenhar(); }
    const rem = alvo('[data-remover-saida]');
    if (rem) { removerSaida(Number(rem.closest('[data-saida]').dataset.saida)); ui.aviso = ''; return redesenhar(); }
  });

  raiz.addEventListener('input', (e) => {
    if (e.target.matches('[data-fq]')) { ui.qtd = e.target.value; raiz.querySelector('[data-previa]').innerHTML = htmlPrevia(); }
    else if (e.target.matches('[data-fquem]')) ui.quem = e.target.value;
    else if (e.target.matches('[data-sq]')) ui.sobraQtd = e.target.value;
    else if (e.target.matches('[data-so]')) ui.sobraObs = e.target.value;
    else if (e.target.matches('[data-meta]')) {
      const tr = e.target.closest('tr');
      definirMeta(tr.dataset.produto, e.target.value);
      const meta = metaDe(tr.dataset.produto); const prod = produzidoHoje(tr.dataset.produto);
      const pct = meta > 0 ? Math.min(100, Math.round((prod / meta) * 100)) : 0;
      tr.querySelector('.barra > span').style.width = `${Math.max(prod > 0 ? 3 : 0, pct)}%`;
      tr.querySelector('.barra + .sub').textContent = meta > 0 ? `${pct}% da meta${prod > meta ? ` (passou ${fmtNumero(prod - meta)})` : ''}` : 'sem meta';
    } else if (e.target.matches('[data-contagem]')) {
      const tr = e.target.closest('tr');
      definirContagem(tr.dataset.conc, e.target.value);
      const x = conciliar().find((y) => y.produto.id === tr.dataset.conc);
      const c = celulasDeDivergencia(x);
      tr.querySelector('[data-div]').innerHTML = c.texto;
      tr.querySelector('[data-chip]').innerHTML = c.chip;
      tr.classList.toggle('linha-alerta', x.alerta);
      const todas = conciliar().filter((y) => y.ativo);
      const contados = todas.filter((y) => y.contado !== null).length;
      const falta = todas.filter((y) => y.valor !== null && y.valor < 0).reduce((s, y) => s + Math.abs(y.valor), 0);
      raiz.querySelector('[data-resumo-conc]').innerHTML = contados === 0 ? 'Nenhuma contagem informada ainda.' : `${contados} de ${todas.length} produtos contados. Valor do que faltou sem explicação (a preço de custo): <strong>${fmtMoeda(falta)}</strong>.`;
    } else if (e.target.matches('[data-tolerancia]')) {
      producao.toleranciaPct = Number(e.target.value) || 0;
      raiz.querySelectorAll('[data-conc]').forEach((tr) => {
        const x = conciliar().find((y) => y.produto.id === tr.dataset.conc);
        const c = celulasDeDivergencia(x);
        tr.querySelector('[data-chip]').innerHTML = c.chip;
        tr.classList.toggle('linha-alerta', x.alerta);
      });
    }
  });

  raiz.addEventListener('change', (e) => {
    if (e.target.matches('[data-fp]')) { ui.produto = e.target.value; raiz.querySelector('[data-previa]').innerHTML = htmlPrevia(); }
    else if (e.target.matches('[data-sp]')) ui.sobraProduto = e.target.value;
    else if (e.target.matches('[data-sd]')) ui.sobraDestino = e.target.value;
  });

  raiz.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      if (e.target.matches('[data-form-fornada]')) {
        const f = registrarFornada({ produtoId: ui.produto, qtd: ui.qtd, quem: ui.quem });
        const faltou = f.baixas.filter((b) => b.faltou > 0.0005).length;
        ui.aviso = `<strong>Fornada registrada:</strong> ${fmtNumero(f.qtd)} × ${esc(f.nome)}. ${f.baixas.length} insumos saíram do Estoque${faltou ? `; <strong>${faltou} não tinham saldo suficiente</strong> (o saldo foi a zero)` : ''}.`;
        ui.qtd = ''; ui.erro = '';
      } else {
        registrarSaida({ produtoId: ui.sobraProduto, qtd: ui.sobraQtd, destino: ui.sobraDestino, obs: ui.sobraObs });
        ui.aviso = '<strong>Sobra registrada.</strong>';
        ui.sobraQtd = ''; ui.sobraObs = ''; ui.erro = '';
      }
      redesenhar();
    } catch (erro) {
      ui.erro = erro.message;
      redesenhar();
    }
  });
}
