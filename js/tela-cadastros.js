// Telas de Insumos e Fornecedores (cadastro manual) e os formulários que também são abertos
// pela conferência da nota ("Cadastrar como novo insumo", "Cadastrar fornecedor").
// Tudo fica só na memória do navegador, como o resto do piloto.

import { INSUMOS, FORNECEDORES, buscarFornecedor, fornecedoresAtivos } from './dados.js';
import {
  UNIDADES_DE_EMBALAGEM, NOME_DO_CONTROLE, TIPOS_DE_FORNECEDOR, COMPROVANTES,
  validarInsumo, cadastrarInsumo, atualizarInsumo, podeTrocarControle, insumosParecidos,
  validarFornecedor, cadastrarFornecedor, atualizarFornecedor,
} from './cadastro.js';
import { formatarCnpjCpf } from './leitor-xml.js';
import { fmtQtd, esc } from './formato.js';

const porNome = (a, b) => a.localeCompare(b, 'pt-BR');
const normalizar = (t) => String(t).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

// ---- Janela de formulário ----------------------------------------------------------------

/** Abre uma janela com o formulário. `ligar(form, janela)` liga os eventos; devolve a janela. */
export function abrirJanela(titulo, corpo, ligar) {
  const janela = document.createElement('dialog');
  janela.className = 'janela';
  janela.setAttribute('aria-labelledby', 'janela-titulo');
  janela.innerHTML = `
    <form class="janela__form" novalidate>
      <header class="janela__topo">
        <h2 id="janela-titulo">${esc(titulo)}</h2>
        <button type="button" class="aviso-flutuante__fechar" data-fechar aria-label="Fechar">×</button>
      </header>
      ${corpo}
    </form>`;
  document.body.append(janela);
  const form = janela.querySelector('form');
  janela.addEventListener('close', () => janela.remove());
  janela.querySelector('[data-fechar]').addEventListener('click', () => janela.close());
  janela.querySelector('[data-cancelar]')?.addEventListener('click', () => janela.close());
  ligar(form, janela);
  janela.showModal();
  form.querySelector('input:not([type=hidden]), select')?.focus();
  return janela;
}

const opcao = (valor, rotulo, atual) => `<option value="${esc(valor)}"${valor === atual ? ' selected' : ''}>${esc(rotulo)}</option>`;

// ---- Formulário de insumo ----------------------------------------------------------------

function categoriasExistentes() {
  return [...new Set(INSUMOS.map((i) => i.categoria))].sort(porNome);
}
const subgruposDaCategoria = (cat) => [...new Set(INSUMOS.filter((i) => normalizar(i.categoria) === normalizar(cat)).map((i) => i.subgrupo))].sort(porNome);

function htmlUnidades(uso, atual) {
  return UNIDADES_DE_EMBALAGEM[uso].map((u) => opcao(u.id, u.rotulo, atual)).join('');
}

function htmlFormInsumo(v, { editando, aviso, bloqueiaControle }) {
  return `
    ${aviso ? `<p class="conferencia conferencia--alerta" role="note">${esc(aviso)}</p>` : ''}
    <div class="janela__grade">
      <label class="janela__largo"><span class="rotulo-pequeno">Nome do insumo *</span>
        <input class="campo" name="nome" value="${esc(v.nome)}" maxlength="80" autocomplete="off"></label>
      <label><span class="rotulo-pequeno">Categoria *</span>
        <input class="campo" name="categoria" value="${esc(v.categoria)}" list="lista-categorias" maxlength="60" autocomplete="off" placeholder="ex.: Farinhas e amidos">
        <datalist id="lista-categorias">${categoriasExistentes().map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <label><span class="rotulo-pequeno">Subgrupo</span>
        <input class="campo" name="subgrupo" value="${esc(v.subgrupo)}" list="lista-subgrupos" maxlength="60" autocomplete="off" placeholder="ex.: Polvilhos">
        <datalist id="lista-subgrupos">${subgruposDaCategoria(v.categoria).map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <label><span class="rotulo-pequeno">Controlar o estoque em *</span>
        <select class="campo" name="uso"${bloqueiaControle ? ' disabled' : ''}>${Object.entries(NOME_DO_CONTROLE).map(([k, r]) => opcao(k, r, v.uso)).join('')}</select>
        ${bloqueiaControle ? '<span class="sub">Não dá para trocar: este insumo já tem saldo ou compra.</span>' : ''}</label>
      <div><span class="rotulo-pequeno">Cada embalagem comprada tem *</span>
        <span class="janela__par">
          <input class="campo" name="qtdEmb" type="number" inputmode="decimal" min="0" step="any" value="${esc(v.qtdEmb)}" aria-label="Quantidade por embalagem">
          <select class="campo" name="unidadeEmb" aria-label="Unidade da embalagem">${htmlUnidades(v.uso, v.unidadeEmb)}</select>
        </span></div>
      <label class="janela__largo"><span class="rotulo-pequeno">Nome da embalagem</span>
        <input class="campo" name="rotuloEmb" value="${esc(v.rotuloEmb)}" maxlength="40" autocomplete="off" placeholder="ex.: Saco 25 kg">
        <span class="sub">Aparece na compra e no histórico de preços.</span></label>
      <label class="janela__largo"><span class="rotulo-pequeno">Fornecedor principal</span>
        <select class="campo" name="fornecedorId"><option value="">— nenhum —</option>${fornecedoresAtivos().map((f) => opcao(f.id, f.nome, v.fornecedorId)).join('')}</select></label>
      <label class="janela__largo"><span class="rotulo-pequeno">Outros nomes (apelidos)</span>
        <input class="campo" name="apelidos" value="${esc((v.apelidos ?? []).join(', '))}" autocomplete="off" placeholder="separe por vírgula">
        <span class="sub">Como o insumo aparece nas notas. Ajuda a ligar as próximas compras sozinho.</span></label>
      <label class="janela__largo"><span class="rotulo-pequeno">Códigos de barras</span>
        <input class="campo" name="eans" value="${esc((v.eans ?? []).join(', '))}" inputmode="numeric" autocomplete="off" placeholder="separe por vírgula">
        <span class="sub">Se a nota traz o código, o insumo é reconhecido com confiança alta.</span></label>
    </div>
    <p class="manual__erro" role="alert" data-erro></p>
    <div class="janela__acoes">
      <button type="button" class="botao botao--secundario" data-cancelar>Cancelar</button>
      <button type="submit" class="botao botao--primario" data-salvar>${editando ? 'Salvar alterações' : 'Cadastrar insumo'}</button>
    </div>
    ${editando ? '' : '<p class="sub">Estoque inicial 0 e sem preço: o histórico começa na primeira compra confirmada. O estoque mínimo e a validade podem ser definidos depois.</p>'}`;
}

/**
 * Abre o formulário de insumo.
 * @param {{ inicial?: object, insumo?: object, aviso?: string, aoSalvar?: (insumo: object) => void }} opcoes
 *   `insumo` = editar um existente; `inicial` = preenchimento sugerido (ex.: vindo da nota).
 */
export function abrirFormInsumo({ inicial = {}, insumo = null, aviso = '', aoSalvar = () => {} } = {}) {
  const valores = insumo
    ? {
      nome: insumo.nome, categoria: insumo.categoria, subgrupo: insumo.subgrupo, uso: insumo.uso,
      ...(() => {
        const dim = UNIDADES_DE_EMBALAGEM[insumo.uso];
        const un = [...dim].sort((a, b) => b.fator - a.fator).find((u) => insumo.compra.qtdUso >= u.fator) ?? dim[dim.length - 1];
        return { qtdEmb: Math.round((insumo.compra.qtdUso / un.fator) * 1000) / 1000, unidadeEmb: un.id };
      })(),
      rotuloEmb: insumo.compra.rotulo, fornecedorId: insumo.fornecedorPrincipal ?? '', apelidos: insumo.apelidos, eans: insumo.eans,
    }
    : { nome: '', categoria: '', subgrupo: '', uso: 'g', qtdEmb: '', unidadeEmb: 'kg', rotuloEmb: '', fornecedorId: '', apelidos: [], eans: [], ...inicial };
  const bloqueiaControle = Boolean(insumo) && !podeTrocarControle(insumo);

  return abrirJanela(insumo ? `Editar insumo` : 'Cadastrar novo insumo', htmlFormInsumo(valores, { editando: Boolean(insumo), aviso, bloqueiaControle }), (form, janela) => {
    const erro = form.querySelector('[data-erro]');
    const botao = form.querySelector('[data-salvar]');
    let rotuloMexido = Boolean(valores.rotuloEmb);
    let confirmouParecido = false;
    const campo = (n) => form.elements[n];

    const desfazerConfirmacao = () => { confirmouParecido = false; botao.textContent = insumo ? 'Salvar alterações' : 'Cadastrar insumo'; };

    form.addEventListener('input', (e) => {
      erro.textContent = '';
      if (e.target === campo('rotuloEmb')) rotuloMexido = true;
      if (e.target === campo('nome')) desfazerConfirmacao();
      if (e.target === campo('categoria')) form.querySelector('#lista-subgrupos').innerHTML = subgruposDaCategoria(campo('categoria').value).map((c) => `<option value="${esc(c)}">`).join('');
    });
    form.addEventListener('change', (e) => {
      if (e.target === campo('uso')) {
        campo('unidadeEmb').innerHTML = htmlUnidades(campo('uso').value, UNIDADES_DE_EMBALAGEM[campo('uso').value][0].id);
      }
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const usoAtual = campo('uso').disabled ? insumo.uso : campo('uso').value;
      const lido = {
        nome: campo('nome').value, categoria: campo('categoria').value, subgrupo: campo('subgrupo').value, uso: usoAtual,
        qtdEmb: campo('qtdEmb').value, unidadeEmb: campo('unidadeEmb').value, rotuloEmb: campo('rotuloEmb').value,
        fornecedorId: campo('fornecedorId').value, apelidos: campo('apelidos').value, eans: campo('eans').value,
      };
      const r = validarInsumo(lido, { ignorarId: insumo?.id ?? null });
      if (r.erro) { erro.textContent = r.erro; campo(r.campo)?.focus(); return; }

      // Parecido com um insumo que já existe: avisa uma vez antes de duplicar o cadastro.
      const parecidos = insumosParecidos(r.dados.nome, insumo?.id ?? null);
      if (parecidos.length && !confirmouParecido) {
        erro.textContent = `Já existe algo parecido: ${parecidos.slice(0, 3).map((p) => `"${p.insumo.nome}"`).join(', ')}. Se for o mesmo produto, cancele e use o que já existe. Se for outro, clique de novo para cadastrar.`;
        confirmouParecido = true;
        botao.textContent = 'Cadastrar mesmo assim';
        return;
      }

      const salvo = insumo ? atualizarInsumo(insumo, r.dados) : cadastrarInsumo(r.dados);
      janela.close();
      aoSalvar(salvo);
    });
  });
}

// ---- Formulário de fornecedor ------------------------------------------------------------

function htmlFormFornecedor(v, { editando, aviso }) {
  return `
    ${aviso ? `<p class="conferencia conferencia--alerta" role="note">${esc(aviso)}</p>` : ''}
    <div class="janela__grade">
      <label class="janela__largo"><span class="rotulo-pequeno">Nome do fornecedor *</span>
        <input class="campo" name="nome" value="${esc(v.nome)}" maxlength="80" autocomplete="off"></label>
      <label><span class="rotulo-pequeno">CNPJ ou CPF</span>
        <input class="campo" name="documento" value="${esc(v.documento ? formatarCnpjCpf(v.documento) : '')}" inputmode="numeric" maxlength="18" autocomplete="off">
        <span class="sub">Com o CNPJ, as próximas notas deste fornecedor são reconhecidas sozinhas.</span></label>
      <label><span class="rotulo-pequeno">Tipo</span>
        <select class="campo" name="tipo"><option value="">— não informado —</option>${TIPOS_DE_FORNECEDOR.map((t) => opcao(t, t, v.tipo)).join('')}</select></label>
      <label><span class="rotulo-pequeno">Como entrega o comprovante</span>
        <select class="campo" name="comprovante">${COMPROVANTES.map((t) => opcao(t, t, v.comprovante)).join('')}</select></label>
      <label><span class="rotulo-pequeno">Telefone</span>
        <input class="campo" name="telefone" value="${esc(v.telefone)}" type="tel" maxlength="30" autocomplete="off"></label>
      <label><span class="rotulo-pequeno">Contato (pessoa)</span>
        <input class="campo" name="contato" value="${esc(v.contato)}" maxlength="60" autocomplete="off"></label>
      <label><span class="rotulo-pequeno">Prazo e dia de entrega</span>
        <input class="campo" name="prazo" value="${esc(v.prazo)}" maxlength="80" autocomplete="off" placeholder="ex.: entrega às terças e sextas"></label>
    </div>
    <p class="manual__erro" role="alert" data-erro></p>
    <div class="janela__acoes">
      <button type="button" class="botao botao--secundario" data-cancelar>Cancelar</button>
      <button type="submit" class="botao botao--primario">${editando ? 'Salvar alterações' : 'Cadastrar fornecedor'}</button>
    </div>`;
}

/** Abre o formulário de fornecedor (novo, sugerido pela nota, ou edição de um existente). */
export function abrirFormFornecedor({ inicial = {}, fornecedor = null, aviso = '', aoSalvar = () => {} } = {}) {
  const valores = fornecedor ?? { nome: '', documento: '', tipo: '', comprovante: 'Sem comprovante', telefone: '', contato: '', prazo: '', ...inicial };
  return abrirJanela(fornecedor ? 'Editar fornecedor' : 'Cadastrar novo fornecedor', htmlFormFornecedor(valores, { editando: Boolean(fornecedor), aviso }), (form, janela) => {
    const erro = form.querySelector('[data-erro]');
    form.addEventListener('input', () => { erro.textContent = ''; });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const lido = Object.fromEntries(['nome', 'documento', 'tipo', 'comprovante', 'telefone', 'contato', 'prazo'].map((n) => [n, form.elements[n].value]));
      const r = validarFornecedor(lido, { ignorarId: fornecedor?.id ?? null });
      if (r.erro) { erro.textContent = r.erro; form.elements[r.campo]?.focus(); return; }
      const salvo = fornecedor ? atualizarFornecedor(fornecedor, r.dados) : cadastrarFornecedor(r.dados);
      janela.close();
      aoSalvar(salvo);
    });
  });
}

// ---- Tela de Insumos ----------------------------------------------------------------------

const estadoInsumos = { busca: '', situacao: 'ativos', aviso: '' };
const estadoFornecedores = { busca: '', situacao: 'ativos', aviso: '' };

const passaSituacao = (item, situacao) => situacao === 'todos' || (situacao === 'ativos') === (item.ativo !== false);

function htmlFiltrosSituacao(estado, ativos, inativos) {
  const botao = (chave, rotulo, n) => `<button type="button" class="filtro" data-situacao="${chave}" aria-pressed="${estado.situacao === chave}">${rotulo}<span class="filtro__n">${n}</span></button>`;
  return botao('ativos', 'Ativos', ativos) + botao('inativos', 'Inativos', inativos) + botao('todos', 'Todos', ativos + inativos);
}

export function telaInsumos() {
  return `
    <div data-cadastro="insumos">
      <div class="ferramentas">
        <div class="busca">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
          <input class="campo" type="search" data-busca placeholder="Buscar insumo" aria-label="Buscar insumo" value="${esc(estadoInsumos.busca)}" autocomplete="off">
        </div>
        <button type="button" class="botao botao--primario" data-novo>+ Novo insumo</button>
      </div>
      <div class="filtros" data-filtros role="group" aria-label="Filtrar por situação"></div>
      <div class="aviso-contagem" data-aviso role="status" aria-live="polite"></div>
      <ul class="lista-estoque" data-lista></ul>
      <p class="rodape-nota">Cadastros feitos aqui valem só até recarregar a página. Para cadastrar a partir de uma nota, envie a nota em <a class="link" href="#/compras">Compras</a> e use "Cadastrar como novo insumo" no item sem vínculo.</p>
    </div>`;
}

function htmlItemInsumo(i) {
  const forn = buscarFornecedor(i.fornecedorPrincipal);
  const ativo = i.ativo !== false;
  const chips = [
    ativo ? '' : '<span class="chip chip--neutro">inativo</span>',
    i.novo && i.historico.length === 0 ? '<span class="chip chip--aviso">novo, sem compra</span>' : '',
  ].filter(Boolean).join(' ');
  return `
    <li class="item item--cadastro${ativo ? '' : ' item--inativo'}" data-id="${esc(i.id)}">
      <div class="item__nome">
        <strong>${esc(i.nome)}</strong> ${chips}
        <span class="sub">${esc(i.categoria)} › ${esc(i.subgrupo)}</span>
        <span class="sub">Embalagem: ${esc(i.compra.rotulo)} · controle em ${i.uso === 'g' ? 'kg/g' : i.uso === 'ml' ? 'L/mL' : 'unidades'}${forn ? ` · fornecedor: ${esc(forn.nome)}` : ''}</span>
        ${i.eans.length ? `<span class="sub">Código de barras: ${i.eans.map(esc).join(', ')}</span>` : ''}
      </div>
      <div class="item__saldo"><span class="item__qtd">${fmtQtd(i.estoque.saldo, i.uso)}<small>em estoque</small></span></div>
      <div class="item__acao item__acao--dupla">
        <button type="button" class="botao botao--secundario botao--pequeno" data-editar>Editar</button>
        <button type="button" class="botao botao--secundario botao--pequeno" data-alternar>${ativo ? 'Inativar' : 'Reativar'}</button>
      </div>
    </li>`;
}

function desenharInsumos(raiz) {
  const e = estadoInsumos;
  const termo = normalizar(e.busca.trim());
  const achados = INSUMOS.filter((i) => !termo || [i.nome, i.categoria, i.subgrupo, ...i.apelidos].some((a) => normalizar(a).includes(termo)));
  const ativos = achados.filter((i) => i.ativo !== false).length;
  raiz.querySelector('[data-filtros]').innerHTML = htmlFiltrosSituacao(e, ativos, achados.length - ativos);
  const lista = achados.filter((i) => passaSituacao(i, e.situacao))
    .sort((a, b) => porNome(a.categoria, b.categoria) || porNome(a.subgrupo, b.subgrupo) || porNome(a.nome, b.nome));
  raiz.querySelector('[data-lista]').innerHTML = lista.length ? lista.map(htmlItemInsumo).join('') : '<li class="vazio">Nenhum insumo encontrado.</li>';
  raiz.querySelector('[data-aviso]').textContent = e.aviso;
}

export function iniciarInsumos(conteudo) {
  const raiz = conteudo.querySelector('[data-cadastro="insumos"]');
  const e = estadoInsumos;
  e.aviso = '';
  raiz.addEventListener('input', (ev) => { if (ev.target.matches('[data-busca]')) { e.busca = ev.target.value; e.aviso = ''; desenharInsumos(raiz); } });
  raiz.addEventListener('click', (ev) => {
    const situacao = ev.target.closest('[data-situacao]');
    if (situacao) { e.situacao = situacao.dataset.situacao; e.aviso = ''; desenharInsumos(raiz); return; }
    if (ev.target.closest('[data-novo]')) {
      abrirFormInsumo({ aoSalvar: (novo) => { e.aviso = `"${novo.nome}" cadastrado. Ele já aparece nas compras e no Estoque.`; e.situacao = 'ativos'; desenharInsumos(raiz); } });
      return;
    }
    const li = ev.target.closest('[data-id]');
    const insumo = li && INSUMOS.find((i) => i.id === li.dataset.id);
    if (!insumo) return;
    if (ev.target.closest('[data-editar]')) {
      abrirFormInsumo({ insumo, aoSalvar: (s) => { e.aviso = `"${s.nome}" atualizado.`; desenharInsumos(raiz); } });
    } else if (ev.target.closest('[data-alternar]')) {
      insumo.ativo = insumo.ativo === false;
      e.aviso = insumo.ativo
        ? `"${insumo.nome}" reativado.`
        : `"${insumo.nome}" inativado${insumo.estoque.saldo > 0 ? ` (ainda há ${fmtQtd(insumo.estoque.saldo, insumo.uso)} no saldo)` : ''}: some das listas de escolha e do Estoque, e o histórico de preços fica guardado.`;
      desenharInsumos(raiz);
    }
  });
  desenharInsumos(raiz);
}

// ---- Tela de Fornecedores -------------------------------------------------------------------

export function telaFornecedores() {
  return `
    <div data-cadastro="fornecedores">
      <div class="ferramentas">
        <div class="busca">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
          <input class="campo" type="search" data-busca placeholder="Buscar fornecedor ou CNPJ" aria-label="Buscar fornecedor" value="${esc(estadoFornecedores.busca)}" autocomplete="off">
        </div>
        <button type="button" class="botao botao--primario" data-novo>+ Novo fornecedor</button>
      </div>
      <div class="filtros" data-filtros role="group" aria-label="Filtrar por situação"></div>
      <div class="aviso-contagem" data-aviso role="status" aria-live="polite"></div>
      <ul class="lista-estoque" data-lista></ul>
      <p class="rodape-nota">Cadastros feitos aqui valem só até recarregar a página. Ao enviar uma nota de um fornecedor novo, a conferência oferece cadastrá-lo com o CNPJ da nota.</p>
    </div>`;
}

function htmlItemFornecedor(f) {
  const ativo = f.ativo !== false;
  const usados = INSUMOS.filter((i) => i.fornecedorPrincipal === f.id && i.ativo !== false).length;
  const detalhes = [f.documento ? `CNPJ/CPF ${esc(formatarCnpjCpf(f.documento))}` : 'sem CNPJ cadastrado', f.telefone ? `tel. ${esc(f.telefone)}` : '', f.contato ? `contato: ${esc(f.contato)}` : ''].filter(Boolean).join(' · ');
  return `
    <li class="item item--cadastro${ativo ? '' : ' item--inativo'}" data-id="${esc(f.id)}">
      <div class="item__nome">
        <strong>${esc(f.nome)}</strong> ${ativo ? '' : '<span class="chip chip--neutro">inativo</span>'}
        <span class="sub">${esc(f.tipo)} · comprovante: ${esc(f.comprovante)}</span>
        <span class="sub">${detalhes}</span>
        ${f.prazo ? `<span class="sub">Entrega: ${esc(f.prazo)}</span>` : ''}
      </div>
      <div class="item__saldo"><span class="item__qtd">${usados}<small>${usados === 1 ? 'insumo principal' : 'insumos principais'}</small></span></div>
      <div class="item__acao item__acao--dupla">
        <button type="button" class="botao botao--secundario botao--pequeno" data-editar>Editar</button>
        <button type="button" class="botao botao--secundario botao--pequeno" data-alternar>${ativo ? 'Inativar' : 'Reativar'}</button>
      </div>
    </li>`;
}

function desenharFornecedores(raiz) {
  const e = estadoFornecedores;
  const termo = normalizar(e.busca.trim());
  const digitos = e.busca.replace(/\D/g, '');
  const achados = FORNECEDORES.filter((f) => !termo || normalizar(f.nome).includes(termo) || (digitos.length >= 3 && f.documento.includes(digitos)));
  const ativos = achados.filter((f) => f.ativo !== false).length;
  raiz.querySelector('[data-filtros]').innerHTML = htmlFiltrosSituacao(e, ativos, achados.length - ativos);
  const lista = achados.filter((f) => passaSituacao(f, e.situacao)).sort((a, b) => porNome(a.nome, b.nome));
  raiz.querySelector('[data-lista]').innerHTML = lista.length ? lista.map(htmlItemFornecedor).join('') : '<li class="vazio">Nenhum fornecedor encontrado.</li>';
  raiz.querySelector('[data-aviso]').textContent = e.aviso;
}

export function iniciarFornecedores(conteudo) {
  const raiz = conteudo.querySelector('[data-cadastro="fornecedores"]');
  const e = estadoFornecedores;
  e.aviso = '';
  raiz.addEventListener('input', (ev) => { if (ev.target.matches('[data-busca]')) { e.busca = ev.target.value; e.aviso = ''; desenharFornecedores(raiz); } });
  raiz.addEventListener('click', (ev) => {
    const situacao = ev.target.closest('[data-situacao]');
    if (situacao) { e.situacao = situacao.dataset.situacao; e.aviso = ''; desenharFornecedores(raiz); return; }
    if (ev.target.closest('[data-novo]')) {
      abrirFormFornecedor({ aoSalvar: (novo) => { e.aviso = `"${novo.nome}" cadastrado.`; e.situacao = 'ativos'; desenharFornecedores(raiz); } });
      return;
    }
    const li = ev.target.closest('[data-id]');
    const fornecedor = li && FORNECEDORES.find((f) => f.id === li.dataset.id);
    if (!fornecedor) return;
    if (ev.target.closest('[data-editar]')) {
      abrirFormFornecedor({ fornecedor, aoSalvar: (s) => { e.aviso = `"${s.nome}" atualizado.`; desenharFornecedores(raiz); } });
    } else if (ev.target.closest('[data-alternar]')) {
      fornecedor.ativo = fornecedor.ativo === false;
      e.aviso = fornecedor.ativo ? `"${fornecedor.nome}" reativado.` : `"${fornecedor.nome}" inativado: some das listas de escolha, e as compras já registradas continuam com o nome dele.`;
      desenharFornecedores(raiz);
    }
  });
  desenharFornecedores(raiz);
}
