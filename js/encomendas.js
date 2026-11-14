// Encomendas (etapa 15). Módulo sem DOM: dá para testar no Node.
//
// DOIS LADOS DO MESMO ASSUNTO:
//   - o CLIENTE (sem login) vê o catálogo de encomenda, o prazo mínimo de cada produto e só as datas em que dá para pedir;
//   - a PROPRIETÁRIA vê o calendário, confirma o sinal, acompanha o preparo e vê os insumos que cada dia exige.
// As regras abaixo (prazo mínimo, limite por dia, sinal, dias bloqueados) são HIPÓTESES [P] da pendência 7 da Fase 1.
// Todos os produtos, preços, prazos, clientes e encomendas de exemplo são INVENTADOS. Nada é gravado.

import { buscarProduto, custoUnitario } from './produtos.js';
import { consumoDeInsumos } from './producao.js';
import { buscarInsumo } from './dados.js';

export const STATUS = {
  aguardando: 'Aguardando confirmação',
  confirmada: 'Confirmada (sinal recebido)',
  pronta: 'Pronta',
  entregue: 'Retirada / entregue',
  cancelada: 'Cancelada',
};
export const CANAIS = { site: 'Site (o próprio cliente)', whatsapp: 'WhatsApp', telefone: 'Telefone', balcao: 'Balcão' };

export const config = {
  sinalPct: 50, // % do total pago para confirmar
  limiteGeralDia: 10, // máximo de encomendas por dia, somando tudo
  horaAbertura: 8,
  horaFechamento: 18,
  diasFechadosSemana: [], // 0 = domingo ... 6 = sábado
  diasBloqueados: new Set(), // datas "AAAA-MM-DD" em que não se recebe encomenda (feriado, folga)
  horizonteDias: 90, // até quantos dias à frente o cliente enxerga
  chavePix: 'chave-pix-de-exemplo@dombosco.exemplo',
};

// ---- Catálogo de encomenda ---------------------------------------------------------------------------
// Cada item aponta para um produto com ficha técnica (é daí que vêm o custo e os insumos).
// `unidadesPorPedido` = quantas unidades do produto base cabem em 1 unidade encomendada (ex.: 1 bolo inteiro = 14 fatias).

const C = (id, nome, descricao, produtoId, unidadesPorPedido, rotulo, preco, prazoDias, limiteDia, extra = {}) => ({
  id, nome, descricao, produtoId, unidadesPorPedido, rotulo, preco, prazoDias, limiteDia, disponivel: true, pedeTema: false, ...extra,
});

export const CATALOGO = [
  C('bolo-casamento', 'Bolo de casamento decorado', 'Bolo de 2 andares com decoração sob medida. Serve cerca de 40 fatias. Informe o tema e as cores.', 'bolo-casamento', 40, 'bolo', 380, 7, 1, { pedeTema: true }),
  C('bolo-macaxeira-inteiro', 'Bolo de macaxeira inteiro', 'O bolo de macaxeira da vitrine, inteiro e embalado. Serve 14 fatias.', 'bolo-macaxeira', 14, 'bolo', 70, 2, 6),
  C('pizza-carne-sol-g', 'Pizza de carne de sol cremosa G', 'Pizza grande de carne de sol com creme de leite e catupiry.', 'pizza-carne-sol-g', 1, 'pizza', 68, 1, 15),
  C('pizza-mussarela-g', 'Pizza de mussarela G', 'Pizza grande de mussarela. Boa para festas e reuniões.', 'pizza-mussarela-g', 1, 'pizza', 58, 1, 15),
  C('cento-rosquinha', 'Cento de rosquinhas de polvilho', '100 rosquinhas de polvilho doce, em embalagem para festa.', 'rosquinha-polvilho', 100, 'cento', 120, 2, 3),
  C('cento-mini-pao', 'Cento de mini pães com queijo e presunto', '100 mini pães recheados, prontos para servir.', 'mini-pao-queijo-presunto', 100, 'cento', 600, 3, 2),
];
export const catalogoPorId = (id) => CATALOGO.find((c) => c.id === id) ?? null;

// ---- Datas (sempre "AAAA-MM-DD", no horário local) ---------------------------------------------------------

export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const deIso = (t) => { const [a, m, d] = t.split('-').map(Number); return new Date(a, m - 1, d); };
export const somarDias = (t, n) => { const d = deIso(t); d.setDate(d.getDate() + n); return iso(d); };
export const diasEntre = (de, ate) => Math.round((deIso(ate) - deIso(de)) / 86_400_000);
export const diaDaSemana = (t) => deIso(t).getDay();
const arredondar = (v) => Math.round(v * 100) / 100;
const digitos = (t) => String(t ?? '').replace(/\D/g, '');

// ---- Encomendas --------------------------------------------------------------------------------------------

export const ENCOMENDAS = [];
let sequencia = 1040;

const ativas = (e) => e.status !== 'cancelada';
const doDia = (t) => ENCOMENDAS.filter((e) => e.data === t && ativas(e));

/** Quanto de cada item do catálogo já está reservado em um dia (cancelada libera o lugar). */
export function reservadoNoDia(catalogoId, t) {
  return doDia(t).flatMap((e) => e.itens).filter((i) => i.catalogoId === catalogoId).reduce((s, i) => s + i.qtd, 0);
}

export const totalDosItens = (itens) => arredondar(itens.reduce((s, i) => s + i.qtd * (i.preco ?? catalogoPorId(i.catalogoId).preco), 0));
export const sinalDe = (total) => arredondar((total * config.sinalPct) / 100);

/** Antecedência mínima para um pedido: a maior entre os produtos escolhidos. */
export function prazoDoPedido(itens) {
  const lista = itens.filter((i) => i.qtd > 0).map((i) => catalogoPorId(i.catalogoId));
  if (lista.length === 0) return { dias: 0, por: null };
  const maior = lista.reduce((a, b) => (b.prazoDias > a.prazoDias ? b : a));
  return { dias: maior.prazoDias, por: maior };
}

/**
 * Situação de um dia para um pedido (ou para o catálogo, se `itens` vier vazio):
 *   antecedencia | bloqueado | fechado | lotado | poucas | livre
 */
export function disponibilidadeDoDia(t, itens = [], hoje = new Date()) {
  const escolhidos = itens.filter((i) => i.qtd > 0);
  const { dias, por } = prazoDoPedido(escolhidos);
  const antecedencia = diasEntre(iso(hoje), t);
  if (antecedencia < 0) return { status: 'passado', motivo: 'Esta data já passou.' };
  if (antecedencia < dias) return { status: 'antecedencia', motivo: `${por.nome} precisa de ${dias} ${dias === 1 ? 'dia' : 'dias'} de antecedência: a primeira data é ${formatar(somarDias(iso(hoje), dias))}.` };
  if (config.diasBloqueados.has(t)) return { status: 'bloqueado', motivo: 'A padaria não recebe encomendas neste dia.' };
  if (config.diasFechadosSemana.includes(diaDaSemana(t))) return { status: 'fechado', motivo: 'A padaria está fechada neste dia da semana.' };

  const pedidosNoDia = doDia(t).length;
  if (pedidosNoDia >= config.limiteGeralDia) return { status: 'lotado', motivo: 'O dia está com todas as encomendas que a padaria consegue fazer.' };
  let apertado = pedidosNoDia >= config.limiteGeralDia * 0.8;
  for (const i of escolhidos) {
    const c = catalogoPorId(i.catalogoId);
    const livre = c.limiteDia - reservadoNoDia(c.id, t);
    if (i.qtd > livre) return { status: 'lotado', motivo: livre <= 0 ? `${c.nome} já está esgotado neste dia.` : `Neste dia só dá para fazer mais ${livre} ${c.rotulo === 'bolo' ? (livre === 1 ? 'bolo' : 'bolos') : c.rotulo} de ${c.nome}.` };
    // Item de vaga única (ex.: bolo de casamento) não é "poucas vagas": ou tem a vaga ou não tem.
    if (c.limiteDia >= 3 && c.limiteDia - reservadoNoDia(c.id, t) - i.qtd <= Math.max(1, Math.floor(c.limiteDia * 0.2))) apertado = true;
  }
  return apertado ? { status: 'poucas', motivo: 'Poucas vagas neste dia.' } : { status: 'livre', motivo: '' };
}

export const dataPodeSerEscolhida = (d) => d.status === 'livre' || d.status === 'poucas';

/** Primeira data em que o pedido cabe (a partir da antecedência mínima). */
export function primeiraDataLivre(itens, hoje = new Date()) {
  const { dias } = prazoDoPedido(itens);
  for (let n = dias; n <= config.horizonteDias; n += 1) {
    const t = somarDias(iso(hoje), n);
    if (dataPodeSerEscolhida(disponibilidadeDoDia(t, itens, hoje))) return t;
  }
  return null;
}

export const horariosDisponiveis = () => {
  const h = [];
  for (let x = config.horaAbertura; x <= config.horaFechamento; x += 1) { h.push(`${String(x).padStart(2, '0')}:00`); if (x < config.horaFechamento) h.push(`${String(x).padStart(2, '0')}:30`); }
  return h;
};

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const nomeDoDia = (t) => WEEKDAYS[diaDaSemana(t)];
export function formatar(t) { const d = deIso(t); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; }
export function formatarLongo(t) { const d = deIso(t); return `${nomeDoDia(t)}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; }

/**
 * Cria a encomenda depois de conferir tudo de novo (o cliente pode ter deixado a tela aberta e o dia lotar).
 * `ignorarLimites`: a proprietária aceita mesmo com o dia cheio ou sem a antecedência. O cliente nunca tem isso.
 */
export function criarEncomenda(dados, { hoje = new Date(), ignorarLimites = false, confirmada = false } = {}) {
  const nome = String(dados.nome ?? '').replace(/\s+/g, ' ').trim();
  if (!nome) throw new Error('Informe o seu nome.');
  if (digitos(dados.telefone).length < 10) throw new Error('Informe um telefone com DDD, para a padaria poder falar com você.');
  const itens = (dados.itens ?? []).filter((i) => i.qtd > 0);
  if (itens.length === 0) throw new Error('Escolha pelo menos um produto.');
  for (const i of itens) {
    const c = catalogoPorId(i.catalogoId);
    if (!c) throw new Error('Produto não encontrado.');
    if (!c.disponivel && !ignorarLimites) throw new Error(`${c.nome} não está disponível para encomenda agora.`);
  }
  if (!dados.data) throw new Error('Escolha a data.');
  const disp = disponibilidadeDoDia(dados.data, itens, hoje);
  if (!ignorarLimites && !dataPodeSerEscolhida(disp)) throw new Error(disp.motivo || 'Esta data não está disponível.');
  if (ignorarLimites && (disp.status === 'passado')) throw new Error(disp.motivo);
  if (!dados.hora || !horariosDisponiveis().includes(dados.hora)) throw new Error('Escolha o horário.');
  if (dados.tipo === 'entrega' && !String(dados.endereco ?? '').trim()) throw new Error('Informe o endereço de entrega.');

  const linhas = itens.map((i) => { const c = catalogoPorId(i.catalogoId); return { catalogoId: c.id, nome: c.nome, qtd: Math.round(i.qtd), preco: c.preco, produtoId: c.produtoId, unidadesPorPedido: c.unidadesPorPedido, rotulo: c.rotulo }; });
  const total = totalDosItens(linhas);
  const sinal = sinalDe(total);
  sequencia += 1;
  const encomenda = {
    codigo: `DB-${sequencia}`, cliente: { nome, telefone: digitos(dados.telefone) }, canal: dados.canal ?? 'site', itens: linhas,
    data: dados.data, hora: dados.hora, tipo: dados.tipo === 'entrega' ? 'entrega' : 'retirada', endereco: String(dados.endereco ?? '').trim(),
    obs: String(dados.obs ?? '').trim(), total, sinal, sinalPago: confirmada, status: confirmada ? 'confirmada' : 'aguardando',
    criadoEm: new Date(), exemplo: false, aceitaForaDoLimite: ignorarLimites && !dataPodeSerEscolhida(disp),
  };
  ENCOMENDAS.push(encomenda);
  return encomenda;
}

const TRANSICOES = {
  aguardando: ['confirmada', 'cancelada'],
  confirmada: ['pronta', 'cancelada'],
  pronta: ['entregue', 'confirmada'],
  entregue: [],
  cancelada: ['aguardando'],
};
export const proximosStatus = (e) => TRANSICOES[e.status] ?? [];

export function mudarStatus(encomenda, novo) {
  if (!TRANSICOES[encomenda.status]?.includes(novo)) throw new Error('Esta mudança não é possível.');
  encomenda.status = novo;
  if (novo === 'confirmada') encomenda.sinalPago = true;
  if (novo === 'aguardando') encomenda.sinalPago = false;
}

export function consultar(codigo, telefone) {
  const c = String(codigo ?? '').trim().toUpperCase();
  const t = digitos(telefone);
  return ENCOMENDAS.find((e) => e.codigo === c && e.cliente.telefone === t) ?? null;
}

export const aguardando = () => ENCOMENDAS.filter((e) => e.status === 'aguardando').sort((a, b) => a.data.localeCompare(b.data));

// ---- Calendário e dia ------------------------------------------------------------------------------------------------

/** Resumo de um dia para o calendário da proprietária. */
export function resumoDoDia(t) {
  const lista = doDia(t);
  return {
    data: t, total: lista.length,
    aguardando: lista.filter((e) => e.status === 'aguardando').length,
    confirmadas: lista.filter((e) => e.status === 'confirmada' || e.status === 'pronta').length,
    entregues: lista.filter((e) => e.status === 'entregue').length,
    cheio: lista.length >= config.limiteGeralDia,
    bloqueado: config.diasBloqueados.has(t) || config.diasFechadosSemana.includes(diaDaSemana(t)),
  };
}

export const encomendasDoDia = (t, comCanceladas = false) => ENCOMENDAS.filter((e) => e.data === t && (comCanceladas || ativas(e))).sort((a, b) => a.hora.localeCompare(b.hora));

/** O que produzir naquele dia: unidades de cada produto base, somando as encomendas confirmadas (e as prontas). */
export function ordemDeProducao(t) {
  const mapa = new Map();
  for (const e of doDia(t).filter((x) => x.status === 'confirmada' || x.status === 'pronta' || x.status === 'entregue')) {
    for (const i of e.itens) {
      const m = mapa.get(i.catalogoId) ?? { catalogoId: i.catalogoId, nome: i.nome, rotulo: i.rotulo, qtd: 0, unidadesBase: 0, produtoId: i.produtoId, horaMaisCedo: e.hora, pedidos: 0 };
      m.qtd += i.qtd; m.unidadesBase += i.qtd * i.unidadesPorPedido; m.pedidos += 1;
      if (e.hora < m.horaMaisCedo) m.horaMaisCedo = e.hora;
      mapa.set(i.catalogoId, m);
    }
  }
  return [...mapa.values()].sort((a, b) => a.horaMaisCedo.localeCompare(b.horaMaisCedo) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Insumos que o dia exige (pelas fichas) comparados com o saldo atual do Estoque. Só encomendas confirmadas, prontas ou entregues. */
export function insumosDoDia(t) {
  const total = new Map();
  for (const linha of ordemDeProducao(t)) {
    const base = buscarProduto(linha.produtoId);
    if (!base) continue;
    for (const [id, q] of consumoDeInsumos(base, linha.unidadesBase)) total.set(id, (total.get(id) ?? 0) + q);
  }
  return [...total].map(([insumoId, qtd]) => {
    const insumo = buscarInsumo(insumoId);
    const saldo = insumo?.estoque.saldo ?? 0;
    return { insumoId, nome: insumo?.nome ?? '(removido)', uso: insumo?.uso ?? 'un', qtd, saldo, falta: Math.max(0, qtd - saldo) };
  }).sort((a, b) => b.falta - a.falta || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Insumos que as encomendas confirmadas dos próximos `n` dias exigem, somados, contra o saldo de hoje.
 * Avisa o que vai faltar a tempo de comprar. Não considera compras nem produção do meio do caminho.
 */
export function insumosDosProximosDias(n = 7, hoje = new Date()) {
  const total = new Map();
  const primeiroDia = new Map();
  for (let k = 0; k < n; k += 1) {
    const t = somarDias(iso(hoje), k);
    for (const i of insumosDoDia(t)) {
      const m = total.get(i.insumoId) ?? { ...i, qtd: 0 };
      m.qtd += i.qtd;
      total.set(i.insumoId, m);
      if (!primeiroDia.has(i.insumoId)) primeiroDia.set(i.insumoId, t);
    }
  }
  return [...total.values()].map((m) => ({ insumoId: m.insumoId, nome: m.nome, uso: m.uso, qtd: m.qtd, saldo: m.saldo, falta: Math.max(0, m.qtd - m.saldo), primeiroDia: primeiroDia.get(m.insumoId) }))
    .sort((a, b) => b.falta - a.falta || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Custo dos ingredientes e margem de um item do catálogo (sem gastos gerais), para ela ajustar o preço. */
export function custoDoItem(c) {
  const base = buscarProduto(c.produtoId);
  if (!base) return null;
  const custo = custoUnitario(base).total * c.unidadesPorPedido;
  return { custo, margem: c.preco > 0 ? (c.preco - custo) / c.preco : null, incompleto: custoUnitario(base).incompleto };
}

// ---- Dados de exemplo (inventados) ---------------------------------------------------------------------------------------

/** Cria encomendas de exemplo espalhadas pelas próximas semanas, para o calendário ter o que mostrar. */
export function criarEncomendasDeExemplo(hoje = new Date()) {
  removerExemplos();
  const t0 = iso(hoje);
  const E = (offset, hora, nome, tel, itens, status, canal, tipo = 'retirada', obs = '') => {
    const linhas = itens.map(([id, qtd]) => { const c = catalogoPorId(id); return { catalogoId: id, nome: c.nome, qtd, preco: c.preco, produtoId: c.produtoId, unidadesPorPedido: c.unidadesPorPedido, rotulo: c.rotulo }; });
    const total = totalDosItens(linhas);
    sequencia += 1;
    ENCOMENDAS.push({
      codigo: `DB-${sequencia}`, cliente: { nome: `${nome} (exemplo)`, telefone: tel }, canal, itens: linhas, data: somarDias(t0, offset), hora, tipo,
      endereco: tipo === 'entrega' ? 'Rua de exemplo, 100 (inventado)' : '', obs, total, sinal: sinalDe(total), sinalPago: status !== 'aguardando', status,
      criadoEm: new Date(), exemplo: true, aceitaForaDoLimite: false,
    });
  };
  E(0, '10:00', 'Marina', '81999990001', [['bolo-macaxeira-inteiro', 1]], 'pronta', 'whatsapp');
  E(1, '16:00', 'Paulo', '81999990002', [['pizza-carne-sol-g', 3], ['pizza-mussarela-g', 2]], 'confirmada', 'telefone', 'entrega');
  E(2, '09:00', 'Aline', '81999990003', [['cento-rosquinha', 2]], 'confirmada', 'balcao');
  E(2, '15:30', 'Carlos', '81999990004', [['bolo-macaxeira-inteiro', 2]], 'aguardando', 'site');
  E(3, '11:00', 'Joana', '81999990005', [['cento-mini-pao', 1], ['cento-rosquinha', 1]], 'confirmada', 'whatsapp');
  E(5, '14:00', 'Rafael', '81999990006', [['pizza-mussarela-g', 6]], 'aguardando', 'site', 'entrega', 'aniversário infantil');
  E(7, '10:00', 'Beatriz', '81999990007', [['bolo-casamento', 1]], 'confirmada', 'balcao', 'retirada', 'tema rústico, flores brancas, mensagem "Ana e Pedro"');
  E(7, '17:00', 'Marcos', '81999990008', [['bolo-macaxeira-inteiro', 1]], 'confirmada', 'telefone');
  E(9, '12:00', 'Luciana', '81999990009', [['cento-mini-pao', 2]], 'confirmada', 'whatsapp');
  E(12, '15:00', 'Eduardo', '81999990010', [['pizza-carne-sol-g', 5]], 'aguardando', 'site');
  E(14, '10:30', 'Fernanda', '81999990011', [['bolo-casamento', 1]], 'confirmada', 'balcao', 'retirada', 'tema azul e dourado');
  E(14, '16:00', 'Sérgio', '81999990012', [['cento-rosquinha', 1]], 'confirmada', 'whatsapp');
  E(21, '09:00', 'Patrícia', '81999990013', [['bolo-macaxeira-inteiro', 3]], 'confirmada', 'telefone');
}

export function removerExemplos() {
  for (let i = ENCOMENDAS.length - 1; i >= 0; i -= 1) if (ENCOMENDAS[i].exemplo) ENCOMENDAS.splice(i, 1);
}

/** Só para testes. */
export function _reiniciar() {
  ENCOMENDAS.length = 0; sequencia = 1040;
  Object.assign(config, { sinalPct: 50, limiteGeralDia: 10, diasFechadosSemana: [], horizonteDias: 90 });
  config.diasBloqueados.clear();
  CATALOGO.forEach((c) => { c.disponivel = true; });
}
