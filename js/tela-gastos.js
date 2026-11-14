// Tela de Gastos gerais (etapa 13): cadastro dos gastos do mês e comparação lado a lado de 3 métodos de rateio.
// O piloto NÃO escolhe o método: mostra a diferença que cada um faz no preço e na margem, para a proprietária e o contador decidirem.
// Todos os valores são inventados. Nada é gravado.

import {
  LOJAS, METODOS, GASTOS, config, novoGasto, removerGasto, totaisPorLoja, produtosDoRateio, volumeDe, definirVolume, mudarDias, ratear,
} from './gastos.js';
import { custoUnitario, indicadores, AREAS } from './produtos.js';
import { fmtMoeda, fmtNumero, fmtPercentual, esc } from './formato.js';

const numero = (t) => { const n = Number(String(t).replace(',', '.')); return String(t).trim() === '' || !Number.isFinite(n) ? 0 : n; };
const pct = (f) => fmtPercentual(f).replace(/^\+/, '');

export function telaGastos() { return '<div data-gastos></div>'; }

// ---- Gastos do mês ------------------------------------------------------------------------------

function htmlLinhaGasto(g) {
  return `
    <li class="gasto" data-gasto="${esc(g.id)}">
      <label class="gasto__nome"><span class="rotulo-pequeno">Gasto</span><input class="campo campo--pequeno" data-g="nome" value="${esc(g.nome)}" maxlength="60" autocomplete="off"></label>
      <label><span class="rotulo-pequeno">Valor por mês (R$)</span><input class="campo campo--pequeno" type="number" min="0" step="0.01" inputmode="decimal" data-g="valor" value="${esc(g.valor)}"></label>
      <label><span class="rotulo-pequeno">Pertence a</span>
        <select class="campo campo--pequeno" data-g="loja">${Object.entries(LOJAS).map(([k, v]) => `<option value="${k}"${g.loja === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="gasto__pct"${g.loja === 'ambas' ? '' : ' hidden'}><span class="rotulo-pequeno">% da padaria</span>
        <input class="campo campo--pequeno" type="number" min="0" max="100" step="1" inputmode="decimal" data-g="pctPadaria" value="${esc(g.pctPadaria)}"></label>
      <button type="button" class="botao botao--pequeno botao--secundario" data-remover-gasto aria-label="Remover ${esc(g.nome)}">×</button>
    </li>`;
}

function htmlTotais() {
  const t = totaisPorLoja();
  return `
    <dl class="indicadores">
      <div><dt>Padaria</dt><dd>${fmtMoeda(t.padaria)}</dd></div>
      <div><dt>Pizzaria</dt><dd>${fmtMoeda(t.pizzaria)}</dd></div>
      <div><dt>Total por mês</dt><dd>${fmtMoeda(t.total)}</dd></div>
    </dl>`;
}

// ---- Quantidade por mês -------------------------------------------------------------------------

function htmlVolumes() {
  const linhas = produtosDoRateio().map((p) => {
    const v = volumeDe(p.id);
    return `
      <tr data-volume-de="${esc(p.id)}">
        <td><strong>${esc(p.nome)}</strong><span class="sub">${esc(AREAS[p.area])}</span></td>
        <td class="num"><input class="campo campo--pequeno campo--numero" type="number" min="0" step="1" inputmode="numeric" data-vol value="${v.qtd}" aria-label="Unidades por mês de ${esc(p.nome)}"></td>
        <td>${v.editado ? '<span class="chip chip--neutro">corrigido por você</span>' : '<span class="chip chip--aviso">do dia de exemplo</span>'}</td>
      </tr>`;
  }).join('');
  return `
    <div class="tabela-wrap"><table class="tabela tabela--compacta">
      <thead><tr><th>Produto</th><th class="num">Unidades por mês</th><th>Origem</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>`;
}

// ---- Comparação dos métodos -----------------------------------------------------------------------

function htmlComparacao() {
  const resultados = Object.fromEntries(Object.keys(METODOS).map((m) => [m, ratear(m)]));
  const produtos = produtosDoRateio().sort((a, b) => a.area.localeCompare(b.area) || a.nome.localeCompare(b.nome, 'pt-BR'));

  const celula = (p, metodo, custo) => {
    const x = resultados[metodo].itens.get(p.id);
    const escolhido = config.metodo === metodo ? ' class="num celula-escolhida"' : ' class="num"';
    if (!x || x.semBase) return `<td${escolhido}><span class="sub">${esc(x?.motivo ?? '—')}</span></td>`;
    const ind = indicadores(p, custo, x.porUnidade);
    return `<td${escolhido}><strong>${fmtMoeda(x.porUnidade)}</strong>${ind ? `<span class="sub">margem de lucro ${pct(ind.lucroPct)}</span>` : '<span class="sub">sem preço</span>'}</td>`;
  };

  const linhas = produtos.map((p) => {
    const custo = custoUnitario(p).total;
    const valores = Object.keys(METODOS).map((m) => resultados[m].itens.get(p.id)).filter((x) => x && !x.semBase).map((x) => x.porUnidade);
    const diferenca = valores.length > 1 ? Math.max(...valores) - Math.min(...valores) : null;
    return `
      <tr>
        <td><strong>${esc(p.nome)}</strong><span class="sub">${esc(AREAS[p.area])} · preço ${Number(p.preco) > 0 ? fmtMoeda(p.preco) : 'não informado'} · custo ${fmtMoeda(custo)}</span></td>
        <td class="num">${fmtNumero(volumeDe(p.id).qtd)}</td>
        ${Object.keys(METODOS).map((m) => celula(p, m, custo)).join('')}
        <td class="num">${diferenca === null ? '—' : `<strong>${fmtMoeda(diferenca)}</strong>`}</td>
      </tr>`;
  }).join('');

  const confere = Object.entries(resultados).map(([m, r]) => {
    const c = r.conferencia;
    return `<li>${esc(METODOS[m].nome)}: ${fmtMoeda(c.rateado)} rateados de ${fmtMoeda(c.total)} ${Math.abs(c.naoDistribuido) < 0.05 ? '<span class="chip chip--ok">fecha</span>' : `<span class="chip chip--alerta">sobram ${fmtMoeda(c.naoDistribuido)} (produto sem preço, custo ou quantidade)</span>`}</li>`;
  }).join('');

  const opcoes = [['nenhum', 'Nenhum por enquanto', 'Os gastos gerais não entram na margem de lucro.'], ...Object.entries(METODOS).map(([k, v]) => [k, v.nome, v.resumo])]
    .map(([k, nome, resumo]) => `
      <label class="opcao-metodo${config.metodo === k ? ' opcao-metodo--ativa' : ''}">
        <input type="radio" name="metodo" value="${k}"${config.metodo === k ? ' checked' : ''}>
        <span><strong>${esc(nome)}</strong><span class="sub">${esc(resumo)}</span>${METODOS[k] ? `<span class="sub">Conta: ${esc(METODOS[k].como)}.</span><span class="sub sub--atencao">${esc(METODOS[k].efeito)}</span>` : ''}</span>
      </label>`).join('');

  return `
    <h3>Qual método mostrar na margem de lucro da Precificação?</h3>
    <div class="opcoes-metodo" role="radiogroup" aria-label="Método de rateio">${opcoes}</div>
    <p class="sub">${config.metodo === 'nenhum' ? 'Nenhum método aplicado: a margem de lucro na Precificação é igual à margem de contribuição.' : `Aplicado na Precificação: <strong>${esc(METODOS[config.metodo].nome)}</strong>. É só para ver; a decisão do método é sua e do contador.`}</p>
    <div class="tabela-wrap"><table class="tabela tabela--compacta tabela--metodos">
      <thead><tr><th>Produto</th><th class="num">Unid./mês</th>${Object.values(METODOS).map((m) => `<th class="num">${esc(m.nome)}<span class="sub">gasto por unidade</span></th>`).join('')}<th class="num">Diferença entre o maior e o menor</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>
    <h3>Conferência da conta</h3>
    <ul class="formas">${confere}</ul>
    <p class="sub">Cada loja rateia só os gastos dela entre os produtos dela. Preparos (massa, molho) não carregam gastos: o que eles custam já está dentro dos produtos que os usam.</p>`;
}

// ---- Montagem e eventos ----------------------------------------------------------------------------

function montar(raiz) {
  raiz.innerHTML = `
    <section class="cartao cartao--nota"><span class="selo">Hipótese [P] · valores inventados</span>
      <p><strong>Os gastos, as quantidades vendidas e a divisão entre as lojas são inventados.</strong> Substitua pelos reais para ver o efeito verdadeiro.
      Não existe um método de rateio único e certo: <strong>o método muda o custo e a margem de cada produto</strong>. A escolha é da proprietária e do contador (RF-022); o piloto só mostra a diferença.</p></section>

    <h2>Gastos do mês</h2>
    <p class="sub">Gastos que não são de um produto só: energia, gás, água, folha, manutenção, financiamentos, combustível. Cada um pertence a uma loja ou às duas.</p>
    <ul class="gastos" data-lista-gastos>${GASTOS.map(htmlLinhaGasto).join('')}</ul>
    <button type="button" class="botao botao--secundario" data-novo-gasto>+ Gasto</button>
    <div data-totais>${htmlTotais()}</div>

    <h2>Quanto cada produto vende por mês</h2>
    <p class="sub">O rateio precisa saber quantas unidades de cada produto saem por mês. Aqui vêm do dia de vendas de exemplo do Balcão multiplicado pelos dias de funcionamento; corrija com os números reais.</p>
    <label class="gastos__dias"><span class="rotulo-pequeno">Dias de funcionamento por mês</span>
      <input class="campo campo--pequeno campo--numero" type="number" min="1" max="31" data-dias value="${config.diasPorMes}"></label>
    <div data-volumes>${htmlVolumes()}</div>

    <h2>Comparação dos métodos de rateio</h2>
    <div data-comparacao>${htmlComparacao()}</div>`;
}

export function iniciarGastos(conteudo) {
  const raiz = conteudo.querySelector('[data-gastos]');
  montar(raiz);
  const atualizarTotaisEComparacao = () => {
    raiz.querySelector('[data-totais]').innerHTML = htmlTotais();
    raiz.querySelector('[data-comparacao]').innerHTML = htmlComparacao();
  };

  raiz.addEventListener('input', (e) => {
    const campo = e.target.dataset.g;
    if (campo) {
      const g = GASTOS.find((x) => x.id === e.target.closest('[data-gasto]').dataset.gasto);
      if (!g) return;
      if (campo === 'nome') g.nome = e.target.value;
      else g[campo] = numero(e.target.value);
      atualizarTotaisEComparacao();
      return;
    }
    if (e.target.matches('[data-vol]')) {
      definirVolume(e.target.closest('[data-volume-de]').dataset.volumeDe, e.target.value);
      // O chip "do dia de exemplo" vira "corrigido por você" sem refazer o campo digitado.
      const chip = e.target.closest('tr').querySelector('.chip');
      chip.className = 'chip chip--neutro';
      chip.textContent = 'corrigido por você';
      raiz.querySelector('[data-comparacao]').innerHTML = htmlComparacao();
      return;
    }
    if (e.target.matches('[data-dias]')) {
      if (e.target.value === '') return;
      mudarDias(e.target.value);
      raiz.querySelector('[data-volumes]').innerHTML = htmlVolumes();
      raiz.querySelector('[data-comparacao]').innerHTML = htmlComparacao();
    }
  });

  raiz.addEventListener('change', (e) => {
    if (e.target.matches('[data-g="loja"]')) {
      const li = e.target.closest('[data-gasto]');
      const g = GASTOS.find((x) => x.id === li.dataset.gasto);
      g.loja = e.target.value;
      li.querySelector('.gasto__pct').hidden = g.loja !== 'ambas';
      atualizarTotaisEComparacao();
    } else if (e.target.matches('[name="metodo"]')) {
      config.metodo = e.target.value;
      raiz.querySelector('[data-comparacao]').innerHTML = htmlComparacao();
      raiz.querySelector('[name="metodo"]:checked')?.focus();
    }
  });

  raiz.addEventListener('click', (e) => {
    if (e.target.closest('[data-novo-gasto]')) {
      const g = novoGasto();
      raiz.querySelector('[data-lista-gastos]').insertAdjacentHTML('beforeend', htmlLinhaGasto(g));
      raiz.querySelector(`[data-gasto="${g.id}"] [data-g="nome"]`).select();
      atualizarTotaisEComparacao();
      return;
    }
    const rem = e.target.closest('[data-remover-gasto]');
    if (rem) {
      const li = rem.closest('[data-gasto]');
      removerGasto(li.dataset.gasto);
      li.remove();
      atualizarTotaisEComparacao();
    }
  });
}
