// Piloto Dom Bosco — navegação entre as áreas.
// As telas reais entram etapa por etapa (Estoque e leitura de XML em Compras já estão prontos).

import { telaDados } from './tela-dados.js';
import { telaEstoque, iniciarEstoque } from './tela-estoque.js';
import { telaCompras, iniciarCompras } from './tela-compras.js';

// "corpo" pode ser um texto HTML ou uma função que devolve o HTML.
// "aoMostrar" (opcional) roda depois que o HTML entra na página, para ligar os eventos.
const telas = {
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
  estoque: {
    titulo: 'Estoque',
    descricao: 'Saldo de cada insumo, validade e alertas.',
    corpo: telaEstoque,
    aoMostrar: iniciarEstoque,
  },
};

const ROTA_PADRAO = 'compras';
const conteudo = document.getElementById('conteudo');
const itensMenu = document.querySelectorAll('.menu__item');

function rotaAtual() {
  const nome = location.hash.replace(/^#\//, '');
  return telas[nome] ? nome : ROTA_PADRAO;
}

function mostrar() {
  const nome = rotaAtual();
  const tela = telas[nome];

  conteudo.innerHTML = `
    <header class="pagina__topo">
      <h1>${tela.titulo}</h1>
      <p>${tela.descricao}</p>
    </header>
    ${typeof tela.corpo === 'function' ? tela.corpo() : tela.corpo}`;

  if (tela.aoMostrar) tela.aoMostrar(conteudo);

  itensMenu.forEach((item) => {
    if (item.dataset.rota === nome) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });

  document.title = `${tela.titulo} · Dom Bosco · Piloto`;
}

window.addEventListener('hashchange', mostrar);
mostrar();
