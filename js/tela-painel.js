// Tela do Painel da gestora (etapa 16): o que pede atenção, as vendas do dia, padaria × pizzaria, o ranking de consumo,
// o preço dos insumos e as encomendas dos próximos dias. Junta o que os outros módulos já sabem. Nada é gravado.
// A proprietária escolhe quais blocos aparecem: é uma das respostas que o piloto quer ouvir.

import {
  numerosDoDia, rankingDeConsumo, maioresVariacoes, produtosComMargemBaixa, proximosDias, atencaoDeHoje, limites, nomeDoMetodo,
} from './painel.js';
import { comprasPendentes } from './tela-compras.js';
import { fmtMoeda, fmtNumero, fmtQtd, fmtPercentual, esc } from './formato.js';
import { formatar, nomeDoDia } from './encomendas.js';

const BLOCOS = {
  atencao: 'O que pede a sua atenção',
  vendas: 'Vendas de hoje',
  lojas: 'Padaria × pizzaria',
  ranking: 'Ranking de consumo de insumos',
  precos: 'Preço dos insumos que mais variou',
  encomendas: 'Encomendas dos próximos 7 dias',
  margem: 'Produtos com margem baixa',
};
const ui = { ocultos: new Set(), escopo: 'todas', periodo: 'dia' };
const pct = (f) => (f === null || f === undefined ? '—' : fmtPercentual(f).replace(/^\+/, ''));
const ROTULO_ESCOPO = { todas: 'Padaria e pizzaria', padaria: 'Só padaria', pizzaria: 'Só pizzaria' };
const ROTULO_PERIODO = { dia: 'Hoje', mes: 'Mês (estimativa)' };

export function telaPainel() { return '<div data-painel></div>'; }

// ---- Blocos ---------------------------------------------------------------------------------------------

function bloco(id, corpo, ajuda = '') {
  if (ui.ocultos.has(id)) return '';
  return `
    <section class="bloco-painel bloco-painel--${id}" aria-labelledby="b-${id}">
      <header class="bloco-painel__topo"><h2 id="b-${id}">${esc(BLOCOS[id])}</h2>
        <button type="button" class="botao botao--pequeno botao--secundario" data-ocultar="${id}" aria-label="Ocultar o bloco ${esc(BLOCOS[id])}">Ocultar</button></header>
      ${ajuda ? `<p class="sub">${ajuda}</p>` : ''}
      ${corpo}
    </section>`;
}

function htmlAtencao() {
  const itens = atencaoDeHoje({ comprasPendentes: comprasPendentes().length });
  const corpo = itens.length
    ? `<ul class="atencao-lista">${itens.map((a) => `
        <li class="atencao-item atencao-item--${a.nivel}"><div><strong>${esc(a.titulo)}</strong><span class="sub">${esc(a.detalhe)}</span></div>
          <a class="botao botao--pequeno botao--secundario" href="${a.rota}">Abrir</a></li>`).join('')}</ul>`
    : '<p class="conferencia conferencia--ok" role="status">Nada pede a sua atenção agora.</p>';
  return bloco('atencao', corpo);
}

function htmlVendas(n) {
  return bloco('vendas', `
    <dl class="indicadores">
      <div><dt>Vendas</dt><dd>${fmtMoeda(n.vendas)}</dd></div>
      <div><dt>Pedidos</dt><dd>${n.pedidos}</dd></div>
      <div><dt>Ticket médio</dt><dd>${fmtMoeda(n.ticketMedio)}</dd></div>
      <div><dt>Margem de contribuição do dia</dt><dd>${fmtMoeda(n.totais.contribuicao)}</dd><dd class="sub">vendas − custo dos ingredientes − impostos informados</dd></div>
    </dl>`,
  'Vêm do Balcão. Com as vendas de exemplo ligadas (são inventadas), o painel já tem o que mostrar.');
}

function barra(valor, maximo, destaque = false) {
  return `<span class="hbarras__trilho"><span class="hbarras__barra${destaque ? ' hbarras__barra--pico' : ''}" style="width:${maximo > 0 ? Math.max(valor > 0 ? 2 : 0, Math.round((valor / maximo) * 100)) : 0}%"></span></span>`;
}

function htmlLojas(n) {
  const { padaria: p, pizzaria: z } = n.areas;
  const linha = (rotulo, a, b, fmt = fmtMoeda, dica = '') => `<tr><th scope="row">${esc(rotulo)}${dica ? `<span class="sub">${esc(dica)}</span>` : ''}</th><td class="num">${fmt(a)}</td><td class="num">${fmt(b)}</td></tr>`;
  const cobertura = (a) => (a.gastosPorDia > 0 ? Math.round((a.contribuicao / a.gastosPorDia) * 100) : null);
  const bloco2 = (nome, a) => `
    <div class="equilibrio ${a.cobreOsGastos ? 'equilibrio--ok' : 'equilibrio--falta'}">
      <strong>${esc(nome)}</strong>
      <span>Gastos gerais por dia: <strong>${fmtMoeda(a.gastosPorDia)}</strong> (${fmtMoeda(a.gastosMes)} no mês ÷ ${n.dias} dias)</span>
      <span>Margem de contribuição de hoje: <strong>${fmtMoeda(a.contribuicao)}</strong> → cobre <strong>${cobertura(a) === null ? '—' : `${cobertura(a)}%`}</strong> dos gastos do dia</span>
      <span class="cobertura" role="img" aria-label="Cobre ${cobertura(a) ?? 0}% dos gastos do dia"><span class="cobertura__barra${a.cobreOsGastos ? '' : ' cobertura__barra--falta'}" style="width:${Math.min(100, Math.max(0, cobertura(a) ?? 0))}%"></span></span>
      <span class="sub">${a.vendaParaEquilibrio ? `Para pagar os gastos gerais, esta loja precisa vender cerca de <strong>${fmtMoeda(a.vendaParaEquilibrio)}</strong> por dia (com a margem de hoje).` : 'Sem vendas para calcular o equilíbrio.'}</span>
    </div>`;
  return bloco('lojas', `
    <div class="tabela-wrap"><table class="tabela tabela--compacta">
      <thead><tr><th></th><th class="num">Padaria</th><th class="num">Pizzaria</th></tr></thead>
      <tbody>
        ${linha('Vendas de hoje', p.vendas, z.vendas)}
        ${linha('Unidades vendidas', p.itens, z.itens, fmtNumero)}
        ${linha('Custo dos ingredientes', p.custo, z.custo)}
        ${linha('Margem de contribuição', p.contribuicao, z.contribuicao, fmtMoeda, 'o que sobra para pagar os gastos gerais')}
        ${linha('Margem de contribuição (%)', p.contribuicaoPct, z.contribuicaoPct, pct)}
        ${linha('Gastos gerais do mês', p.gastosMes, z.gastosMes, fmtMoeda, 'da tela Gastos gerais (inventados)')}
      </tbody></table></div>
    <div class="equilibrios">${bloco2('Padaria', p)}${bloco2('Pizzaria', z)}</div>
    <p class="sub">Método de rateio escolhido: <strong>${esc(nomeDoMetodo())}</strong>. Hoje os gastos gerais aparecem aqui <strong>por loja</strong>, sem ratear por produto.</p>`,
  'Compara as duas lojas com o mesmo dia de vendas. Cada produto pertence a uma loja (RN-005, hipótese).');
}

function htmlRanking() {
  const r = rankingDeConsumo({ escopo: ui.escopo, periodo: ui.periodo, limite: 10 });
  const max = Math.max(...r.itens.map((i) => i.valor), 0);
  const botoes = (chave, opcoes, atual) => Object.entries(opcoes).map(([k, v]) => `<button type="button" class="filtro" data-${chave}="${k}" aria-pressed="${atual === k}">${esc(v)}</button>`).join('');
  const lista = r.itens.length
    ? `<ul class="hbarras">${r.itens.map((i, k) => `
        <li><span class="hbarras__rotulo"><strong>${k + 1}.</strong> ${esc(i.insumo.nome)}</span>
          ${barra(i.valor, max, k === 0)}
          <span class="hbarras__valor">${fmtMoeda(i.valor)} · ${Math.round(i.parte * 100)}% · ${fmtQtd(i.qtd, i.insumo.uso)}</span></li>`).join('')}</ul>`
    : '<p class="vazio">Sem vendas para calcular. Ligue as vendas de exemplo no Balcão ou receba um pedido.</p>';
  return bloco('ranking', `
    <div class="filtros" role="group" aria-label="Loja">${botoes('escopo', ROTULO_ESCOPO, ui.escopo)}</div>
    <div class="filtros" role="group" aria-label="Período">${botoes('periodo', ROTULO_PERIODO, ui.periodo)}</div>
    ${lista}
    <p class="sub">Total dos ${r.quantos} insumos: <strong>${fmtMoeda(r.total)}</strong>${ui.periodo === 'mes' ? ' (estimativa grosseira: as vendas de hoje × os dias de funcionamento)' : ''}.
      O consumo é <strong>estimado</strong> (o que foi vendido × a ficha técnica, ao último preço pago): não inclui perda, sobra nem o que a cozinha usa fora da ficha.</p>`,
  'Quanto cada insumo pesa. É o que decide em quais compras vale negociar e acompanhar o preço.');
}

function htmlPrecos() {
  const lista = maioresVariacoes(5);
  return bloco('precos', lista.length ? `
    <ul class="variacoes">${lista.map((v) => `
      <li><strong>${esc(v.insumo.nome)}</strong>
        <span class="chip ${v.variacao > 0 ? 'chip--alerta' : 'chip--aviso'}">${v.variacao > 0 ? '▲' : '▼'} ${pct(Math.abs(v.variacao))}</span>
        <span class="sub">${fmtMoeda(v.de)} → ${fmtMoeda(v.para)} por ${esc(v.insumo.compra.rotulo)} · afeta ${v.afetados} ${v.afetados === 1 ? 'produto' : 'produtos'}${v.passouDoLimite ? ' · acima do seu limite de alerta' : ''}</span></li>`).join('')}</ul>`
    : '<p class="vazio">Nenhum insumo variou de preço.</p>',
  'Compara a última compra com a anterior de cada insumo. O limite do alerta é o mesmo da tela Compras.');
}

function htmlEncomendas() {
  const dias = proximosDias(7);
  const faixa = dias.map((d, k) => `
    <a class="faixa-dia${d.total ? ' faixa-dia--tem' : ''}${d.bloqueado ? ' faixa-dia--bloqueado' : ''}" href="#/encomendas" aria-label="${esc(nomeDoDia(d.data))}, ${formatar(d.data)}: ${d.total} encomendas${d.aguardando ? `, ${d.aguardando} aguardando` : ''}">
      <span class="faixa-dia__nome">${k === 0 ? 'hoje' : k === 1 ? 'amanhã' : esc(nomeDoDia(d.data).slice(0, 3))}</span>
      <span class="faixa-dia__data">${formatar(d.data)}</span>
      <strong class="faixa-dia__total">${d.total}</strong>
      ${d.aguardando ? `<span class="cal__espera">${d.aguardando} espera</span>` : '<span class="faixa-dia__vazio"></span>'}
    </a>`).join('');
  return bloco('encomendas', `<div class="faixa-dias">${faixa}</div><p class="sub"><a class="link" href="#/encomendas">Abrir a agenda de encomendas →</a></p>`,
    'Os dias em vermelho têm encomenda; a etiqueta amarela é encomenda esperando a sua resposta.');
}

function htmlMargem() {
  const lista = produtosComMargemBaixa();
  return bloco('margem', `
    <label class="gastos__dias"><span class="rotulo-pequeno">Avisar quando a margem de lucro ficar abaixo de (%)</span>
      <input class="campo campo--pequeno campo--numero" type="number" min="0" max="100" step="1" data-limite-margem value="${limites.margemBaixaPct}"></label>
    ${lista.length ? `<ul class="variacoes">${lista.map((x) => `
      <li><strong>${esc(x.produto.nome)}</strong> <span class="chip chip--alerta">margem de lucro ${pct(x.margemPct)}</span>
        <span class="sub">preço ${fmtMoeda(x.preco)} · margem de contribuição ${pct(x.contribuicaoPct)}${x.incompleto ? ' · custo incompleto' : ''} · <a class="link" href="#/precificacao/${esc(x.produto.id)}">abrir a ficha</a></span></li>`).join('')}</ul>`
    : '<p class="conferencia conferencia--ok" role="status">Nenhum produto à venda está abaixo do limite.</p>'}`,
  `A margem de lucro desconta os gastos gerais pelo método escolhido (<strong>${esc(nomeDoMetodo())}</strong>). Escolha um método em Gastos gerais para ver o efeito.`);
}

// ---- Tela ---------------------------------------------------------------------------------------------------

function desenhar(raiz) {
  const n = numerosDoDia();
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const escondidos = ui.ocultos.size;
  raiz.innerHTML = `
    <div class="painel__topo">
      <p class="sub">Hoje: ${esc(hoje)}. Os números são do dia de exemplo do piloto (inventado).</p>
      <details class="painel__escolher"${escondidos ? ' open' : ''}>
        <summary>Escolher o que aparece (${Object.keys(BLOCOS).length - escondidos} de ${Object.keys(BLOCOS).length})</summary>
        <div class="painel__opcoes">${Object.entries(BLOCOS).map(([k, v]) => `<label class="opcao-resposta"><input type="checkbox" data-mostrar="${k}"${ui.ocultos.has(k) ? '' : ' checked'}> <span>${esc(v)}</span></label>`).join('')}</div>
        <p class="sub">Esta escolha serve para você dizer ao piloto o que quer ver ao abrir o sistema de manhã.</p>
      </details>
    </div>
    <div class="painel">
      ${htmlAtencao()}${htmlVendas(n)}${htmlLojas(n)}${htmlRanking()}${htmlPrecos()}${htmlEncomendas()}${htmlMargem()}
    </div>
    ${escondidos === Object.keys(BLOCOS).length ? '<p class="vazio">Todos os blocos estão ocultos. Use "Escolher o que aparece".</p>' : ''}`;
}

export function iniciarPainel(conteudo) {
  const raiz = conteudo.querySelector('[data-painel]');
  desenhar(raiz);
  raiz.addEventListener('click', (e) => {
    const oc = e.target.closest('[data-ocultar]');
    if (oc) { ui.ocultos.add(oc.dataset.ocultar); return desenhar(raiz); }
    const esc2 = e.target.closest('[data-escopo]');
    if (esc2) { ui.escopo = esc2.dataset.escopo; desenhar(raiz); return raiz.querySelector(`[data-escopo="${ui.escopo}"]`)?.focus(); }
    const per = e.target.closest('[data-periodo]');
    if (per) { ui.periodo = per.dataset.periodo; desenhar(raiz); return raiz.querySelector(`[data-periodo="${ui.periodo}"]`)?.focus(); }
  });
  raiz.addEventListener('change', (e) => {
    if (e.target.matches('[data-mostrar]')) {
      if (e.target.checked) ui.ocultos.delete(e.target.dataset.mostrar); else ui.ocultos.add(e.target.dataset.mostrar);
      desenhar(raiz);
      raiz.querySelector(`[data-mostrar="${e.target.dataset.mostrar}"]`)?.focus();
    } else if (e.target.matches('[data-limite-margem]')) {
      const v = Number(e.target.value);
      if (Number.isFinite(v) && v >= 0) { limites.margemBaixaPct = v; desenhar(raiz); raiz.querySelector('[data-limite-margem]')?.focus(); }
    }
  });
}
