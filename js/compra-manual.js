// Compra sem nota (frutaria, mercado pequeno, recibo ou nada): lançamento rápido em poucos campos.
// A regra do projeto (RNF-001) é que isto seja mais rápido que o papel: por isso a tela mede o tempo.

import { fornecedoresAtivos, insumosAgrupados } from './dados.js';
import { htmlEntrada, insumoDe } from './revisao.js';
import { formatarEmissao } from './leitor-xml.js';
import { fmtMoeda, fmtNumero, esc } from './formato.js';

const arredondar = (v, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas;
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ROTULO_COMPROVANTE = { nenhum: 'Sem comprovante', recibo: 'Recibo' };

// Lido a cada uso (não uma vez só): fornecedor cadastrado ou inativado depois aparece/some na hora.
const fornecedoresExternos = () => fornecedoresAtivos().filter((f) => f.id !== 'casa');
const LIMITE_RECIBO = 5 * 1024 * 1024;

// ---- Formulário --------------------------------------------------------------------

function htmlLinhaDoFormulario() {
  return `
    <div class="manual-linha" data-linha-manual>
      <label class="manual-linha__insumo">
        <span class="rotulo-pequeno">Insumo</span>
        <select class="campo" name="insumo" data-m="insumo">
          <option value="">Escolha o insumo…</option>
          ${insumosAgrupados().map((g) => `<optgroup label="${esc(g.rotulo)}">${g.itens.map((i) => `<option value="${esc(i.id)}">${esc(i.nome)}</option>`).join('')}</optgroup>`).join('')}
        </select>
        <span class="sub" data-m-classe></span>
      </label>
      <label>
        <span class="rotulo-pequeno">Quantidade <span data-m-unidade class="manual-linha__unidade"></span></span>
        <input class="campo" type="number" name="qtd" inputmode="decimal" min="0" step="any" data-m="qtd" placeholder="0">
      </label>
      <label>
        <span class="rotulo-pequeno">Valor total (R$)</span>
        <input class="campo" type="number" name="valor" inputmode="decimal" min="0" step="0.01" data-m="valor" placeholder="0,00">
      </label>
      <span class="sub manual-linha__dica" data-m-dica></span>
      <button type="button" class="botao botao--pequeno botao--secundario" data-acao-manual="remover">Remover</button>
    </div>`;
}

export function htmlFormularioManual() {
  return `
    <section class="cartao manual" data-manual aria-labelledby="titulo-manual">
      <h2 id="titulo-manual">Compra sem nota</h2>
      <p>Frutaria, mercado pequeno, recibo ou nenhum comprovante. Lance o que comprou: escolha o insumo, a quantidade e o valor.</p>
      <form data-form-manual novalidate>
        <div class="manual__cabecalho">
          <label>
            <span class="rotulo-pequeno">Fornecedor</span>
            <select class="campo" name="fornecedor">
              ${fornecedoresExternos().map((f) => `<option value="${esc(f.id)}"${f.id === 'frutaria' ? ' selected' : ''}>${esc(f.nome)} · ${esc(f.tipo)}</option>`).join('')}
            </select>
          </label>
          <fieldset class="manual__comprovante">
            <legend class="rotulo-pequeno">Comprovante</legend>
            <label><input type="radio" name="comprovante" value="nenhum" checked> Sem comprovante</label>
            <label><input type="radio" name="comprovante" value="recibo"> Recibo</label>
          </fieldset>
          <label>
            <span class="rotulo-pequeno">Data</span>
            <input class="campo" type="date" name="data" value="${hojeISO()}">
          </label>
        </div>
        <div class="manual__recibo" data-recibo hidden>
          <p class="manual__recibo-titulo">Dados do recibo</p>
          <div class="manual__recibo-campos">
            <label>
              <span class="rotulo-pequeno">Nome do estabelecimento</span>
              <input class="campo" type="text" name="estabelecimento" maxlength="80" autocomplete="off" data-estab>
            </label>
            <label>
              <span class="rotulo-pequeno">Número do recibo</span>
              <input class="campo" type="text" name="numeroRecibo" maxlength="30" autocomplete="off" data-numero-recibo>
            </label>
          </div>
          <div class="manual__arquivo">
            <span class="rotulo-pequeno">Ou envie o recibo (foto ou PDF)</span>
            <div class="manual__arquivo-linha">
              <label class="botao botao--secundario botao--pequeno">
                Escolher arquivo
                <input class="envio__campo" type="file" name="arquivoRecibo" accept="image/*,application/pdf" data-arquivo-recibo>
              </label>
              <span class="sub" data-arquivo-nome>Nenhum arquivo escolhido.</span>
              <button type="button" class="botao botao--pequeno botao--secundario" data-acao-manual="tirar-recibo" hidden>Remover arquivo</button>
            </div>
          </div>
          <p class="sub">Informe o número do recibo <strong>ou</strong> envie o arquivo: pelo menos um dos dois.</p>
        </div>
        <div data-linhas-manual>${htmlLinhaDoFormulario()}</div>
        <p class="manual__erro" role="alert" data-erro-manual></p>
        <p class="sub manual__nota">Depois de registrar, <strong>confirme a compra</strong> para o estoque ser atualizado.</p>
        <div class="manual__acoes">
          <button type="button" class="botao botao--secundario" data-acao-manual="adicionar">+ Adicionar item</button>
          <span class="manual__enviar">
            <button type="button" class="botao botao--secundario" data-acao-manual="forcar" hidden>Registrar mesmo assim</button>
            <button type="submit" class="botao botao--primario">Registrar compra</button>
          </span>
        </div>
      </form>
    </section>`;
}

function atualizarLinha(linha) {
  const insumo = insumoDe(linha.querySelector('[data-m="insumo"]').value);
  const qtd = Number(linha.querySelector('[data-m="qtd"]').value);
  const valor = Number(linha.querySelector('[data-m="valor"]').value);
  linha.querySelector('[data-m-unidade]').textContent = insumo ? `(em "${insumo.compra.rotulo}")` : '';
  linha.querySelector('[data-m-classe]').textContent = insumo ? `Classificado em ${insumo.categoria} › ${insumo.subgrupo}` : '';
  linha.querySelector('[data-m-dica]').textContent = insumo && qtd > 0 && valor > 0 ? `= ${fmtMoeda(valor / qtd)} por ${insumo.compra.rotulo}` : '';
}

const linhaVazia = (linha) => ['insumo', 'qtd', 'valor'].every((c) => linha.querySelector(`[data-m="${c}"]`).value === '');

/** Depois de cadastrar insumo ou fornecedor, atualiza as listas do formulário sem apagar o que foi digitado. */
export function recarregarOpcoesManual(raiz) {
  raiz.querySelectorAll('select[data-m="insumo"]').forEach((sel) => {
    const atual = sel.value;
    sel.innerHTML = `<option value="">Escolha o insumo…</option>${insumosAgrupados().map((g) => `<optgroup label="${esc(g.rotulo)}">${g.itens.map((i) => `<option value="${esc(i.id)}">${esc(i.nome)}</option>`).join('')}</optgroup>`).join('')}`;
    sel.value = atual;
  });
  const forn = raiz.querySelector('select[name="fornecedor"]');
  if (forn) {
    const atual = forn.value;
    forn.innerHTML = fornecedoresExternos().map((f) => `<option value="${esc(f.id)}">${esc(f.nome)} · ${esc(f.tipo)}</option>`).join('');
    forn.value = fornecedoresExternos().some((f) => f.id === atual) ? atual : forn.options[0]?.value ?? '';
  }
}

export function ligarFormularioManual(raiz, aoRegistrar) {
  const form = raiz.querySelector('[data-form-manual]');
  const area = form.querySelector('[data-linhas-manual]');
  const erro = form.querySelector('[data-erro-manual]');
  let inicio = null;
  let forcarProximo = false; // "Registrar mesmo assim": a pessoa disse que é outra compra, igual à anterior
  const botaoForcar = form.querySelector('[data-acao-manual="forcar"]');
  const desfazerForcar = () => { forcarProximo = false; botaoForcar.hidden = true; };
  let arquivoRecibo = null; // { nome, tipo, url }
  let estabEditado = false; // se a pessoa já mexeu no nome, o piloto para de preencher sozinho
  const blocoRecibo = form.querySelector('[data-recibo]');
  const campoEstab = form.querySelector('[data-estab]');
  const campoNumero = form.querySelector('[data-numero-recibo]');
  const campoArquivo = form.querySelector('[data-arquivo-recibo]');
  const nomeArquivo = form.querySelector('[data-arquivo-nome]');
  const botaoTirar = form.querySelector('[data-acao-manual="tirar-recibo"]');
  const fornecedorAtual = () => fornecedoresExternos().find((f) => f.id === form.elements.fornecedor.value);

  const limparArquivo = () => {
    if (arquivoRecibo) URL.revokeObjectURL(arquivoRecibo.url);
    arquivoRecibo = null;
    campoArquivo.value = '';
    nomeArquivo.textContent = 'Nenhum arquivo escolhido.';
    botaoTirar.hidden = true;
  };
  const limparRecibo = () => {
    limparArquivo();
    campoNumero.value = '';
    estabEditado = false;
    campoEstab.value = '';
  };
  const mostrarRecibo = () => {
    const comRecibo = form.elements.comprovante.value === 'recibo';
    blocoRecibo.hidden = !comRecibo;
    if (comRecibo && !campoEstab.value) campoEstab.value = fornecedorAtual()?.nome ?? '';
    if (!comRecibo) limparRecibo();
  };

  const iniciarRelogio = () => { inicio ??= performance.now(); };
  const novaLinha = () => { area.insertAdjacentHTML('beforeend', htmlLinhaDoFormulario()); return area.lastElementChild; };

  form.addEventListener('focusin', iniciarRelogio);
  form.addEventListener('input', (e) => {
    iniciarRelogio();
    erro.textContent = '';
    desfazerForcar(); // mudou algo: já não é a mesma compra
    if (e.target === campoEstab) estabEditado = campoEstab.value !== '';
    const l = e.target.closest('[data-linha-manual]');
    if (l) atualizarLinha(l);
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'comprovante') mostrarRecibo();
    if (e.target.name === 'fornecedor' && !blocoRecibo.hidden && !estabEditado) campoEstab.value = fornecedorAtual()?.nome ?? '';
    if (e.target === campoArquivo) {
      const arquivo = campoArquivo.files[0];
      if (!arquivo) return;
      const valido = arquivo.type.startsWith('image/') || arquivo.type === 'application/pdf';
      if (!valido || arquivo.size > LIMITE_RECIBO) {
        erro.textContent = !valido ? 'O recibo precisa ser uma foto (JPG, PNG) ou um PDF.' : 'O arquivo do recibo é maior que 5 MB.';
        limparArquivo();
        return;
      }
      erro.textContent = '';
      if (arquivoRecibo) URL.revokeObjectURL(arquivoRecibo.url);
      arquivoRecibo = { nome: arquivo.name, tipo: arquivo.type, url: URL.createObjectURL(arquivo) };
      nomeArquivo.textContent = arquivo.name;
      botaoTirar.hidden = false;
    }
    const l = e.target.closest('[data-linha-manual]');
    if (l) atualizarLinha(l);
  });

  form.addEventListener('click', (e) => {
    const botao = e.target.closest('[data-acao-manual]');
    if (!botao) return;
    if (botao.dataset.acaoManual === 'adicionar') { novaLinha().querySelector('select').focus(); return; }
    if (botao.dataset.acaoManual === 'tirar-recibo') { limparArquivo(); return; }
    if (botao.dataset.acaoManual === 'forcar') { forcarProximo = true; form.requestSubmit(); return; }
    const linha = botao.closest('[data-linha-manual]');
    if (area.children.length > 1) linha.remove();
    else { linha.querySelectorAll('select, input').forEach((c) => { c.value = ''; }); atualizarLinha(linha); }
  });

  // Enter no valor da última linha completa abre a próxima: dá para lançar vários itens só no teclado.
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('[data-m="valor"]')) return;
    e.preventDefault();
    const linha = e.target.closest('[data-linha-manual]');
    if (linha === area.lastElementChild && !linhaVazia(linha)) novaLinha().querySelector('select').focus();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const linhas = [...area.children].filter((l) => !linhaVazia(l));
    if (linhas.length === 0) { erro.textContent = 'Lance pelo menos um item.'; area.querySelector('select')?.focus(); return; }

    const itens = [];
    for (const [k, linha] of linhas.entries()) {
      const insumo = insumoDe(linha.querySelector('[data-m="insumo"]').value);
      const qtd = Number(linha.querySelector('[data-m="qtd"]').value);
      const valor = Number(linha.querySelector('[data-m="valor"]').value);
      const faltando = !insumo ? 'o insumo' : !(qtd > 0) ? 'a quantidade' : !(valor > 0) ? 'o valor' : null;
      if (faltando) {
        erro.textContent = `Item ${k + 1}: informe ${faltando}.`;
        linha.querySelector(!insumo ? '[data-m="insumo"]' : !(qtd > 0) ? '[data-m="qtd"]' : '[data-m="valor"]').focus();
        return;
      }
      itens.push({ insumo, qtd, valor });
    }

    const dados = new FormData(form);
    const fornecedor = fornecedoresExternos().find((f) => f.id === dados.get('fornecedor'));

    let recibo = null;
    if (dados.get('comprovante') === 'recibo') {
      const estabelecimento = campoEstab.value.trim();
      const numero = campoNumero.value.trim();
      if (!estabelecimento) { erro.textContent = 'Informe o nome do estabelecimento do recibo.'; campoEstab.focus(); return; }
      if (!numero && !arquivoRecibo) { erro.textContent = 'Informe o número do recibo ou envie o arquivo do recibo.'; campoNumero.focus(); return; }
      recibo = { estabelecimento, numero, arquivo: arquivoRecibo };
    }
    const segundos = Math.max(1, Math.round((performance.now() - (inicio ?? performance.now())) / 1000));

    const compra = {
      tipo: 'manual',
      arquivo: 'Lançamento manual',
      emitente: { nome: fornecedor.nome },
      fornecedorId: fornecedor.id,
      comprovante: dados.get('comprovante'),
      recibo,
      data: dados.get('data') || hojeISO(),
      segundos,
      itens: itens.map(({ insumo, qtd, valor }, k) => ({
        numero: k + 1, descricao: insumo.nome, quantidade: qtd, unidade: insumo.compra.rotulo,
        valorUnitario: arredondar(valor / qtd), valorProduto: valor, desconto: 0,
      })),
      revisao: {
        itens: itens.map(({ insumo, qtd, valor }) => ({
          insumoId: insumo.id, status: 'ligado', qtdUso: qtd * insumo.compra.qtdUso, valor, qtdEditada: false, valorEditado: false,
        })),
      },
    };

    // Compra idêntica a uma que já está na lista: não registra de novo, a menos que a pessoa confirme.
    if (aoRegistrar(compra, forcarProximo)) {
      erro.textContent = 'Já existe uma compra igual na lista (mesmo fornecedor, data e itens). Se for outra compra idêntica, use "Registrar mesmo assim".';
      botaoForcar.hidden = false;
      botaoForcar.focus();
      return;
    }
    desfazerForcar();

    // Pronto para o próximo lançamento: limpa os itens e os dados do recibo; mantém fornecedor, comprovante e data.
    // O arquivo do recibo agora pertence ao cartão registrado, por isso a URL dele não é revogada aqui.
    arquivoRecibo = null;
    campoArquivo.value = '';
    nomeArquivo.textContent = 'Nenhum arquivo escolhido.';
    botaoTirar.hidden = true;
    campoNumero.value = '';
    estabEditado = false;
    campoEstab.value = blocoRecibo.hidden ? '' : (fornecedorAtual()?.nome ?? '');
    area.innerHTML = htmlLinhaDoFormulario();
    erro.textContent = '';
    inicio = null;
    area.querySelector('select').focus();
  });
}

// ---- Resultado -----------------------------------------------------------------------

function htmlRecibo(r) {
  if (!r.recibo) return '';
  const { estabelecimento, numero, arquivo } = r.recibo;
  const anexo = arquivo
    ? `<div><dt>Recibo enviado</dt><dd><a class="link" href="${esc(arquivo.url)}" target="_blank" rel="noopener">${esc(arquivo.nome)}</a></dd></div>`
    : '';
  const miniatura = arquivo && arquivo.tipo.startsWith('image/')
    ? `<a href="${esc(arquivo.url)}" target="_blank" rel="noopener" class="recibo-miniatura"><img src="${esc(arquivo.url)}" alt="Recibo enviado: ${esc(arquivo.nome)}"></a>`
    : '';
  return `
    <div class="recibo-dados">
      <dl class="dados-nota">
        <div><dt>Estabelecimento</dt><dd>${esc(estabelecimento)}</dd></div>
        <div><dt>Número do recibo</dt><dd>${numero ? esc(numero) : '—'}</dd></div>
        ${anexo}
      </dl>
      ${miniatura}
    </div>`;
}

export function htmlCompraManual(r) {
  const total = r.itens.reduce((s, i) => s + i.valorProduto, 0);
  const linhas = r.itens.map((i, k) => {
    const insumo = insumoDe(r.revisao.itens[k].insumoId);
    return `
      <li class="conf-item conf-item--ligado conf-item--leitura">
        <div class="conf-item__nota">
          <span class="conf-item__n">${i.numero}</span>
          <div>
            <strong>${esc(insumo.nome)}</strong>
            <span class="conf-item__conta">${fmtNumero(i.quantidade)} × ${esc(i.unidade)} · ${fmtMoeda(i.valorUnitario)} cada = ${fmtMoeda(i.valorProduto)}</span>
          </div>
        </div>
      </li>`;
  }).join('');

  return `
    <header class="resultado__topo">
      <div>
        <span class="selo">Compra sem nota</span>
        <span class="selo selo--experimental">${esc(ROTULO_COMPROVANTE[r.comprovante])}</span>
        <span class="selo selo--aguardando">Aguardando confirmação</span>
        <h2>${esc(r.emitente.nome)}</h2>
        <p class="sub">${esc(formatarEmissao(r.data))} · registrada em <strong>${r.segundos} s</strong></p>
      </div>
      <button type="button" class="botao botao--secundario" data-remover>Remover</button>
    </header>
    <div class="aguardando" role="status">
      <p><strong>O estoque ainda não foi atualizado com esta compra.</strong> Confira os itens e confirme.</p>
      <button type="button" class="botao botao--primario" data-acao="confirmar-compra">Confirmar compra e atualizar o estoque</button>
    </div>
    ${htmlRecibo(r)}
    <p class="conferencia conferencia--alerta" role="note"><strong>Sem nota fiscal.</strong> O preço desta compra entra no histórico como dado de menor confiança (origem: ${esc(ROTULO_COMPROVANTE[r.comprovante].toLowerCase())}).</p>
    <ul class="conf__lista">${linhas}</ul>
    <div class="conf__rodape">
      <div><h3>O que vai entrar no estoque</h3>${htmlEntrada(r)}</div>
      <div><dl class="totais"><div class="totais__linha totais__linha--forte"><dt>Total da compra</dt><dd>${fmtMoeda(total)}</dd></div></dl></div>
    </div>`;
}
