// Página pública de encomenda (etapa 15): é o que o CLIENTE vê, sem login. Pensada para o celular.
// O cliente escolhe o produto, vê o prazo mínimo, só consegue marcar datas em que a padaria aceita e recebe um código para consultar.
// No piloto nada sai do navegador: a "encomenda" aparece na agenda da proprietária (menu Encomendas) enquanto a página estiver aberta.

import {
  config, CATALOGO, STATUS, catalogoPorId, criarEncomenda, consultar, disponibilidadeDoDia, dataPodeSerEscolhida, primeiraDataLivre,
  prazoDoPedido, totalDosItens, sinalDe, horariosDisponiveis, iso, deIso, somarDias, formatar, formatarLongo,
} from './encomendas.js';
import { fmtMoeda, esc } from './formato.js';

const cli = {
  qtd: new Map(), data: '', hora: '', tipo: 'retirada', nome: '', telefone: '', endereco: '', obs: '',
  mes: null, // "AAAA-MM-01" do mês que o calendário mostra
  enviada: null, erro: '', aba: 'pedido', consulta: { codigo: '', telefone: '', achou: undefined },
};
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function telaEncomendar() { return '<div data-cliente></div>'; }

const itensDoPedido = () => [...cli.qtd].filter(([, q]) => q > 0).map(([catalogoId, qtd]) => ({ catalogoId, qtd }));
const rotuloQtd = (c, q) => `${q} ${c.rotulo}${q > 1 ? 's' : ''}`;

// ---- Produtos ---------------------------------------------------------------------------------------

function htmlProduto(c) {
  const q = cli.qtd.get(c.id) ?? 0;
  const prazo = c.prazoDias === 1 ? 'Peça com 1 dia de antecedência' : `Peça com ${c.prazoDias} dias de antecedência`;
  return `
    <li class="prod-cli${q ? ' prod-cli--escolhido' : ''}${c.disponivel ? '' : ' prod-cli--indisponivel'}" data-produto-cli="${esc(c.id)}">
      <div class="prod-cli__info">
        <strong class="prod-cli__nome">${esc(c.nome)}</strong>
        <span class="prod-cli__descricao">${esc(c.descricao)}</span>
        <span class="prod-cli__linha"><strong class="prod-cli__preco">${fmtMoeda(c.preco)}</strong> <span class="sub">por ${esc(c.rotulo)}</span></span>
        <span class="prazo-chip${c.prazoDias >= 5 ? ' prazo-chip--longo' : ''}">${c.disponivel ? esc(prazo) : 'Indisponível no momento'}</span>
      </div>
      ${c.disponivel ? `
      <div class="stepper" role="group" aria-label="Quantidade de ${esc(c.nome)}">
        <button type="button" class="stepper__botao" data-menos="${esc(c.id)}" aria-label="Tirar um ${esc(c.nome)}"${q ? '' : ' disabled'}>−</button>
        <output class="stepper__valor" aria-live="polite">${q}</output>
        <button type="button" class="stepper__botao" data-mais="${esc(c.id)}" aria-label="Pôr mais um ${esc(c.nome)}">+</button>
      </div>` : ''}
    </li>`;
}

// ---- Calendário -----------------------------------------------------------------------------------------

const ROTULO_DIA = {
  livre: '', poucas: 'últimas vagas', lotado: 'lotado', antecedencia: '', passado: '', bloqueado: 'sem encomenda', fechado: 'fechado',
};

function htmlCalendario(itens) {
  const hoje = new Date();
  const t0 = iso(hoje);
  const primeiroDoMes = cli.mes ?? `${t0.slice(0, 7)}-01`;
  const d1 = deIso(primeiroDoMes);
  const vazios = d1.getDay();
  const diasNoMes = new Date(d1.getFullYear(), d1.getMonth() + 1, 0).getDate();
  const limite = somarDias(t0, config.horizonteDias);
  const anterior = iso(new Date(d1.getFullYear(), d1.getMonth() - 1, 1));
  const proximo = iso(new Date(d1.getFullYear(), d1.getMonth() + 1, 1));
  const podeVoltar = anterior >= `${t0.slice(0, 7)}-01`;
  const podeAvancar = proximo <= limite;

  const celulas = [];
  for (let i = 0; i < vazios; i += 1) celulas.push('<span class="cal-cli__vazio"></span>');
  for (let n = 1; n <= diasNoMes; n += 1) {
    const t = `${primeiroDoMes.slice(0, 8)}${String(n).padStart(2, '0')}`;
    const disp = t > limite ? { status: 'passado', motivo: 'Fora do período de encomendas.' } : disponibilidadeDoDia(t, itens, hoje);
    const clicavel = dataPodeSerEscolhida(disp);
    celulas.push(`
      <button type="button" class="cal-cli__dia cal-cli__dia--${disp.status}${cli.data === t ? ' cal-cli__dia--escolhido' : ''}${t === t0 ? ' cal-cli__dia--hoje' : ''}"
        ${clicavel ? `data-dia="${t}"` : 'disabled'} aria-label="${esc(formatarLongo(t))}: ${esc(clicavel ? (disp.status === 'poucas' ? 'últimas vagas' : 'disponível') : (disp.motivo || 'indisponível'))}"${cli.data === t ? ' aria-pressed="true"' : ''}>
        <span class="cal-cli__numero">${n}</span><span class="cal-cli__nota">${esc(ROTULO_DIA[disp.status] ?? '')}</span>
      </button>`);
  }
  return `
    <div class="cal-cli" role="group" aria-label="Escolha a data">
      <div class="cal-cli__topo">
        <button type="button" class="stepper__botao" data-mes="${anterior}" aria-label="Mês anterior"${podeVoltar ? '' : ' disabled'}>‹</button>
        <strong>${MESES[d1.getMonth()].replace(/^./, (c) => c.toUpperCase())} de ${d1.getFullYear()}</strong>
        <button type="button" class="stepper__botao" data-mes="${proximo}" aria-label="Próximo mês"${podeAvancar ? '' : ' disabled'}>›</button>
      </div>
      <div class="cal-cli__semana" aria-hidden="true">${SEMANA.map((s) => `<span>${s}</span>`).join('')}</div>
      <div class="cal-cli__grade">${celulas.join('')}</div>
      <ul class="cal-cli__legenda"><li><i class="cal-cli__chave cal-cli__chave--livre"></i> disponível</li><li><i class="cal-cli__chave cal-cli__chave--poucas"></i> últimas vagas</li><li><i class="cal-cli__chave cal-cli__chave--lotado"></i> lotado ou indisponível</li></ul>
    </div>`;
}

// ---- Resumo e envio -----------------------------------------------------------------------------------------

function htmlResumo(itens) {
  if (itens.length === 0) return '';
  const total = totalDosItens(itens);
  const sinal = sinalDe(total);
  const linhas = itens.map((i) => { const c = catalogoPorId(i.catalogoId); return `<li><span>${esc(rotuloQtd(c, i.qtd))} · ${esc(c.nome)}</span><strong>${fmtMoeda(i.qtd * c.preco)}</strong></li>`; }).join('');
  return `
    <section class="cartao resumo-cli" aria-label="Resumo da encomenda">
      <h2>Resumo</h2>
      <ul class="resumo-cli__lista">${linhas}</ul>
      <dl class="totais">
        <div class="totais__linha totais__linha--forte"><dt>Total</dt><dd>${fmtMoeda(total)}</dd></div>
        <div class="totais__linha"><dt>Sinal para confirmar (${config.sinalPct}%)</dt><dd>${fmtMoeda(sinal)}</dd></div>
        <div class="totais__linha"><dt>A pagar na ${cli.tipo === 'entrega' ? 'entrega' : 'retirada'}</dt><dd>${fmtMoeda(total - sinal)}</dd></div>
      </dl>
      <p class="sub">${cli.data ? `${cli.tipo === 'entrega' ? 'Entrega' : 'Retirada'} em ${esc(formatarLongo(cli.data))}${cli.hora ? `, às ${esc(cli.hora)}` : ''}.` : 'Escolha a data para continuar.'}
        A encomenda só vale depois que a padaria confirmar o sinal.</p>
      <p class="manual__erro" role="alert" data-erro>${esc(cli.erro)}</p>
      <button type="submit" class="botao botao--primario botao--grande botao--cheio">Enviar encomenda</button>
    </section>`;
}

function htmlPedido() {
  const itens = itensDoPedido();
  const { dias, por } = prazoDoPedido(itens);
  const primeira = itens.length ? primeiraDataLivre(itens) : null;
  const pedeTema = itens.some((i) => catalogoPorId(i.catalogoId).pedeTema);
  return `
    <form class="cliente__form" data-form-pedido novalidate>
      <section class="passo" aria-labelledby="p1"><h2 id="p1"><span class="passo__n">1</span> O que você quer encomendar?</h2>
        <ul class="prods-cli">${CATALOGO.map(htmlProduto).join('')}</ul>
      </section>

      <section class="passo" aria-labelledby="p2"><h2 id="p2"><span class="passo__n">2</span> Quando?</h2>
        ${itens.length === 0 ? '<p class="sub">Escolha um produto para ver as datas em que dá para encomendar.</p>' : `
          <p class="aviso-prazo" role="status"><strong>Para o seu pedido,</strong> ${por ? `${esc(por.nome)} precisa de <strong>${dias} ${dias === 1 ? 'dia' : 'dias'} de antecedência</strong>. ` : ''}${primeira ? `A primeira data disponível é <strong>${esc(formatarLongo(primeira))}</strong>.` : 'Não há datas disponíveis no período. Fale com a padaria.'}</p>
          ${htmlCalendario(itens)}
          <div class="janela__grade">
            <label><span class="rotulo-pequeno">Horário</span>
              <select class="campo" name="hora" data-hora><option value="">Escolha…</option>${horariosDisponiveis().map((h) => `<option${h === cli.hora ? ' selected' : ''}>${h}</option>`).join('')}</select></label>
            <fieldset class="painel-nota__resposta"><legend class="rotulo-pequeno">Como quer receber?</legend>
              <label class="opcao-resposta"><input type="radio" name="tipo" value="retirada"${cli.tipo === 'retirada' ? ' checked' : ''}> <span>Retirar na padaria</span></label>
              <label class="opcao-resposta"><input type="radio" name="tipo" value="entrega"${cli.tipo === 'entrega' ? ' checked' : ''}> <span>Entrega</span></label>
            </fieldset>
            ${cli.tipo === 'entrega' ? `<label class="janela__largo"><span class="rotulo-pequeno">Endereço de entrega</span><input class="campo" name="endereco" data-endereco value="${esc(cli.endereco)}" autocomplete="street-address" maxlength="140"><span class="sub">A taxa de entrega é combinada com a padaria.</span></label>` : ''}
          </div>`}
      </section>

      <section class="passo" aria-labelledby="p3"><h2 id="p3"><span class="passo__n">3</span> Seus dados</h2>
        <div class="janela__grade">
          <label><span class="rotulo-pequeno">Seu nome</span><input class="campo" name="nome" data-nome value="${esc(cli.nome)}" autocomplete="name" maxlength="80"></label>
          <label><span class="rotulo-pequeno">Telefone com DDD (WhatsApp)</span><input class="campo" name="telefone" data-telefone type="tel" inputmode="tel" value="${esc(cli.telefone)}" autocomplete="tel" maxlength="20"></label>
          <label class="janela__largo"><span class="rotulo-pequeno">${pedeTema ? 'Tema, cores, mensagem no bolo ou algum pedido especial' : 'Observações (opcional)'}</span>
            <textarea class="campo campo--area" name="obs" data-obs rows="3" maxlength="400">${esc(cli.obs)}</textarea></label>
        </div>
      </section>
      ${htmlResumo(itens)}
    </form>`;
}

// ---- Depois do envio e consulta --------------------------------------------------------------------------------

function htmlStatus(e) {
  const mensagens = {
    aguardando: `A padaria ainda não confirmou. Ela confirma quando receber o sinal de <strong>${fmtMoeda(e.sinal)}</strong>.`,
    confirmada: `Confirmada! Sinal recebido. ${e.tipo === 'entrega' ? 'Entrega' : 'Retirada'} em <strong>${esc(formatarLongo(e.data))}</strong>, às <strong>${esc(e.hora)}</strong>.`,
    pronta: `Sua encomenda está <strong>pronta</strong>. ${e.tipo === 'entrega' ? 'Ela sairá para entrega no horário combinado.' : 'Pode retirar na padaria.'}`,
    entregue: 'Esta encomenda já foi retirada ou entregue. Obrigado!',
    cancelada: 'Esta encomenda foi cancelada. Fale com a padaria se tiver dúvida.',
  };
  return `
    <article class="cartao status-cli status-cli--${e.status}" aria-live="polite">
      <span class="selo">${esc(STATUS[e.status])}</span>
      <h2>Encomenda ${esc(e.codigo)}</h2>
      <p>${mensagens[e.status]}</p>
      <ul class="resumo-cli__lista">${e.itens.map((i) => `<li><span>${i.qtd} × ${esc(i.nome)}</span><strong>${fmtMoeda(i.qtd * i.preco)}</strong></li>`).join('')}</ul>
      <p class="sub">Total ${fmtMoeda(e.total)} · sinal ${fmtMoeda(e.sinal)} ${e.sinalPago ? '(recebido)' : '(a pagar)'}${e.obs ? ` · ${esc(e.obs)}` : ''}</p>
    </article>`;
}

function htmlEnviada() {
  const e = cli.enviada;
  return `
    <section class="cartao enviada" role="status">
      <span class="selo selo--aguardando">Encomenda recebida</span>
      <h2>Recebemos o seu pedido!</h2>
      <p class="enviada__codigo">${esc(e.codigo)}</p>
      <p>Guarde este código. Com ele e o seu telefone você acompanha a encomenda na aba "Consultar".</p>
      <p class="conferencia conferencia--alerta"><strong>Ainda não está confirmada.</strong> Para garantir a data, pague o sinal de <strong>${fmtMoeda(e.sinal)}</strong> por Pix e a padaria confirma a sua encomenda.<br>
        Chave Pix (exemplo): <strong>${esc(config.chavePix)}</strong></p>
    </section>
    ${htmlStatus(e)}
    <button type="button" class="botao botao--secundario botao--cheio" data-nova>Fazer outra encomenda</button>`;
}

function htmlConsultar() {
  const c = cli.consulta;
  const achado = c.achou ? consultar(c.codigo, c.telefone) : null;
  return `
    <form class="cartao" data-form-consulta novalidate>
      <h2>Consultar minha encomenda</h2>
      <div class="janela__grade">
        <label><span class="rotulo-pequeno">Código da encomenda</span><input class="campo" name="codigo" value="${esc(c.codigo)}" placeholder="DB-1234" autocapitalize="characters" autocomplete="off"></label>
        <label><span class="rotulo-pequeno">Telefone usado no pedido</span><input class="campo" name="telefone" type="tel" inputmode="tel" value="${esc(c.telefone)}" autocomplete="tel"></label>
      </div>
      <button type="submit" class="botao botao--primario botao--cheio">Consultar</button>
      ${c.achou === false ? '<p class="manual__erro" role="alert">Não encontramos uma encomenda com este código e telefone. Confira os dados ou fale com a padaria.</p>' : ''}
    </form>
    ${achado ? htmlStatus(achado) : ''}`;
}

// ---- Montagem e eventos -----------------------------------------------------------------------------------------

export function iniciarEncomendar(conteudo) {
  const raiz = conteudo.querySelector('[data-cliente]');
  const desenhar = () => {
    raiz.innerHTML = `
      <header class="cliente__topo">
        <img class="cliente__logo" src="assets/logo.png" alt="Dom Bosco Padaria e Pizzaria">
        <div><h1>Encomendas</h1><p class="sub">Escolha o produto, a data e envie. Sem cadastro.</p></div>
      </header>
      <nav class="abas abas--cli" aria-label="Encomenda">
        <button type="button" class="aba" data-aba="pedido"${cli.aba === 'pedido' ? ' aria-current="page"' : ''}>Fazer encomenda</button>
        <button type="button" class="aba" data-aba="consultar"${cli.aba === 'consultar' ? ' aria-current="page"' : ''}>Consultar encomenda</button>
      </nav>
      ${cli.aba === 'consultar' ? htmlConsultar() : cli.enviada ? htmlEnviada() : htmlPedido()}
      <p class="rodape-nota cliente__rodape">Piloto de demonstração: esta página mostra como o cliente encomendaria. <a class="link" href="#/encomendas">← Voltar à agenda da padaria</a></p>`;
  };
  const refazer = (foco) => { desenhar(); if (foco) raiz.querySelector(foco)?.focus(); };
  desenhar();

  raiz.addEventListener('click', (e) => {
    const alvo = (s) => e.target.closest(s);
    const aba = alvo('[data-aba]');
    if (aba) { cli.aba = aba.dataset.aba; return refazer(); }
    const mais = alvo('[data-mais]');
    const menos = alvo('[data-menos]');
    if (mais || menos) {
      const id = (mais ?? menos).dataset.mais ?? (mais ?? menos).dataset.menos;
      cli.qtd.set(id, Math.max(0, (cli.qtd.get(id) ?? 0) + (mais ? 1 : -1)));
      // Se a data escolhida deixou de valer com o novo pedido, ela é desmarcada.
      if (cli.data && !dataPodeSerEscolhida(disponibilidadeDoDia(cli.data, itensDoPedido()))) cli.data = '';
      cli.erro = '';
      return refazer(`[data-${mais ? 'mais' : 'menos'}="${id}"]`);
    }
    const dia = alvo('[data-dia]');
    if (dia) { cli.data = dia.dataset.dia; cli.erro = ''; return refazer(`[data-dia="${cli.data}"]`); }
    const mes = alvo('[data-mes]');
    if (mes) { cli.mes = mes.dataset.mes; return refazer(`[data-mes="${mes.dataset.mes}"]`); }
    if (alvo('[data-nova]')) {
      Object.assign(cli, { qtd: new Map(), data: '', hora: '', obs: '', enviada: null, erro: '', aba: 'pedido' });
      return refazer();
    }
  });

  raiz.addEventListener('input', (e) => {
    if (e.target.matches('[data-nome]')) cli.nome = e.target.value;
    else if (e.target.matches('[data-telefone]')) cli.telefone = e.target.value;
    else if (e.target.matches('[data-endereco]')) cli.endereco = e.target.value;
    else if (e.target.matches('[data-obs]')) cli.obs = e.target.value;
  });

  raiz.addEventListener('change', (e) => {
    if (e.target.matches('[data-hora]')) cli.hora = e.target.value;
    else if (e.target.matches('[name="tipo"]')) { cli.tipo = e.target.value; refazer('[name="tipo"]:checked'); }
  });

  raiz.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.matches('[data-form-consulta]')) {
      cli.consulta = { codigo: e.target.elements.codigo.value, telefone: e.target.elements.telefone.value, achou: false };
      cli.consulta.achou = Boolean(consultar(cli.consulta.codigo, cli.consulta.telefone));
      return refazer();
    }
    try {
      cli.enviada = criarEncomenda({
        nome: cli.nome, telefone: cli.telefone, itens: itensDoPedido(), data: cli.data, hora: cli.hora, tipo: cli.tipo, endereco: cli.endereco, obs: cli.obs, canal: 'site',
      });
      cli.erro = '';
      refazer();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (erro) {
      cli.erro = erro.message;
      // Se a data lotou enquanto a página estava aberta, ela some do calendário.
      if (cli.data && !dataPodeSerEscolhida(disponibilidadeDoDia(cli.data, itensDoPedido()))) cli.data = '';
      refazer();
      raiz.querySelector('[data-erro]')?.scrollIntoView({ block: 'center' });
    }
  });
}
