// Piloto Dom Bosco — navegação entre as áreas.
// As telas reais entram etapa por etapa (Estoque e leitura de XML em Compras já estão prontos).

import { telaDados } from './tela-dados.js';
import { telaEstoque, iniciarEstoque } from './tela-estoque.js';
import { telaCompras, iniciarCompras } from './tela-compras.js';
import { telaPainel, iniciarPainel } from './tela-painel.js';
import { criarEncomendasDeExemplo } from './encomendas.js';
import { telaEncomendas, iniciarEncomendas, atualizarNumeroDoMenu } from './tela-encomendas.js';
import { telaEncomendar, iniciarEncomendar } from './tela-encomendar.js';
import { telaProducao, iniciarProducao } from './tela-producao.js';
import { telaGastos, iniciarGastos } from './tela-gastos.js';
import { telaBalcao, iniciarBalcao } from './tela-balcao.js';
import { telaPrecificacao, iniciarPrecificacao } from './tela-precificacao.js';
import { telaInsumos, iniciarInsumos, telaFornecedores, iniciarFornecedores } from './tela-cadastros.js';

// "corpo" pode ser um texto HTML ou uma função que devolve o HTML.
// "aoMostrar" (opcional) roda depois que o HTML entra na página, para ligar os eventos.
const telas = {
  painel: {
    titulo: 'Painel',
    descricao: 'O que pede a sua atenção hoje, as vendas do dia e o que pesa no custo.',
    corpo: telaPainel,
    aoMostrar: iniciarPainel,
  },
  'dados-exemplo': {
    titulo: 'Dados de exemplo',
    descricao: 'Tela temporária para conferir os dados fictícios do piloto.',
    corpo: telaDados,
  },
  compras: {
    titulo: 'Compras',
    descricao: 'Envie a nota fiscal e veja o que foi lido.',
    corpo: telaCompras,
    aoMostrar: iniciarCompras,
  },
  insumos: {
    titulo: 'Insumos',
    descricao: 'Cadastro do que a padaria compra: embalagem, unidade de controle e fornecedor.',
    corpo: telaInsumos,
    aoMostrar: iniciarInsumos,
  },
  fornecedores: {
    titulo: 'Fornecedores',
    descricao: 'Quem vende para a padaria: CNPJ, contato, comprovante e prazo de entrega.',
    corpo: telaFornecedores,
    aoMostrar: iniciarFornecedores,
  },
  encomendas: {
    titulo: 'Encomendas',
    descricao: 'Calendário das encomendas, o que precisa da sua resposta e o que cada dia exige da cozinha.',
    corpo: telaEncomendas,
    aoMostrar: iniciarEncomendas,
  },
  // Página PÚBLICA, sem login: o que o cliente vê. Sem menu e sem o cabeçalho do sistema.
  encomendar: {
    titulo: 'Encomendas',
    descricao: '',
    publica: true,
    corpo: telaEncomendar,
    aoMostrar: iniciarEncomendar,
  },
  producao: {
    titulo: 'Produção',
    descricao: 'Meta do dia, fornadas, sobras e a conciliação do fim do dia.',
    corpo: telaProducao,
    aoMostrar: iniciarProducao,
  },
  gastos: {
    titulo: 'Gastos gerais',
    descricao: 'Energia, gás, folha e outros gastos, e como entram no custo e na margem de cada produto.',
    corpo: telaGastos,
    aoMostrar: iniciarGastos,
  },
  balcao: {
    titulo: 'Balcão',
    descricao: 'Simulação do pedido, do caixa e do relatório de vendas.',
    corpo: telaBalcao,
    aoMostrar: iniciarBalcao,
  },
  precificacao: {
    titulo: 'Precificação',
    descricao: 'Fichas técnicas, custo e preço de cada produto, com a conta aberta.',
    corpo: telaPrecificacao,
    aoMostrar: iniciarPrecificacao,
  },
  estoque: {
    titulo: 'Estoque',
    descricao: 'Saldo de cada insumo, validade e alertas.',
    corpo: telaEstoque,
    aoMostrar: iniciarEstoque,
  },
};

const ROTA_PADRAO = 'painel';

// O painel e a agenda começam com encomendas de exemplo (inventadas), para terem o que mostrar. Dá para tirá-las na tela Encomendas.
criarEncomendasDeExemplo();
const conteudo = document.getElementById('conteudo');
const itensMenu = document.querySelectorAll('.menu__item');

// "#/precificacao/pizza-g" → tela "precificacao" com o parâmetro "pizza-g".
function rotaAtual() {
  const [nome, ...resto] = location.hash.replace(/^#\//, '').split('/');
  return telas[nome] ? { nome, parametro: decodeURIComponent(resto.join('/')) } : { nome: ROTA_PADRAO, parametro: '' };
}

function mostrar() {
  const { nome, parametro } = rotaAtual();
  const tela = telas[nome];

  // A página pública (do cliente) não mostra o menu nem o cabeçalho do sistema.
  document.body.classList.toggle('modo-cliente', Boolean(tela.publica));
  conteudo.innerHTML = `
    ${tela.publica ? '' : `<header class="pagina__topo">
      <h1>${tela.titulo}</h1>
      <p>${tela.descricao}</p>
    </header>`}
    ${typeof tela.corpo === 'function' ? tela.corpo() : tela.corpo}`;

  if (tela.aoMostrar) tela.aoMostrar(conteudo, parametro);

  itensMenu.forEach((item) => {
    if (item.dataset.rota === nome) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });

  atualizarNumeroDoMenu();

  document.title = `${tela.titulo} · Dom Bosco${tela.publica ? '' : ' · Piloto'}`;
}

window.addEventListener('hashchange', mostrar);
mostrar();
