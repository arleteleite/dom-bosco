# Piloto Dom Bosco (demonstração)

Protótipo **descartável** do sistema de gestão da Padaria Dom Bosco. Serve para a proprietária navegar, reagir e dizer o que precisa, **não é o sistema final**.

**Sobre os dados:** preços, estoques, vendas, gastos, clientes e encomendas são **inventados**. Duas exceções:
- os **nomes dos insumos** e as **4 fichas técnicas** (bolo de macaxeira, mini pão de queijo e presunto, pizza de carne de sol e rosquinha de polvilho) vêm do sistema atual da padaria (UNIQ), com as quantidades reais, e estão marcadas "a conferir";
- as notas fiscais de teste não são da padaria.

**Nada é gravado:** ao recarregar a página, tudo volta ao início. Não envie documentos reais.

## O que dá para ver

| Tela | O que mostra |
|---|---|
| Painel | O que pede atenção, vendas do dia, padaria × pizzaria, ranking de consumo, preços que variaram |
| Compras | Envio de nota (XML, PDF, foto), conferência, compra sem nota, alerta de variação de preço |
| Estoque, Insumos, Fornecedores | Saldos, validade, cadastros, histórico de preço |
| Precificação | Fichas técnicas, custo com a conta aberta, markup e margens, preço sugerido |
| Gastos gerais | Rateio por 3 métodos lado a lado |
| Produção | Meta, fornadas com baixa de insumos, sobras e conciliação do dia |
| Encomendas | Calendário da proprietária e **página do cliente** (`#/encomendar`, sem login) |
| Balcão | Pedido, caixa e vendas por horário |

## Como testar

1. Abra a página publicada (GitHub Pages).
2. Baixe `exemplos/nota-atacado-ficticia.xml` e envie em **Compras**; aceite as sugestões, confirme a compra e veja o resultado em **Estoque** e no **Painel**.
3. Em **Encomendas**, use "Ver a página do cliente" para fazer uma encomenda e depois confirme na agenda.

## Rodar no computador

Execute `iniciar.bat` (precisa do Python) e abra http://localhost:5173.
