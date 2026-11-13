// Tela TEMPORÁRIA da etapa 2: mostra os dados fictícios em tabelas,
// para a proprietária (ou você) conferir se fazem sentido.
// Sai do piloto quando a tela de Estoque (etapa 3) assumir a lista de insumos.

import {
  FORNECEDORES, INSUMOS, RECEITAS, ORIGENS,
  precoPorBase, rotuloBase, ultimaCompra, variacaoUltima, situacao,
} from './dados.js';
import { fmtMoeda, fmtPercentual, fmtQtd, fmtValidade, esc } from './formato.js';

const porId = Object.fromEntries(INSUMOS.map((i) => [i.id, i]));
const fornecedorPorId = Object.fromEntries(FORNECEDORES.map((f) => [f.id, f]));

function cabecalho(colunas) {
  return `<tr>${colunas.map(([texto, num]) => `<th${num ? ' class="num"' : ''}>${esc(texto)}</th>`).join('')}</tr>`;
}

function tabelaFornecedores() {
  const linhas = FORNECEDORES.map((f) => `
    <tr>
      <td><strong>${esc(f.nome)}</strong></td>
      <td>${esc(f.tipo)}</td>
      <td>${esc(f.comprovante)}</td>
    </tr>`).join('');
  return `
    <div class="tabela-wrap"><table class="tabela">
      <thead>${cabecalho([['Fornecedor'], ['Tipo'], ['Comprovante que costuma dar']])}</thead>
      <tbody>${linhas}</tbody>
    </table></div>`;
}

function chipsSituacao(insumo) {
  const s = situacao(insumo);
  const chips = [];
  if (s.abaixoDoMinimo) chips.push('<span class="chip chip--alerta">abaixo do mínimo</span>');
  if (s.venceEmBreve) chips.push('<span class="chip chip--aviso">vence em breve</span>');
  return chips.join(' ');
}

function tabelaInsumos() {
  const linhas = INSUMOS.map((i) => {
    const ultima = ultimaCompra(i);
    const variacao = variacaoUltima(i);
    const destaque = Math.abs(variacao) >= 0.1 ? ' class="destaque"' : '';
    return `
    <tr>
      <td><strong>${esc(i.nome)}</strong><span class="sub">${esc(i.categoria)} › ${esc(i.subgrupo)}</span></td>
      <td>${esc(i.compra.rotulo)}<span class="sub">controlado em ${esc(i.uso)}</span></td>
      <td class="num">${fmtMoeda(ultima.preco)}<span class="sub">${fmtMoeda(precoPorBase(i, ultima.preco))}/${rotuloBase(i)}</span></td>
      <td class="num"><span${destaque}>${fmtPercentual(variacao)}</span><span class="sub">${esc(ORIGENS[ultima.origem])}</span></td>
      <td class="num">${fmtQtd(i.estoque.saldo, i.uso)}<span class="sub">mín. ${fmtQtd(i.estoque.minimo, i.uso)}</span></td>
      <td class="nowrap">${esc(fmtValidade(i.estoque.validadeEmDias))}</td>
      <td>${chipsSituacao(i)}</td>
    </tr>`;
  }).join('');

  return `
    <div class="tabela-wrap"><table class="tabela">
      <thead>${cabecalho([
        ['Insumo'], ['Como é comprado'], ['Última compra', true], ['Variação', true],
        ['Em estoque', true], ['Validade'], ['Situação'],
      ])}</thead>
      <tbody>${linhas}</tbody>
    </table></div>`;
}

function cartaoReceita(r) {
  let total = 0;
  const linhas = r.ingredientes.map((ing) => {
    const insumo = porId[ing.insumoId];
    const custo = (ing.qtd * ultimaCompra(insumo).preco) / insumo.compra.qtdUso;
    total += custo;
    return `
      <tr>
        <td>${esc(insumo.nome)}</td>
        <td class="num">${fmtQtd(ing.qtd, insumo.uso)}</td>
        <td class="num">${fmtMoeda(custo)}</td>
      </tr>`;
  }).join('');

  return `
    <article class="cartao cartao--receita">
      <span class="selo">${r.area === 'pizzaria' ? 'Pizzaria' : 'Padaria'}</span>
      <h3>${esc(r.nome)}</h3>
      <div class="tabela-wrap"><table class="tabela tabela--compacta">
        <thead>${cabecalho([['Ingrediente'], ['Quantidade', true], ['Custo', true]])}</thead>
        <tbody>${linhas}</tbody>
        <tfoot>
          <tr><td colspan="2">Custo dos ingredientes</td><td class="num">${fmtMoeda(total)}</td></tr>
          <tr><td colspan="2">Preço de venda (inventado)</td><td class="num">${fmtMoeda(r.precoPraticado)}</td></tr>
        </tfoot>
      </table></div>
    </article>`;
}

export function telaDados() {
  return `
    <section class="cartao cartao--nota">
      <span class="selo">Etapa 2 · conferência dos dados de exemplo</span>
      <p>
        <strong>Tudo aqui é inventado.</strong>
        Os nomes dos insumos e o jeito de comprar (saco, fardo, caixa, pacote) vêm da lista do UNIQ.
        Os preços, as quantidades por embalagem, os estoques, as validades, os fornecedores
        e as receitas foram criados só para o piloto. Corrija o que não fizer sentido.
      </p>
    </section>

    <section class="bloco">
      <h2>Fornecedores</h2>
      ${tabelaFornecedores()}
    </section>

    <section class="bloco">
      <h2>Insumos <span class="etiqueta-numero">${INSUMOS.length}</span></h2>
      <p class="bloco__nota">
        "Variação" compara a última compra com a anterior. Variações de 10% ou mais ficam em destaque.
      </p>
      ${tabelaInsumos()}
    </section>

    <section class="bloco">
      <h2>Receitas de exemplo <span class="etiqueta-numero">${RECEITAS.length}</span></h2>
      <p class="bloco__nota">Servem para mostrar quais produtos são afetados quando um insumo muda de preço (etapa 7).</p>
      <div class="grade-receitas">${RECEITAS.map(cartaoReceita).join('')}</div>
    </section>`;
}
