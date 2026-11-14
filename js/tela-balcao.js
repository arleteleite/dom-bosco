// Tela de Balcão e vendas (etapa 12): três jeitos de olhar o mesmo fluxo (atendente, caixa e relatório).
// É uma SIMULAÇÃO para a proprietária dizer como o balcão funciona hoje e o que precisa mudar. Nada é gravado.

import {
  FORMAS, balcao, catalogo, mudarItem, limparRascunho, enviarParaCaixa, totalDosItens, quantidadeDeItens,
  filaDoCaixa, chamar, calcularPagamento, pagar, cancelar, pendentesDeEnvio, reenviarPendentes,
  vendasParaRelatorio, relatorio, faixasDeHorario,
} from './balcao.js';
import { fmtMoeda, fmtNumero, fmtHora, esc } from './formato.js';

const ABAS = { atendente: 'Atendente', caixa: 'Caixa', vendas: 'Vendas do dia' };
const ui = { selecionado: null, forma: 'dinheiro', recebido: '', aviso: null, senhaEnviada: null, passoHoras: 1 };
const numeroOuNulo = (t) => (String(t).trim() === '' || !Number.isFinite(Number(String(t).replace(',', '.'))) ? null : Number(String(t).replace(',', '.')));
const hh = (h) => `${String(h).padStart(2, '0')}h`;

export function telaBalcao() { return '<div data-balcao></div>'; }

// ---- Partes comuns ------------------------------------------------------------------------------

function htmlTopo(aba) {
  const pend = pendentesDeEnvio().length;
  const filas = filaDoCaixa().length;
  return `
    <nav class="abas" aria-label="Visões do balcão">
      ${Object.entries(ABAS).map(([k, r]) => `<a class="aba" href="#/balcao/${k === 'atendente' ? '' : k}"${aba === k ? ' aria-current="page"' : ''}>${r}${k === 'caixa' && filas ? ` <span class="contador">${filas}</span>` : ''}</a>`).join('')}
      <button type="button" class="botao botao--pequeno ${balcao.offline ? 'botao--primario' : 'botao--secundario'} abas__offline" data-offline aria-pressed="${balcao.offline}">
        ${balcao.offline ? 'Internet voltou' : 'Simular internet fora do ar'}</button>
    </nav>
    ${balcao.offline ? `<p class="conferencia conferencia--alerta" role="status"><strong>Sem internet (simulação).</strong> O balcão continua vendendo; as vendas ficam guardadas no aparelho e são enviadas quando a conexão volta.${pend ? ` <strong>${pend} ${pend === 1 ? 'venda aguarda' : 'vendas aguardam'} envio.</strong>` : ''}</p>`
    : pend ? `<p class="conferencia conferencia--alerta" role="status">${pend} ${pend === 1 ? 'venda ficou' : 'vendas ficaram'} pendente${pend === 1 ? '' : 's'} de envio. <button type="button" class="botao botao--pequeno botao--secundario" data-reenviar>Enviar agora</button></p>` : ''}
    ${ui.aviso ? `<p class="conferencia conferencia--ok" role="status">${ui.aviso}</p>` : ''}`;
}

// ---- Atendente ------------------------------------------------------------------------------------

function htmlAtendente() {
  const { itens, obs } = balcao.rascunho;
  const produtos = catalogo();
  const qtdDe = (id) => itens.find((i) => i.produtoId === id)?.qtd ?? 0;
  const grade = produtos.map((p) => `
    <button type="button" class="prod" data-add="${esc(p.id)}">
      <span class="prod__nome">${esc(p.nome)}</span>
      <span class="prod__preco">${fmtMoeda(p.preco)}</span>
      <span class="chip chip--neutro">${p.area === 'pizzaria' ? 'pizzaria' : 'padaria'}</span>
      ${qtdDe(p.id) ? `<span class="prod__qtd">${qtdDe(p.id)}</span>` : ''}
    </button>`).join('');
  const lista = itens.length
    ? itens.map((i) => `
      <li class="pedido__item">
        <span>${esc(i.nome)}<span class="sub">${fmtMoeda(i.preco)} cada</span></span>
        <span class="pedido__qtd">
          <button type="button" class="botao botao--pequeno botao--secundario" data-menos="${esc(i.produtoId)}" aria-label="Tirar um ${esc(i.nome)}">−</button>
          <strong>${i.qtd}</strong>
          <button type="button" class="botao botao--pequeno botao--secundario" data-mais="${esc(i.produtoId)}" aria-label="Pôr mais um ${esc(i.nome)}">+</button>
        </span>
        <strong>${fmtMoeda(i.qtd * i.preco)}</strong>
      </li>`).join('')
    : '<li class="vazio">Toque nos produtos para montar o pedido.</li>';
  const senha = ui.senhaEnviada
    ? `<div class="senha" role="status"><span class="rotulo-pequeno">Entregue ao cliente</span><strong class="senha__numero">Senha ${ui.senhaEnviada.numero}</strong>
        <span>${fmtMoeda(totalDosItens(ui.senhaEnviada.itens))} · ${quantidadeDeItens(ui.senhaEnviada.itens)} ${quantidadeDeItens(ui.senhaEnviada.itens) === 1 ? 'item' : 'itens'} · foi para a fila do caixa</span></div>`
    : '';
  return `
    <div class="balcao">
      <section aria-label="Produtos"><h2>Produtos <span class="sub">(só entram os que têm preço de venda em Precificação)</span></h2><div class="prods">${grade || '<p class="vazio">Nenhum produto com preço de venda.</p>'}</div></section>
      <aside class="pedido" aria-label="Pedido em montagem">
        <h2>Pedido</h2>
        ${senha}
        <ul class="pedido__lista">${lista}</ul>
        <label><span class="rotulo-pequeno">Observação</span><input class="campo" data-obs value="${esc(obs)}" maxlength="120" placeholder="ex.: sem cebola, cortar em 8" autocomplete="off"></label>
        <div class="pedido__total"><span>Total (preço à vista)</span><strong>${fmtMoeda(totalDosItens(itens))}</strong></div>
        <div class="janela__acoes">
          <button type="button" class="botao botao--secundario" data-limpar${itens.length ? '' : ' disabled'}>Limpar</button>
          <button type="button" class="botao botao--primario botao--grande" data-enviar${itens.length ? '' : ' disabled'}>Enviar para o caixa</button>
        </div>
        <p class="sub">O atendente só monta o pedido. Quem recebe o dinheiro é o caixa, que recebe o pedido na ordem de chegada.</p>
      </aside>
    </div>`;
}

// ---- Caixa ----------------------------------------------------------------------------------------

function minutosDesde(data) { return Math.max(0, Math.round((Date.now() - data.getTime()) / 60000)); }

function htmlFila() {
  const fila = filaDoCaixa();
  if (fila.length === 0) return '<p class="vazio">Nenhum pedido esperando. Monte um na aba Atendente.</p>';
  return `<ul class="fila">${fila.map((p) => `
    <li class="fila__item${ui.selecionado === p.numero ? ' fila__item--ativo' : ''}" data-pedido="${p.numero}">
      <strong class="fila__senha">${p.numero}</strong>
      <div><span>${p.itens.map((i) => `${i.qtd}× ${esc(i.nome)}`).join(', ')}</span>
        ${p.obs ? `<span class="sub">Obs.: ${esc(p.obs)}</span>` : ''}
        <span class="sub">esperando há ${minutosDesde(p.criadoEm)} min${p.chamadoEm ? ` · chamado às ${fmtHora(p.chamadoEm)}` : ''}</span></div>
      <strong>${fmtMoeda(totalDosItens(p.itens))}</strong>
      <div class="fila__acoes">
        <button type="button" class="botao botao--pequeno botao--secundario" data-chamar>${p.chamadoEm ? 'Chamar de novo' : 'Chamar'}</button>
        <button type="button" class="botao botao--pequeno botao--primario" data-receber>Receber</button>
      </div>
    </li>`).join('')}</ul>`;
}

function htmlResumoPagamento(pedido) {
  const c = calcularPagamento(pedido, ui.forma, numeroOuNulo(ui.recebido));
  const cartao = ui.forma === 'debito' || ui.forma === 'credito';
  return `
    <dl class="totais">
      <div class="totais__linha"><dt>Preço à vista</dt><dd>${fmtMoeda(c.base)}</dd></div>
      ${cartao && !c.erro ? `<div class="totais__linha"><dt>Acréscimo do cartão (${fmtNumero(balcao.taxas[ui.forma])}%)</dt><dd>${fmtMoeda(c.acrescimo)}</dd></div>` : ''}
      <div class="totais__linha totais__linha--forte"><dt>Cobrar</dt><dd>${fmtMoeda(c.total)}</dd></div>
      ${ui.forma === 'dinheiro' && c.troco !== null ? `<div class="totais__linha"><dt>Troco</dt><dd><strong>${fmtMoeda(c.troco)}</strong></dd></div>` : ''}
    </dl>
    ${c.erro ? `<p class="manual__erro" role="alert">${esc(c.erro)}</p>` : ''}`;
}

function htmlPagamento() {
  const pedido = balcao.pedidos.find((p) => p.numero === ui.selecionado && p.status === 'aguardando');
  if (!pedido) return '<aside class="pagamento"><h2>Pagamento</h2><p class="vazio">Escolha "Receber" em um pedido da fila.</p></aside>';
  const cartao = ui.forma === 'debito' || ui.forma === 'credito';
  return `
    <aside class="pagamento" data-pagamento="${pedido.numero}" aria-label="Pagamento do pedido ${pedido.numero}">
      <h2>Pedido ${pedido.numero}</h2>
      <ul class="pedido__lista">${pedido.itens.map((i) => `<li class="pedido__item"><span>${i.qtd}× ${esc(i.nome)}</span><span></span><strong>${fmtMoeda(i.qtd * i.preco)}</strong></li>`).join('')}</ul>
      <fieldset class="painel-nota__resposta"><legend class="rotulo-pequeno">Forma de pagamento</legend>
        ${Object.entries(FORMAS).map(([k, r]) => `<label class="opcao-resposta"><input type="radio" name="forma" value="${k}"${ui.forma === k ? ' checked' : ''}> <span>${esc(r)}</span></label>`).join('')}
      </fieldset>
      ${ui.forma === 'dinheiro' ? `<label><span class="rotulo-pequeno">Valor recebido (R$)</span><input class="campo" type="number" min="0" step="0.01" inputmode="decimal" data-recebido value="${esc(ui.recebido)}"></label>` : ''}
      ${cartao ? `<label><span class="rotulo-pequeno">Taxa da maquininha no ${ui.forma === 'debito' ? 'débito' : 'crédito'} (%)</span>
        <input class="campo" type="number" min="0" max="50" step="any" inputmode="decimal" data-taxa="${ui.forma}" value="${balcao.taxas[ui.forma] ?? ''}" placeholder="ex.: 3,5">
        <span class="sub">Informe a real. O preço-base é o à vista: o acréscimo só aparece aqui, no fechamento (RN-001). Fórmula [P]: à vista ÷ (1 − taxa).</span></label>` : ''}
      <div data-resumo-pagamento>${htmlResumoPagamento(pedido)}</div>
      <div class="janela__acoes">
        <button type="button" class="botao botao--secundario" data-cancelar-pedido>Cancelar pedido</button>
        <button type="button" class="botao botao--primario botao--grande" data-confirmar-pagamento>Confirmar pagamento</button>
      </div>
    </aside>`;
}

function htmlCaixa() {
  return `<div class="balcao balcao--caixa"><section aria-label="Fila do caixa"><h2>Fila <span class="sub">(na ordem de chegada)</span></h2>${htmlFila()}</section>${htmlPagamento()}</div>`;
}

// ---- Vendas do dia ------------------------------------------------------------------------------

function htmlBarras(linhas, maximo, rotuloValor) {
  return `<ul class="hbarras">${linhas.map((l) => `
    <li><span class="hbarras__rotulo">${esc(l.rotulo)}</span>
      <span class="hbarras__trilho"><span class="hbarras__barra${l.destaque ? ' hbarras__barra--pico' : ''}" style="width:${maximo > 0 ? Math.max(l.valor > 0 ? 2 : 0, Math.round((l.valor / maximo) * 100)) : 0}%"></span></span>
      <span class="hbarras__valor">${rotuloValor(l)}</span></li>`).join('')}</ul>`;
}

function htmlVendas() {
  const r = relatorio(vendasParaRelatorio());
  const faixas = faixasDeHorario(r.porHora, ui.passoHoras);
  const picoValor = Math.max(...faixas.map((f) => f.pedidos), 0);
  const maxProduto = Math.max(...r.porProduto.map((p) => p.valor), 0);
  return `
    <section class="cartao cartao--nota"><span class="selo">Hipótese [P]</span>
      <p>Relatório de vendas <strong>por produto e por faixa de horário</strong> (RF-018). A proposta é atualizá-lo <strong>3 vezes ao dia</strong>, em horários a definir; aqui ele é atualizado na hora, só para você ver a informação.</p></section>
    <label class="opcao-resposta opcao-resposta--solta"><input type="checkbox" data-exemplo${balcao.incluirExemplo ? ' checked' : ''}> <span>Incluir um dia de vendas de exemplo (inventadas, ${vendasParaRelatorio().filter((v) => v.exemplo).length || 110} pedidos)</span></label>
    <dl class="indicadores">
      <div><dt>Vendas</dt><dd>${fmtMoeda(r.total)}</dd></div>
      <div><dt>Pedidos</dt><dd>${r.pedidos}</dd></div>
      <div><dt>Ticket médio</dt><dd>${fmtMoeda(r.ticketMedio)}</dd></div>
    </dl>
    ${r.pedidos === 0 ? '<p class="vazio">Ainda não há vendas. Receba um pedido no Caixa ou inclua as vendas de exemplo.</p>' : `
    <h2>Por faixa de horário
      <select class="campo campo--pequeno campo--inline" data-passo aria-label="Tamanho da faixa">
        ${[1, 2, 3].map((n) => `<option value="${n}"${ui.passoHoras === n ? ' selected' : ''}>faixas de ${n} hora${n > 1 ? 's' : ''}</option>`).join('')}</select></h2>
    ${htmlBarras(faixas.map((f) => ({ rotulo: `${hh(f.de)}–${hh(f.ate)}`, valor: f.pedidos, pedidos: f.pedidos, dinheiro: f.valor, destaque: f.pedidos === picoValor && picoValor > 0 })), picoValor, (l) => `${l.pedidos} pedidos · ${fmtMoeda(l.dinheiro)}`)}
    <p class="sub">Em vermelho escuro, a faixa mais movimentada.</p>
    <h2>Por produto</h2>
    ${htmlBarras(r.porProduto.map((p) => ({ rotulo: p.nome, valor: p.valor, qtd: p.qtd })), maxProduto, (l) => `${fmtNumero(l.qtd)} un · ${fmtMoeda(l.valor)}`)}
    <h2>Por forma de pagamento</h2>
    <ul class="formas">${r.porForma.map((f) => `<li><strong>${esc(FORMAS[f.forma])}</strong> ${f.pedidos} pedidos · ${fmtMoeda(f.valor)} <span class="sub">${Math.round((f.valor / r.total) * 100)}%</span></li>`).join('')}</ul>`}`;
}

// ---- Montagem e eventos ----------------------------------------------------------------------------

export function iniciarBalcao(conteudo, parametro = '') {
  const raiz = conteudo.querySelector('[data-balcao]');
  const aba = ABAS[parametro] ? parametro : 'atendente';
  if (aba !== 'atendente') ui.senhaEnviada = null;

  const desenhar = () => {
    const corpo = aba === 'atendente' ? htmlAtendente() : aba === 'caixa' ? htmlCaixa() : htmlVendas();
    raiz.innerHTML = htmlTopo(aba) + corpo;
  };
  const aviso = (texto) => { ui.aviso = texto; };
  ui.aviso = null;
  desenhar();

  const redesenhar = (foco) => { desenhar(); if (foco) raiz.querySelector(foco)?.focus(); };

  raiz.addEventListener('click', (e) => {
    const alvo = (s) => e.target.closest(s);
    if (alvo('[data-offline]')) {
      balcao.offline = !balcao.offline;
      if (!balcao.offline) { const n = reenviarPendentes(); aviso(n ? `A internet voltou: ${n} ${n === 1 ? 'venda enviada' : 'vendas enviadas'}.` : 'A internet voltou.'); } else ui.aviso = null;
      return redesenhar();
    }
    if (alvo('[data-reenviar]')) { const n = reenviarPendentes(); aviso(`${n} ${n === 1 ? 'venda enviada' : 'vendas enviadas'}.`); return redesenhar(); }

    // Atendente
    const add = alvo('[data-add]');
    if (add) { mudarItem(add.dataset.add, 1); ui.senhaEnviada = null; ui.aviso = null; return redesenhar(`[data-add="${add.dataset.add}"]`); }
    const mais = alvo('[data-mais]');
    if (mais) { mudarItem(mais.dataset.mais, 1); return redesenhar(`[data-mais="${mais.dataset.mais}"]`); }
    const menos = alvo('[data-menos]');
    if (menos) { mudarItem(menos.dataset.menos, -1); return redesenhar(balcao.rascunho.itens.length ? `[data-menos="${menos.dataset.menos}"]` : ''); }
    if (alvo('[data-limpar]')) { limparRascunho(); return redesenhar(); }
    if (alvo('[data-enviar]')) {
      try {
        ui.senhaEnviada = enviarParaCaixa();
        ui.aviso = null;
      } catch (erro) { aviso(erro.message); }
      return redesenhar();
    }

    // Caixa
    const linha = alvo('[data-pedido]');
    const numero = linha ? Number(linha.dataset.pedido) : null;
    if (alvo('[data-chamar]')) { chamar(balcao.pedidos.find((p) => p.numero === numero)); aviso(`Senha ${numero} chamada.`); return redesenhar(); }
    if (alvo('[data-receber]')) { ui.selecionado = numero; ui.recebido = ''; ui.aviso = null; return redesenhar('[data-recebido]'); }
    if (alvo('[data-cancelar-pedido]')) {
      cancelar(balcao.pedidos.find((p) => p.numero === ui.selecionado));
      aviso(`Pedido ${ui.selecionado} cancelado.`); ui.selecionado = null;
      return redesenhar();
    }
    if (alvo('[data-confirmar-pagamento]')) {
      const pedido = balcao.pedidos.find((p) => p.numero === ui.selecionado);
      try {
        pagar(pedido, ui.forma, numeroOuNulo(ui.recebido));
        const p = pedido.pagamento;
        aviso(`<strong>Venda registrada:</strong> senha ${pedido.numero}, ${esc(FORMAS[p.forma])}, ${fmtMoeda(p.total)}${p.troco ? `, troco ${fmtMoeda(p.troco)}` : ''}.${p.pendenteEnvio ? ' <strong>Sem internet: guardada para enviar depois.</strong>' : ''}`);
        ui.selecionado = null; ui.recebido = '';
        return redesenhar();
      } catch (erro) {
        const area = raiz.querySelector('[data-resumo-pagamento]');
        if (area) area.insertAdjacentHTML('beforeend', `<p class="manual__erro" role="alert">${esc(erro.message)}</p>`);
      }
    }
  });

  raiz.addEventListener('input', (e) => {
    if (e.target.matches('[data-obs]')) { balcao.rascunho.obs = e.target.value; return; }
    const pedido = balcao.pedidos.find((p) => p.numero === ui.selecionado);
    if (e.target.matches('[data-recebido]')) ui.recebido = e.target.value;
    else if (e.target.matches('[data-taxa]')) balcao.taxas[e.target.dataset.taxa] = numeroOuNulo(e.target.value);
    else return;
    const area = raiz.querySelector('[data-resumo-pagamento]');
    if (pedido && area) area.innerHTML = htmlResumoPagamento(pedido); // só os totais: o campo digitado não é refeito
  });

  raiz.addEventListener('change', (e) => {
    if (e.target.matches('[name="forma"]')) { ui.forma = e.target.value; return redesenhar(`[name="forma"]:checked`); }
    if (e.target.matches('[data-exemplo]')) { balcao.incluirExemplo = e.target.checked; return redesenhar('[data-exemplo]'); }
    if (e.target.matches('[data-passo]')) { ui.passoHoras = Number(e.target.value); return redesenhar('[data-passo]'); }
  });
}
