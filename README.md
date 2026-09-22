# Engenho Projetos

Este projeto foi desenvolvido como P1 da disciplina de Computação em Nuvem II.

A aplicação é um e-commerce chamado Engenho Projetos, voltado para a venda de materiais, componentes e soluções para projetos de engenharia. O sistema permite cadastrar produtos e clientes, consultar o catálogo, pesquisar produtos, adicionar itens ao carrinho e finalizar pedidos.

## Funcionalidades

- Cadastro, edição e exclusão de produtos.
- Cadastro, edição e exclusão de clientes.
- Busca de produtos por marca, modelo e preço.
- Busca tolerante a letras maiúsculas/minúsculas, acentos e pequenos erros de digitação.
- Upload de fotos dos produtos.
- Carrinho de compras e checkout.
- Validação de quantidade disponível no estoque.
- Escolha de forma de pagamento e entrega.
- Histórico de pedidos por cliente.
- Painel administrativo.
- Área do cliente.

## Serviços Azure utilizados

O projeto utiliza os serviços de armazenamento do Microsoft Azure:

- **Azure Blob Storage:** usado para salvar as imagens dos produtos.
- **Azure Table Storage:** usado para salvar os dados de produtos, clientes e pedidos.

## Tecnologias utilizadas

- Node.js
- Express
- JavaScript
- HTML e CSS
- Azure Blob Storage
- Azure Table Storage

## Como executar o projeto

1. Instale as dependências:

```bash
npm install
