// Telas da confirmação: o controle do limite de alerta, o botão de confirmar e o resumo da compra confirmada
// (o que entrou no estoque, o preço novo e os alertas de variação com as receitas afetadas).

import { rotuloBase, precoPorBase } from './dados.js';
import { insumoDe } from './revisao.js';
import { config, alertasDaConfirmacao } from './confirmacao.js';
import { formatarEmissao } from './leitor-xml.js';
import { fmtMoeda, fmtNumero, fmtPercentual, fmtQtd, fmtHora, esc } from './formato.js';

const semSinalDeMais = (fracao) => fmtPercentual(fracao).replace(/^\+/, '');

export function htmlConfigAlerta() {
  return `
    <section class="cartao config-alerta" aria-labelledby="titulo-alerta-preco">
      <h2 id="titulo-alerta-preco">Alerta de variação de preço</h2>
      <p>Ao confirmar uma compra, o piloto compara o preço de cada insumo com o da compra anterior e avisa quando variar
        <strong>pelo menos</strong> o percentual abaixo, para cima ou para baixo, mostrando as receitas afetadas.</p>
      <label class="config-alerta__campo">
        <span class="rotulo-pequeno">Avisar quando variar</span>
        <span class="entrada">
          <input class="campo" type="number" min="0" max="1000" step="0.5" value="${config.limitePercentual}" data-limite inputmode="decimal">
          <span>% ou mais</span>
        </span>
      </label>
      <p class="sub" data-limite-nota role="status"></p>
    </section>`;
}

/** Botão de confirmar de uma compra sem nota (a de nota lida tem o seu na própria conferência). */
export function htmlBotaoConfirmar() {
  return `
    <div class="conf__confirmar">
      <button type="button" class="botao botao--primario" data-acao="confirmar-compra">Confirmar compra e atualizar o estoque</button>
      <span class="sub">Nada muda no estoque antes de confirmar.</span>
    </div>`;
}

// ---- Compra confirmada --------------------------------------------------------------

function chipDaVariacao(m, limite) {
  if (m.variacao === null) return '<span class="chip chip--neutro">primeiro preço</span>';
  const passou = Math.abs(m.variacao * 100) >= limite;
  const texto = m.variacao === 0 ? 'sem variação' : fmtPercentual(m.variacao);
  const classe = !passou ? 'chip--neutro' : m.variacao > 0 ? 'chip--alerta' : 'chip--aviso';
  return `<span class="chip ${classe}">${texto}</span>`;
}

function htmlMudanca(m, limite) {
  const insumo = insumoDe(m.insumoId);
  const preco = m.precoAnterior === null
    ? `<strong>${fmtMoeda(m.preco)}</strong> (primeiro preço registrado)`
    : `${fmtMoeda(m.precoAnterior)} → <strong>${fmtMoeda(m.preco)}</strong>`;
  return `
    <li class="mudanca">
      <div class="mudanca__nome">
        <strong>${esc(insumo.nome)}</strong>
        <span class="sub">${esc(insumo.categoria)} › ${esc(insumo.subgrupo)}${m.linhas > 1 ? ` · ${m.linhas} linhas somadas` : ''}</span>
      </div>
      <div>
        <span class="rotulo-pequeno">Estoque</span>
        ${fmtQtd(m.saldoAntes, insumo.uso)} → <strong>${fmtQtd(m.saldoDepois, insumo.uso)}</strong>
        <span class="chip chip--ok">+ ${fmtQtd(m.qtdUso, insumo.uso)}</span>
      </div>
      <div>
        <span class="rotulo-pequeno">Preço por ${esc(insumo.compra.rotulo)}</span>
        ${preco} ${chipDaVariacao(m, limite)}
        <span class="sub">${fmtMoeda(precoPorBase(insumo, m.preco))} por ${rotuloBase(insumo)}${m.ehPrecoAtual ? '' : ' · compra de data antiga: não muda o preço de hoje'}</span>
      </div>
    </li>`;
}

function htmlAlerta(m) {
  const insumo = insumoDe(m.insumoId);
  const subiu = m.variacao > 0;
  const receitas = m.receitas.length
    ? `<ul class="alerta-preco__receitas">${m.receitas.map((rc) => `
        <li>
          <strong>${esc(rc.nome)}</strong> <span class="chip chip--neutro">${rc.area === 'pizzaria' ? 'pizzaria' : 'padaria'}</span><br>
          Custo por unidade: ${fmtMoeda(rc.custoAntes)} → <strong>${fmtMoeda(rc.custoDepois)}</strong>
          (${rc.delta >= 0 ? '+' : '−'}${fmtMoeda(Math.abs(rc.delta))}).
          ${rc.precoVenda === null ? 'Sem preço de venda informado.' : `Sobra sobre o preço de venda de ${fmtMoeda(rc.precoVenda)}: ${fmtMoeda(rc.sobraAntes)} → <strong>${fmtMoeda(rc.sobraDepois)}</strong>.`}
          <a class="link" href="#/precificacao" data-ver-produto="${esc(rc.id)}">Abrir a ficha →</a>
        </li>`).join('')}</ul>`
    : `<p class="sub">${m.ehPrecoAtual ? 'Nenhum produto cadastrado em Precificação usa este insumo.' : 'Compra de data antiga: não muda o preço de hoje, então nenhuma receita foi afetada.'}</p>`;
  return `
    <article class="alerta-preco alerta-preco--${subiu ? 'subiu' : 'caiu'}" data-alerta-de="${esc(m.insumoId)}">
      <strong>${esc(insumo.nome)} ${subiu ? 'subiu' : 'caiu'} ${semSinalDeMais(Math.abs(m.variacao))}</strong>
      <span>${fmtMoeda(m.precoAnterior)} → ${fmtMoeda(m.preco)} por ${esc(insumo.compra.rotulo)}
        (${fmtMoeda(precoPorBase(insumo, m.precoAnterior))} → ${fmtMoeda(precoPorBase(insumo, m.preco))} por ${rotuloBase(insumo)})</span>
      <span class="alerta-preco__titulo">Produtos afetados</span>
      ${receitas}
    </article>`;
}

function htmlItensConfirmados(r) {
  const linhas = r.itens.map((item, i) => {
    const linha = r.revisao.itens[i];
    const insumo = insumoDe(linha.insumoId);
    const destino = linha.status === 'ligado' && insumo
      ? `<span class="chip chip--ok">→ ${esc(insumo.nome)}</span>`
      : '<span class="chip chip--neutro">ignorado</span>';
    return `
      <li class="conf-item conf-item--leitura conf-item--${linha.status === 'ligado' ? 'ligado' : 'ignorado'}">
        <div class="conf-item__nota">
          <span class="conf-item__n">${item.numero}</span>
          <div>
            <strong>${esc(item.descricao || '(sem descrição)')}</strong>
            <span class="conf-item__conta">${fmtNumero(item.quantidade)} ${esc(item.unidade)} × ${fmtMoeda(item.valorUnitario)} = ${fmtMoeda(item.valorProduto)} ${destino}</span>
          </div>
        </div>
      </li>`;
  }).join('');
  return `
    <details class="texto-lido">
      <summary>Ver os ${r.itens.length} ${r.itens.length === 1 ? 'item' : 'itens'} desta compra</summary>
      <ul class="conf__lista conf__lista--dentro">${linhas}</ul>
    </details>`;
}

/** Cartão de uma compra já confirmada: o que mudou no estoque, o preço novo e os alertas. */
export function htmlConfirmada(r) {
  const c = r.confirmacao;
  const limite = config.limitePercentual;
  const alertas = alertasDaConfirmacao(r, limite);
  const subtitulo = r.tipo === 'manual'
    ? `${formatarEmissao(r.data)} · ${r.comprovante === 'recibo' ? 'recibo' : 'sem comprovante'}`
    : [r.rotuloModelo, r.numero ? `Nº ${r.numero}` : '', r.emissao ? formatarEmissao(r.emissao) : ''].filter(Boolean).join(' · ');
  return `
    <header class="resultado__topo">
      <div>
        <span class="selo selo--confirmada">Compra confirmada</span>
        <h2>${esc(r.emitente?.nome ?? 'Compra')}</h2>
        <p class="sub">${esc(subtitulo)}</p>
      </div>
      <button type="button" class="botao botao--secundario" data-remover>Remover da lista</button>
    </header>
    <p class="conferencia conferencia--ok" role="status">
      <strong>Confirmada às ${fmtHora(c.quando)}.</strong> O estoque foi atualizado e os preços entraram no histórico de cada insumo.
      Esta nota agora fica registrada: não dá para lançá-la de novo.
      <a class="link" href="#/estoque">Ver no Estoque →</a>
    </p>
    <ul class="mudancas">${c.mudancas.map((m) => htmlMudanca(m, limite)).join('')}</ul>
    <section class="alertas-preco" aria-label="Alertas de preço">
      <h3>Alertas de preço <span class="sub">(variação de ${fmtNumero(limite)}% ou mais)</span></h3>
      ${alertas.length ? alertas.map(htmlAlerta).join('') : `<p class="alertas-preco__vazio">Nenhum insumo desta compra variou ${fmtNumero(limite)}% ou mais.</p>`}
      <p class="sub">O custo vem das fichas técnicas de Precificação (ingredientes, perdas e sub-receitas), sem gastos gerais nem impostos. Os preços de venda são de exemplo, salvo os que você alterou.</p>
    </section>
    ${htmlItensConfirmados(r)}
    <div class="conf__confirmar conf__confirmar--desfazer">
      <button type="button" class="botao botao--secundario" data-acao="desfazer-confirmacao">Desfazer confirmação</button>
      <span class="sub">Tira a entrada do estoque e o preço do histórico, e libera a nota para ser lançada de novo.</span>
    </div>`;
}
