// Agenda de encomendas da proprietária (etapa 15): calendário com os dias de encomenda em destaque, o que precisa da resposta dela,
// a ordem de produção e os insumos de cada dia, o cadastro de encomenda por telefone ou WhatsApp e as regras (prazo, limite, sinal).
// Tudo com dados inventados e só na memória do navegador.

import {
  STATUS, CANAIS, config, CATALOGO, ENCOMENDAS, catalogoPorId, aguardando, resumoDoDia, encomendasDoDia, ordemDeProducao, insumosDoDia,
  proximosStatus, mudarStatus, criarEncomenda, disponibilidadeDoDia, dataPodeSerEscolhida, horariosDisponiveis, custoDoItem,
  prazoDoPedido, totalDosItens, sinalDe, iso, deIso, somarDias, diasEntre, formatar, formatarLongo, nomeDoDia, criarEncomendasDeExemplo, removerExemplos,
} from './encomendas.js';
import { fmtMoeda, fmtNumero, fmtQtd, fmtPercentual, esc } from './formato.js';

const ABAS = { '': 'Calendário', nova: 'Nova encomenda', configurar: 'Regras e catálogo' };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const ui = { selecionado: null, mes: null, aviso: '', erro: '', nova: { nome: '', telefone: '', canal: 'whatsapp', itens: [{ catalogoId: '', qtd: 1 }], data: '', hora: '', tipo: 'retirada', endereco: '', obs: '', sinalPago: false, forcar: false } };
const pct = (f) => fmtPercentual(f).replace(/^\+/, '');
const tel = (t) => (t.length === 11 ? `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}` : t.length === 10 ? `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}` : t);
const numeroOuNulo = (t) => (String(t).trim() === '' || !Number.isFinite(Number(String(t).replace(',', '.'))) ? null : Number(String(t).replace(',', '.')));

export function telaEncomendas() { return '<div data-encomendas></div>'; }

/** Quantas encomendas esperam resposta (usado no número ao lado do menu). */
export const quantasAguardam = () => aguardando().length;

/** Põe (ou tira) o número de encomendas esperando resposta ao lado de "Encomendas" no menu. */
export function atualizarNumeroDoMenu() {
  const item = document.querySelector('.menu__item[data-rota="encomendas"]');
  if (!item) return;
  item.querySelector('.contador')?.remove();
  const n = quantasAguardam();
  if (n > 0) item.insertAdjacentHTML('beforeend', `<span class="contador" aria-label="${n} aguardando resposta">${n}</span>`);
}

function htmlTopo(aba) {
  return `
    <nav class="abas" aria-label="Encomendas">
      ${Object.entries(ABAS).map(([k, r]) => `<a class="aba" href="#/encomendas${k ? `/${k}` : ''}"${aba === k ? ' aria-current="page"' : ''}>${r}${k === '' && quantasAguardam() ? ` <span class="contador">${quantasAguardam()}</span>` : ''}</a>`).join('')}
      <span class="abas__offline abas__grupo">
        <a class="botao botao--pequeno botao--secundario" href="#/encomendar">Ver a página do cliente</a>
        <button type="button" class="botao botao--pequeno botao--secundario" data-exemplos>${ENCOMENDAS.some((e) => e.exemplo) ? 'Tirar as encomendas de exemplo' : 'Pôr encomendas de exemplo'}</button>
      </span>
    </nav>
    ${ui.aviso ? `<p class="conferencia conferencia--ok" role="status">${ui.aviso}</p>` : ''}`;
}

// ---- Calendário -------------------------------------------------------------------------------------------

function htmlCalendario() {
  const t0 = iso(new Date());
  const primeiro = ui.mes ?? `${t0.slice(0, 7)}-01`;
  const d1 = deIso(primeiro);
  const vazios = d1.getDay();
  const dias = new Date(d1.getFullYear(), d1.getMonth() + 1, 0).getDate();
  const anterior = iso(new Date(d1.getFullYear(), d1.getMonth() - 1, 1));
  const proximo = iso(new Date(d1.getFullYear(), d1.getMonth() + 1, 1));
  const celulas = [];
  for (let i = 0; i < vazios; i += 1) celulas.push('<span class="cal__vazio"></span>');
  for (let n = 1; n <= dias; n += 1) {
    const t = `${primeiro.slice(0, 8)}${String(n).padStart(2, '0')}`;
    const r = resumoDoDia(t);
    const classes = ['cal__dia', r.total ? 'cal__dia--tem' : '', r.aguardando ? 'cal__dia--espera' : '', r.cheio ? 'cal__dia--cheio' : '', r.bloqueado ? 'cal__dia--bloqueado' : '', t < t0 ? 'cal__dia--passado' : '', t === t0 ? 'cal__dia--hoje' : '', ui.selecionado === t ? 'cal__dia--escolhido' : ''].filter(Boolean).join(' ');
    const texto = r.total ? `${r.total} ${r.total === 1 ? 'encomenda' : 'encomendas'}` : r.bloqueado ? 'sem encomenda' : '';
    celulas.push(`
      <button type="button" class="${classes}" data-dia="${t}" aria-label="${esc(formatarLongo(t))}: ${esc(texto || 'sem encomendas')}${r.aguardando ? `, ${r.aguardando} aguardando resposta` : ''}"${ui.selecionado === t ? ' aria-pressed="true"' : ''}>
        <span class="cal__numero">${n}</span>
        ${r.total ? `<span class="cal__total">${r.total}</span>` : ''}
        <span class="cal__texto">${esc(texto)}</span>
        ${r.aguardando ? `<span class="cal__espera" title="Aguardando a sua resposta">${r.aguardando} ${r.aguardando === 1 ? 'espera' : 'esperam'}</span>` : ''}
        ${r.cheio ? '<span class="cal__selo">lotado</span>' : ''}
      </button>`);
  }
  return `
    <section class="cal" aria-label="Calendário de encomendas">
      <div class="cal__topo">
        <button type="button" class="botao botao--secundario" data-mes="${anterior}" aria-label="Mês anterior">‹ Anterior</button>
        <h2>${MESES[d1.getMonth()].replace(/^./, (c) => c.toUpperCase())} de ${d1.getFullYear()}</h2>
        <button type="button" class="botao botao--secundario" data-mes="${proximo}" aria-label="Próximo mês">Próximo ›</button>
        <button type="button" class="botao botao--pequeno botao--secundario" data-mes="${t0.slice(0, 7)}-01" data-hoje>Hoje</button>
      </div>
      <div class="cal__semana" aria-hidden="true">${SEMANA.map((s) => `<span>${s}</span>`).join('')}</div>
      <div class="cal__grade">${celulas.join('')}</div>
      <ul class="cal__legenda">
        <li><i class="cal__chave cal__chave--tem"></i> dia com encomenda</li>
        <li><i class="cal__chave cal__chave--espera"></i> tem encomenda esperando a sua resposta</li>
        <li><i class="cal__chave cal__chave--cheio"></i> dia lotado</li>
        <li><i class="cal__chave cal__chave--bloqueado"></i> dia sem encomenda (bloqueado ou fechado)</li>
      </ul>
    </section>`;
}

function htmlFaixaDeEspera() {
  const n = aguardando().length;
  if (n === 0) return '';
  return `<p class="faixa-espera" role="status"><strong>${n} ${n === 1 ? 'encomenda espera' : 'encomendas esperam'} a sua resposta.</strong> <a class="link" href="#espera" data-rolar="espera">Ver e responder ↓</a></p>`;
}

function htmlAtencao() {
  const lista = aguardando();
  if (lista.length === 0) return '<p class="conferencia conferencia--ok" role="status">Nenhuma encomenda esperando a sua resposta.</p>';
  return `
    <section class="atencao" id="espera" aria-label="Encomendas aguardando resposta">
      <h2>Esperando a sua resposta <span class="contador">${lista.length}</span></h2>
      <ul class="atencao__lista">${lista.map((e) => `
        <li data-codigo="${esc(e.codigo)}">
          <div><strong>${esc(formatarLongo(e.data))}, ${esc(e.hora)}</strong> · ${esc(e.cliente.nome)}
            <span class="sub">${e.itens.map((i) => `${i.qtd}× ${esc(i.nome)}`).join(', ')} · total ${fmtMoeda(e.total)} · sinal ${fmtMoeda(e.sinal)} · ${esc(CANAIS[e.canal])} · recebida há ${Math.max(0, diasEntre(iso(e.criadoEm), iso(new Date())))} dia(s)</span></div>
          <span class="atencao__acoes">
            <button type="button" class="botao botao--pequeno botao--secundario" data-ir="${e.data}">Ver o dia</button>
            <button type="button" class="botao botao--pequeno botao--primario" data-status="confirmada">Sinal recebido: confirmar</button>
            <button type="button" class="botao botao--pequeno botao--secundario" data-status="cancelada">Recusar</button>
          </span>
        </li>`).join('')}</ul>
    </section>`;
}

// ---- Detalhe do dia ---------------------------------------------------------------------------------------------

const ROTULO_STATUS = { confirmada: 'Sinal recebido: confirmar', pronta: 'Marcar como pronta', entregue: 'Marcar como retirada/entregue', cancelada: 'Cancelar', aguardando: 'Reabrir como aguardando' };

function htmlEncomenda(e) {
  const acoes = proximosStatus(e).map((s) => `<button type="button" class="botao botao--pequeno ${s === 'cancelada' ? 'botao--secundario' : 'botao--primario'}" data-status="${s}">${esc(e.status === 'aguardando' && s === 'cancelada' ? 'Recusar' : e.status === 'pronta' && s === 'confirmada' ? 'Voltar para confirmada' : ROTULO_STATUS[s])}</button>`).join('');
  return `
    <li class="enc enc--${e.status}" data-codigo="${esc(e.codigo)}">
      <div class="enc__topo">
        <strong class="enc__hora">${esc(e.hora)}</strong>
        <span class="chip ${e.status === 'aguardando' ? 'chip--alerta' : e.status === 'cancelada' ? 'chip--neutro' : 'chip--ok'}">${esc(STATUS[e.status])}</span>
        <span class="chip chip--neutro">${e.tipo === 'entrega' ? 'entrega' : 'retirada'}</span>
        <span class="sub">${esc(e.codigo)} · ${esc(CANAIS[e.canal])}${e.exemplo ? ' · exemplo' : ''}</span>
      </div>
      <p class="enc__cliente"><strong>${esc(e.cliente.nome)}</strong> · ${esc(tel(e.cliente.telefone))}</p>
      <ul class="enc__itens">${e.itens.map((i) => `<li>${i.qtd} × ${esc(i.nome)}</li>`).join('')}</ul>
      ${e.obs ? `<p class="enc__obs"><strong>Pedido especial:</strong> ${esc(e.obs)}</p>` : ''}
      ${e.endereco ? `<p class="sub">Endereço: ${esc(e.endereco)}</p>` : ''}
      ${e.aceitaForaDoLimite ? '<p class="sub sub--atencao">Aceita fora do limite ou da antecedência.</p>' : ''}
      <p class="sub">Total ${fmtMoeda(e.total)} · sinal ${fmtMoeda(e.sinal)} ${e.sinalPago ? '(recebido)' : '(<strong>não recebido</strong>)'} · a receber na ${e.tipo === 'entrega' ? 'entrega' : 'retirada'}: ${fmtMoeda(e.sinalPago ? e.total - e.sinal : e.total)}</p>
      ${acoes ? `<div class="enc__acoes">${acoes}</div>` : ''}
    </li>`;
}

function htmlDia(t) {
  const lista = encomendasDoDia(t, true);
  const ordem = ordemDeProducao(t);
  const insumos = insumosDoDia(t);
  const espera = lista.filter((e) => e.status === 'aguardando').length;
  const r = resumoDoDia(t);
  const faltam = insumos.filter((i) => i.falta > 0.0005);
  return `
    <section class="dia-detalhe" aria-label="Detalhe do dia">
      <header class="dia-detalhe__topo">
        <h2>${esc(formatarLongo(t))}</h2>
        <button type="button" class="botao botao--pequeno botao--secundario" data-bloquear="${t}">${config.diasBloqueados.has(t) ? 'Liberar este dia para encomendas' : 'Bloquear este dia (feriado, folga)'}</button>
      </header>
      <p class="sub">${r.total} ${r.total === 1 ? 'encomenda' : 'encomendas'}${r.cheio ? ' · <strong>dia lotado</strong>' : ` · limite de ${config.limiteGeralDia} por dia`}${config.diasBloqueados.has(t) ? ' · <strong>bloqueado</strong>' : ''}</p>

      ${lista.length === 0 ? '<p class="vazio">Nenhuma encomenda neste dia.</p>' : `<ul class="encs">${lista.map(htmlEncomenda).join('')}</ul>`}

      ${ordem.length ? `
        <h3>Ordem de produção do dia</h3>
        <div class="tabela-wrap"><table class="tabela tabela--compacta">
          <thead><tr><th>Produto</th><th class="num">Encomendado</th><th class="num">Precisa estar pronto</th></tr></thead>
          <tbody>${ordem.map((o) => `<tr><td><strong>${esc(o.nome)}</strong></td><td class="num">${o.qtd} ${esc(o.rotulo)}${o.qtd > 1 ? 's' : ''} <span class="sub">(${fmtNumero(o.unidadesBase)} un. da ficha)</span></td><td class="num">até ${esc(o.horaMaisCedo)}</td></tr>`).join('')}</tbody></table></div>
        <h3>Insumos que este dia exige</h3>
        ${faltam.length ? `<p class="conferencia conferencia--alerta" role="status"><strong>Vai faltar no estoque:</strong> ${esc(faltam.map((i) => i.nome).join(', '))}. Compre antes deste dia.</p>` : '<p class="conferencia conferencia--ok" role="status">O estoque de hoje cobre os insumos deste dia.</p>'}
        <div class="tabela-wrap"><table class="tabela tabela--compacta">
          <thead><tr><th>Insumo</th><th class="num">Precisa</th><th class="num">Saldo agora</th><th></th></tr></thead>
          <tbody>${insumos.map((i) => `<tr><td>${esc(i.nome)}</td><td class="num">${fmtQtd(i.qtd, i.uso)}</td><td class="num">${fmtQtd(i.saldo, i.uso)}</td><td>${i.falta > 0.0005 ? `<span class="chip chip--alerta">falta ${fmtQtd(i.falta, i.uso)}</span>` : '<span class="chip chip--ok">ok</span>'}</td></tr>`).join('')}</tbody></table></div>
        <p class="sub">Conta pelas fichas técnicas, só das encomendas <strong>confirmadas</strong>${espera ? ` (${espera} ${espera === 1 ? 'espera' : 'esperam'} confirmação e não entra${espera === 1 ? '' : 'm'} aqui)` : ''}. O saldo é o de hoje: não considera compras nem outras produções até lá.</p>` : (lista.some((e) => e.status === 'aguardando') ? '<p class="sub">A ordem de produção aparece quando houver encomenda confirmada neste dia.</p>' : '')}
    </section>`;
}

// ---- Nova encomenda (telefone, WhatsApp, balcão) -------------------------------------------------------------

function htmlNova() {
  const n = ui.nova;
  const itens = n.itens.filter((i) => i.catalogoId && i.qtd > 0);
  const disp = n.data && itens.length ? disponibilidadeDoDia(n.data, itens) : null;
  const linhas = n.itens.map((i, k) => `
    <div class="nova__item" data-item="${k}">
      <label><span class="rotulo-pequeno">Produto</span><select class="campo" data-n="produto"><option value="">Escolha…</option>${CATALOGO.map((c) => `<option value="${c.id}"${i.catalogoId === c.id ? ' selected' : ''}>${esc(c.nome)} (${c.prazoDias} dia${c.prazoDias > 1 ? 's' : ''})</option>`).join('')}</select></label>
      <label><span class="rotulo-pequeno">Quantidade</span><input class="campo" type="number" min="1" step="1" value="${i.qtd}" data-n="qtd"></label>
      <button type="button" class="botao botao--pequeno botao--secundario" data-n-remover aria-label="Remover item">×</button>
    </div>`).join('');
  const total = itens.length ? totalDosItens(itens) : 0;
  return `
    <form class="cartao" data-form-nova novalidate>
      <h2>Nova encomenda</h2>
      <p class="sub">Para pedidos que chegam por telefone, WhatsApp ou balcão: tudo fica na mesma agenda, com o mesmo controle de datas e limites.</p>
      <div class="janela__grade">
        <label><span class="rotulo-pequeno">Nome do cliente</span><input class="campo" data-n="nome" value="${esc(n.nome)}" maxlength="80" autocomplete="off"></label>
        <label><span class="rotulo-pequeno">Telefone com DDD</span><input class="campo" type="tel" data-n="telefone" value="${esc(n.telefone)}" autocomplete="off"></label>
        <label><span class="rotulo-pequeno">Como chegou</span><select class="campo" data-n="canal">${Object.entries(CANAIS).filter(([k]) => k !== 'site').map(([k, v]) => `<option value="${k}"${n.canal === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      </div>
      <div data-itens-nova>${linhas}</div>
      <button type="button" class="botao botao--secundario" data-n-adicionar>+ Produto</button>
      <div class="janela__grade nova__quando">
        <label><span class="rotulo-pequeno">Data</span><input class="campo" type="date" data-n="data" value="${esc(n.data)}" min="${iso(new Date())}"></label>
        <label><span class="rotulo-pequeno">Horário</span><select class="campo" data-n="hora"><option value="">Escolha…</option>${horariosDisponiveis().map((h) => `<option${n.hora === h ? ' selected' : ''}>${h}</option>`).join('')}</select></label>
        <label><span class="rotulo-pequeno">Retirada ou entrega</span><select class="campo" data-n="tipo"><option value="retirada"${n.tipo === 'retirada' ? ' selected' : ''}>Retirada</option><option value="entrega"${n.tipo === 'entrega' ? ' selected' : ''}>Entrega</option></select></label>
        ${n.tipo === 'entrega' ? `<label class="janela__largo"><span class="rotulo-pequeno">Endereço</span><input class="campo" data-n="endereco" value="${esc(n.endereco)}" maxlength="140" autocomplete="off"></label>` : ''}
        <label class="janela__largo"><span class="rotulo-pequeno">Pedido especial (tema, mensagem, alergia...)</span><textarea class="campo campo--area" rows="2" data-n="obs" maxlength="400">${esc(n.obs)}</textarea></label>
      </div>
      <div data-disp>${htmlDisponibilidade(disp, itens)}</div>
      <label class="opcao-resposta opcao-resposta--solta"><input type="checkbox" data-n="sinalPago"${n.sinalPago ? ' checked' : ''}> <span>Sinal já recebido (já entra como confirmada)</span></label>
      <p class="sub">${itens.length ? `Total ${fmtMoeda(total)} · sinal de ${config.sinalPct}%: ${fmtMoeda(sinalDe(total))}` : ''}</p>
      <p class="manual__erro" role="alert" data-erro>${esc(ui.erro)}</p>
      <div class="janela__acoes">
        ${n.forcar ? '<button type="button" class="botao botao--secundario" data-n-forcar>Aceitar mesmo assim</button>' : ''}
        <button type="submit" class="botao botao--primario botao--grande">Registrar encomenda</button>
      </div>
    </form>`;
}

function htmlDisponibilidade(disp, itens) {
  if (!disp) return '<p class="sub">Escolha o produto e a data para ver se há vaga.</p>';
  const { dias } = prazoDoPedido(itens);
  const ok = dataPodeSerEscolhida(disp);
  return `<p class="conferencia ${ok ? 'conferencia--ok' : 'conferencia--alerta'}" role="status"><strong>${ok ? (disp.status === 'poucas' ? 'Há vaga, mas poucas.' : 'Há vaga neste dia.') : 'Este dia não está disponível pelas regras.'}</strong> ${esc(disp.motivo)} ${ok ? '' : `Antecedência do pedido: ${dias} ${dias === 1 ? 'dia' : 'dias'}. Você pode aceitar mesmo assim.`}</p>`;
}

// ---- Regras e catálogo -----------------------------------------------------------------------------------------------

function htmlConfigurar() {
  const bloqueados = [...config.diasBloqueados].sort();
  const linhas = CATALOGO.map((c) => {
    const k = custoDoItem(c);
    return `
      <tr data-cat="${esc(c.id)}">
        <td><strong>${esc(c.nome)}</strong><span class="sub">${c.unidadesPorPedido} un. da ficha por ${esc(c.rotulo)}</span></td>
        <td><label class="opcao-resposta opcao-resposta--solta"><input type="checkbox" data-c="disponivel"${c.disponivel ? ' checked' : ''} aria-label="Disponível para encomenda"> <span>${c.disponivel ? 'Sim' : 'Não'}</span></label></td>
        <td class="num"><input class="campo campo--pequeno campo--numero" type="number" min="0" step="0.01" data-c="preco" value="${c.preco}" aria-label="Preço"></td>
        <td class="num"><input class="campo campo--pequeno campo--numero" type="number" min="0" step="1" data-c="prazoDias" value="${c.prazoDias}" aria-label="Antecedência em dias"></td>
        <td class="num"><input class="campo campo--pequeno campo--numero" type="number" min="1" step="1" data-c="limiteDia" value="${c.limiteDia}" aria-label="Limite por dia"></td>
        <td class="num"><span data-c-custo>${k ? `${fmtMoeda(k.custo)}${k.margem !== null ? `<span class="sub">margem ${pct(k.margem)}</span>` : ''}` : '—'}</span></td>
      </tr>`;
  }).join('');
  return `
    <section class="cartao cartao--nota"><span class="selo">Hipótese [P]</span>
      <p>Estas são as <strong>regras da encomenda</strong>: antecedência mínima por produto, quantas unidades por dia a cozinha aguenta, sinal e dias sem encomenda. O cliente só enxerga as datas que respeitam tudo isto. Os valores são inventados: <strong>ajuste para a sua realidade</strong>.</p></section>

    <h2>Catálogo de encomenda</h2>
    <div class="tabela-wrap"><table class="tabela tabela--compacta tabela--cat">
      <thead><tr><th>Produto</th><th>Disponível</th><th class="num">Preço (R$)</th><th class="num">Antecedência (dias)</th><th class="num">Máx. por dia</th><th class="num">Custo dos ingredientes</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>
    <p class="sub">"Antecedência" é o tempo mínimo entre o pedido e a data de retirada ou entrega. "Máx. por dia" é o que a cozinha consegue fazer naquele dia, em unidades do produto (1 bolo, 1 cento). O custo é só de ingredientes (sem gastos gerais).</p>

    <h2>Regras gerais</h2>
    <div class="janela__grade">
      <label><span class="rotulo-pequeno">Sinal para confirmar (% do total)</span><input class="campo" type="number" min="0" max="100" step="1" data-g="sinalPct" value="${config.sinalPct}"></label>
      <label><span class="rotulo-pequeno">Máximo de encomendas por dia (todas somadas)</span><input class="campo" type="number" min="1" step="1" data-g="limiteGeralDia" value="${config.limiteGeralDia}"></label>
      <label><span class="rotulo-pequeno">Abre às (hora)</span><input class="campo" type="number" min="0" max="23" data-g="horaAbertura" value="${config.horaAbertura}"></label>
      <label><span class="rotulo-pequeno">Fecha às (hora)</span><input class="campo" type="number" min="1" max="23" data-g="horaFechamento" value="${config.horaFechamento}"></label>
      <fieldset class="painel-nota__resposta janela__largo"><legend class="rotulo-pequeno">Dias da semana em que não recebe encomenda</legend>
        ${SEMANA.map((s, i) => `<label class="opcao-resposta"><input type="checkbox" data-semana="${i}"${config.diasFechadosSemana.includes(i) ? ' checked' : ''}> <span>${s}</span></label>`).join('')}
      </fieldset>
    </div>
    <h2>Dias bloqueados (feriados, folgas)</h2>
    <div class="ferramentas"><input class="campo" type="date" data-bloq-data min="${iso(new Date())}"><button type="button" class="botao botao--secundario" data-bloq-add>Bloquear este dia</button></div>
    ${bloqueados.length ? `<ul class="formas">${bloqueados.map((t) => `<li>${esc(formatarLongo(t))} <button type="button" class="botao botao--pequeno botao--secundario" data-bloq-rem="${t}">Liberar</button></li>`).join('')}</ul>` : '<p class="sub">Nenhum dia bloqueado.</p>'}

    <h2>Link do cliente</h2>
    <p>É a página que você divulgaria no WhatsApp e no Instagram: <a class="link" href="#/encomendar">ver como o cliente vê</a>. Sem login. No piloto ela mostra só dados de exemplo.</p>`;
}

// ---- Montagem e eventos -------------------------------------------------------------------------------------------------

export function iniciarEncomendas(conteudo, parametro = '') {
  const raiz = conteudo.querySelector('[data-encomendas]');
  const aba = parametro in ABAS ? parametro : '';
  if (!ui.selecionado) ui.selecionado = iso(new Date());
  ui.erro = '';

  const desenhar = () => {
    const corpo = aba === '' ? `${htmlFaixaDeEspera()}${htmlCalendario()}${htmlAtencao()}<div data-detalhe-dia>${htmlDia(ui.selecionado)}</div>` : aba === 'nova' ? htmlNova() : htmlConfigurar();
    raiz.innerHTML = htmlTopo(aba) + corpo;
  };
  const refazer = (foco) => { desenhar(); atualizarNumeroDoMenu(); if (foco) raiz.querySelector(foco)?.focus(); };
  const encomendaDe = (el) => ENCOMENDAS.find((e) => e.codigo === el.closest('[data-codigo]')?.dataset.codigo);
  desenhar();

  raiz.addEventListener('click', (e) => {
    const alvo = (s) => e.target.closest(s);
    if (alvo('[data-exemplos]')) {
      if (ENCOMENDAS.some((x) => x.exemplo)) { removerExemplos(); ui.aviso = 'Encomendas de exemplo retiradas.'; } else { criarEncomendasDeExemplo(); ui.aviso = 'Encomendas de exemplo colocadas (inventadas), espalhadas pelas próximas semanas.'; }
      return refazer();
    }
    const rolar = alvo('[data-rolar]');
    if (rolar) { e.preventDefault(); return raiz.querySelector(`#${rolar.dataset.rolar}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    const dia = alvo('[data-dia]');
    if (dia) { ui.selecionado = dia.dataset.dia; ui.aviso = ''; return refazer(`[data-dia="${ui.selecionado}"]`); }
    const mes = alvo('[data-mes]');
    if (mes) { ui.mes = mes.dataset.mes; return refazer(`[data-mes="${mes.dataset.mes}"]`); }
    const ir = alvo('[data-ir]');
    if (ir) { ui.selecionado = ir.dataset.ir; ui.mes = `${ir.dataset.ir.slice(0, 7)}-01`; ui.aviso = ''; refazer(); return raiz.querySelector('[data-detalhe-dia]').scrollIntoView({ block: 'start' }); }
    const st = alvo('[data-status]');
    if (st) {
      const enc = encomendaDe(st);
      try { mudarStatus(enc, st.dataset.status); ui.aviso = `<strong>${esc(enc.codigo)}</strong>: ${esc(STATUS[enc.status].toLowerCase())}.`; } catch (erro) { ui.aviso = esc(erro.message); }
      return refazer();
    }
    const bloq = alvo('[data-bloquear]');
    if (bloq) { const t = bloq.dataset.bloquear; if (config.diasBloqueados.has(t)) config.diasBloqueados.delete(t); else config.diasBloqueados.add(t); ui.aviso = ''; return refazer(); }

    // Nova encomenda
    if (alvo('[data-n-adicionar]')) { ui.nova.itens.push({ catalogoId: '', qtd: 1 }); return refazer(); }
    const nrem = alvo('[data-n-remover]');
    if (nrem) { ui.nova.itens.splice(Number(nrem.closest('[data-item]').dataset.item), 1); if (!ui.nova.itens.length) ui.nova.itens.push({ catalogoId: '', qtd: 1 }); return refazer(); }
    if (alvo('[data-n-forcar]')) return enviarNova(true);

    // Regras
    const brem = alvo('[data-bloq-rem]');
    if (brem) { config.diasBloqueados.delete(brem.dataset.bloqRem); return refazer(); }
    if (alvo('[data-bloq-add]')) { const v = raiz.querySelector('[data-bloq-data]').value; if (v) config.diasBloqueados.add(v); return refazer(); }
  });

  function enviarNova(forcar) {
    const n = ui.nova;
    try {
      const enc = criarEncomenda({ nome: n.nome, telefone: n.telefone, canal: n.canal, itens: n.itens.filter((i) => i.catalogoId), data: n.data, hora: n.hora, tipo: n.tipo, endereco: n.endereco, obs: n.obs },
        { ignorarLimites: forcar, confirmada: n.sinalPago });
      ui.aviso = `<strong>Encomenda ${esc(enc.codigo)} registrada</strong> para ${esc(formatarLongo(enc.data))}, ${esc(enc.hora)}. ${enc.status === 'confirmada' ? 'Já confirmada.' : 'Aguardando o sinal.'}`;
      ui.nova = { nome: '', telefone: '', canal: n.canal, itens: [{ catalogoId: '', qtd: 1 }], data: '', hora: '', tipo: 'retirada', endereco: '', obs: '', sinalPago: false, forcar: false };
      ui.selecionado = enc.data; ui.mes = `${enc.data.slice(0, 7)}-01`; ui.erro = '';
      location.hash = '#/encomendas';
    } catch (erro) {
      ui.erro = erro.message;
      n.forcar = !forcar && /disponível|antecedência|dia|vaga|esgotado|lotado|fechada|mais \d/i.test(erro.message) && Boolean(n.data);
      refazer();
    }
  }

  raiz.addEventListener('input', (e) => {
    const n = ui.nova;
    const campo = e.target.dataset.n;
    if (campo && ['nome', 'telefone', 'endereco', 'obs'].includes(campo)) { n[campo] = e.target.value; ui.erro = ''; return; }
    if (campo === 'qtd') { n.itens[Number(e.target.closest('[data-item]').dataset.item)].qtd = Number(e.target.value) || 0; atualizarDisponibilidade(); return; }
    const c = e.target.dataset.c;
    if (c && c !== 'disponivel') {
      const item = catalogoPorId(e.target.closest('[data-cat]').dataset.cat);
      const v = numeroOuNulo(e.target.value);
      if (v !== null && v >= 0) {
        item[c] = c === 'preco' ? v : Math.round(v);
        const k = custoDoItem(item);
        e.target.closest('tr').querySelector('[data-c-custo]').innerHTML = k ? `${fmtMoeda(k.custo)}${k.margem !== null ? `<span class="sub">margem ${pct(k.margem)}</span>` : ''}` : '—';
      }
      return;
    }
    const g = e.target.dataset.g;
    if (g) { const v = numeroOuNulo(e.target.value); if (v !== null && v >= 0) config[g] = g === 'sinalPct' || g === 'limiteGeralDia' || g.startsWith('hora') ? Math.round(v) : v; }
  });

  function atualizarDisponibilidade() {
    const area = raiz.querySelector('[data-disp]');
    if (!area) return;
    const n = ui.nova;
    const itens = n.itens.filter((i) => i.catalogoId && i.qtd > 0);
    area.innerHTML = htmlDisponibilidade(n.data && itens.length ? disponibilidadeDoDia(n.data, itens) : null, itens);
    n.forcar = false;
  }

  raiz.addEventListener('change', (e) => {
    const n = ui.nova;
    const campo = e.target.dataset.n;
    if (campo === 'produto') { n.itens[Number(e.target.closest('[data-item]').dataset.item)].catalogoId = e.target.value; atualizarDisponibilidade(); }
    else if (campo === 'canal') n.canal = e.target.value;
    else if (campo === 'data') { n.data = e.target.value; atualizarDisponibilidade(); }
    else if (campo === 'hora') n.hora = e.target.value;
    else if (campo === 'tipo') { n.tipo = e.target.value; refazer(); }
    else if (campo === 'sinalPago') n.sinalPago = e.target.checked;
    else if (e.target.dataset.c === 'disponivel') { catalogoPorId(e.target.closest('[data-cat]').dataset.cat).disponivel = e.target.checked; e.target.nextElementSibling.textContent = e.target.checked ? 'Sim' : 'Não'; }
    else if (e.target.dataset.semana !== undefined) {
      const i = Number(e.target.dataset.semana);
      config.diasFechadosSemana = e.target.checked ? [...new Set([...config.diasFechadosSemana, i])] : config.diasFechadosSemana.filter((x) => x !== i);
    }
  });

  raiz.addEventListener('submit', (e) => { e.preventDefault(); if (e.target.matches('[data-form-nova]')) enviarNova(false); });
}
