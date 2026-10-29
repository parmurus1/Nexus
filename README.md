# Nexus Band — site oficial

Site da banda Nexus: páginas institucionais, agenda de shows, galeria de fotos e vídeos, loja (merch) e rifa online com pagamento automático via Mercado Pago (Pix), tudo gerenciado por um painel admin.

## Stack
- **Frontend:** HTML/CSS/JS puro
- **Backend:** Node.js (Vercel Serverless Functions)
- **Banco:** Supabase (PostgreSQL)
- **Pagamento:** Mercado Pago (Pix automático via webhook)
- **Hospedagem:** Vercel

---

## Guia de deploy (passo a passo)

### 1. Criar conta no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita
2. Crie um novo projeto (anote a senha do banco)
3. Vá em **SQL Editor** e execute o conteúdo do arquivo `supabase_schema.sql`
4. Vá em **Settings > API** e copie:
   - `Project URL` → vai para `SUPABASE_URL`
   - `service_role secret` → vai para `SUPABASE_SERVICE_KEY` (**nunca** exponha essa chave no frontend)

### 2. Criar conta no Mercado Pago

1. Acesse [mercadopago.com.br](https://www.mercadopago.com.br) e crie uma conta
2. Acesse [Suas integrações](https://www.mercadopago.com.br/developers/panel/app)
3. Crie um novo aplicativo
4. Vá em **Credenciais de produção** e copie o **Access Token**
   - Começa com `APP_USR-...`
   - Vai para `MP_ACCESS_TOKEN`

### 3. Criar conta na Vercel e fazer deploy

1. Acesse [vercel.com](https://vercel.com) e crie uma conta com GitHub
2. Suba este projeto em um repositório GitHub
3. Na Vercel, clique em **New Project** e importe o repositório
4. Antes de dar deploy, adicione as **Environment Variables** (Settings > Environment Variables):

```
SUPABASE_URL          = https://xxxx.supabase.co
SUPABASE_SERVICE_KEY  = eyJ...
MP_ACCESS_TOKEN       = APP_USR-...
SITE_URL              = https://nexusband.com.br
ADMIN_PASSWORD        = uma_senha_forte_aqui
```

Opcionais (veja o `.env.example`): `ADMIN_USERS` (uma senha por pessoa), `ADMIN_SESSION_SECRET`,
`RESEND_API_KEY` + `EMAIL_REMETENTE` + `EMAIL_BANDA` (e-mails automáticos), `WHATSAPP_AVISOS`
(aviso de orçamento no WhatsApp via CallMeBot) e as variáveis do Melhor Envio.

5. Clique em **Deploy**

### 4. Configurar Webhook no Mercado Pago

1. No painel do MP, vá em **Webhooks**
2. Adicione a URL: `https://seu-projeto.vercel.app/api/webhook`
3. Selecione o evento: **Pagamentos**
4. Salve

---

## Customização

### Ajustar quantidade de bilhetes
No painel admin, em Rifa → Configurações → **Quantidade de bilhetes**. Os números novos são criados na hora; para diminuir, os números removidos não podem ter sido reservados nem vendidos.

### Ajustar valor do bilhete
No Supabase, vá em **Table Editor > config** e edite a linha `valor_bilhete`.

Ou via admin panel: Em breve (em desenvolvimento).

### Prêmios da rifa
Os prêmios ficam na lista `PREMIOS` no início do script de `public/rifa.html` (nome, quantidade, descrição e ícone).

---

## Painel admin

Acesse: `https://nexusband.com.br/admin`

Funcionalidades:
- Ver stats em tempo real (total, disponíveis, reservados, pagos)
- Liberar bilhetes reservados que expiraram (também acontece automaticamente)
- Realizar sorteio aleatório entre bilhetes pagos
- Visualizar tabela de compradores e pedidos da loja
- Gerenciar produtos, agenda de shows, membros e a galeria

---

## Atualizando um banco que já existe

Rode no **SQL Editor** do Supabase, nesta ordem, os blocos do `supabase_schema.sql` que ainda não foram executados (todos podem ser rodados de novo sem problema):

1. **GALERIA** e **STORAGE: buckets das fotos da galeria e dos produtos**
2. A migração de `shows.ordem` e a de ícones dos produtos
3. **ATUALIZAÇÃO 2** — estoque, orçamentos, limite de tentativas de login e o membro Pedro
4. **ATUALIZAÇÃO 3** — cartaz dos shows e lista de fãs (avisos de shows)
5. **ATUALIZAÇÃO 4** — shows vindos do app da banda (`shows.externo_id`)
6. **ATUALIZAÇÃO 5** — rifa: pagamentos em conflito e fim das vendas
7. **OPCIONAL — pg_cron**: libera bilhetes vencidos a cada 10 minutos mesmo sem visitas (o site já faz isso sozinho quando alguém abre a rifa)

## Loja: estoque e envio

- **Preço**: o servidor sempre busca preço, nome e medidas no banco; o navegador só informa produto, tamanho e quantidade.
- **Estoque (opcional)**: no admin, em Produtos, preencha a quantidade de cada tamanho. Vazio = sem controle. Tamanhos zerados aparecem como esgotados e o estoque baixa sozinho quando o pagamento é aprovado.
- **Frete**: calculado no Melhor Envio com peso e medidas cadastrados em cada produto. O pedido inteiro vai numa caixa só (os Correios aceitam um volume por envio), e o mesmo pacote é usado no cálculo e na etiqueta. O prazo mostrado ao cliente conta a partir do envio do produto.
- **Etiquetas**: como os produtos têm tempo de produção, a etiqueta é gerada no admin, em Pedidos → **Gerar etiqueta**, quando o produto estiver pronto (ela tem prazo para ser postada). O valor sai da carteira do Melhor Envio. Se faltar saldo, recarregue e clique de novo: o site continua de onde parou, sem pagar duas vezes. Para gerar sozinha no pagamento, use `ETIQUETA_AUTOMATICA=true`.
- **Rastreio**: vai por e-mail ao cliente assim que existir. Se a etiqueta saiu sem rastreio, use **Buscar rastreio** em Pedidos.
- **Configuração**: `MELHOR_ENVIO_TOKEN`, `MELHOR_ENVIO_SANDBOX`, `CEP_ORIGEM` e os `REMETENTE_*` (veja o `.env.example`).
- **E-mails**: com o Resend configurado, o cliente recebe a confirmação do pedido e o código de rastreio, e a banda recebe um aviso de cada pedido pago.

## Rifa: reservas

Uma reserva dura 30 minutos e o link de pagamento expira em 25, então ninguém paga por um número que já foi liberado. Reservas vencidas são liberadas automaticamente. Se duas pessoas tentarem o mesmo número ao mesmo tempo, só uma consegue e a outra é avisada para escolher outro.

- **Confirmação**: o webhook do Mercado Pago marca os bilhetes como pagos. As páginas de sucesso e de pagamento pendente também consultam `/api/rifa-status` e confirmam por lá se o webhook atrasar, mostrando os números ao comprador.
- **Fim das vendas**: as vendas fecham quando o admin desliga **Vendas abertas**, quando o sorteio é feito ou quando passa a data do sorteio (horário de São Paulo).
- **Sorteio**: encerra as vendas, publica o número, o primeiro nome e o Instagram do vencedor na página da rifa e manda um e-mail ao vencedor. Para uma nova campanha, ligue **Vendas abertas** de novo.
- **Pagamento em conflito**: se um pagamento for aprovado depois que a reserva venceu e o número já foi vendido para outra pessoa, ele aparece em Rifa → Bilhetes (e a banda recebe um e-mail) para combinar outros números ou devolver o valor.

## Agenda, fãs e fotos do site

- **Cartaz do show**: no admin, em Agenda de shows, envie o flyer de cada show. Ele aparece ao lado do show na página Agenda (clicar amplia).
- **Fãs**: o rodapé de todas as páginas tem um campo "Avisos de shows" (e-mail ou WhatsApp). A lista fica no admin em **Fãs**, com exportação em CSV para importar numa ferramenta de e-mail ou lista de transmissão do WhatsApp.
- **Ordem da agenda**: automática, pela data e hora de cada show.
- **Topo das páginas**: as páginas internas e a rifa usam o fundo vermelho da primeira versão (`.hero-orb.orb1`/`.orb2` sobre a grade). A página inicial mostra, no computador, todas as fotos da galeria passando (se houver menos de 2, usa as de `public/imgs/hero/`) e, no celular, o mesmo fundo vermelho. A página Sobre tem um mosaico que troca as fotos da galeria.

## Integração com o app da banda

Quando um show é fechado no app da banda, o app pode publicá-lo direto na agenda do site:

1. Rode o bloco **ATUALIZAÇÃO 4** do `supabase_schema.sql`.
2. Crie na Vercel a variável `INTEGRACAO_TOKEN` com uma senha longa (mínimo 16 caracteres) e coloque a mesma no app.
3. O app faz um `POST https://nexusband.com.br/api/integracao/shows` com o cabeçalho `X-Nexus-Token: <INTEGRACAO_TOKEN>` e o corpo em JSON:

```json
{
  "id_externo": "id-do-show-no-app",
  "nome": "Heavy Night",
  "data": "2026-11-21",
  "hora": "19:00",
  "local": "Casa Lab SP - Rua Loefgren, 930 - Vila Mariana - São Paulo, SP",
  "link": "https://link-dos-ingressos",
  "gratuito": false
}
```

- Mandar de novo com o mesmo `id_externo` **atualiza** o show (não duplica).
- `"cancelado": true` mostra o show como cancelado; `"excluir": true` tira da agenda.
- `data` aceita `AAAA-MM-DD` ou `DD/MM/AAAA`; `link`, `hora`, `cartaz` e `gratuito` são opcionais.

Teste rápido pelo terminal:

```bash
curl -X POST https://nexusband.com.br/api/integracao/shows \
  -H "Content-Type: application/json" -H "X-Nexus-Token: SEU_TOKEN" \
  -d '{"id_externo":"teste-1","nome":"Show teste","data":"2026-12-20","local":"São Paulo"}'
```

## Conteúdo do site e orçamentos

- **Conteúdo do site** (admin): links de redes sociais e contato, player do Spotify na página inicial, biografia e rider técnico da página Contratantes e os prêmios da rifa.
- **Orçamentos** (admin): pedidos enviados pelo formulário da página Contratantes, com atalhos para responder por WhatsApp ou e-mail.

## Domínio e SEO

O site usa o domínio **nexusband.com.br** nas tags de compartilhamento, no endereço canônico, no `sitemap.xml`, no `robots.txt` e nos dados estruturados (banda e shows) para o Google. Para ele funcionar:

1. Na Vercel, abra o projeto > **Settings > Domains**, adicione `nexusband.com.br` (e `www.nexusband.com.br` redirecionando para ele) e configure o DNS no Registro.br como a Vercel indicar.
2. Atualize a variável `SITE_URL` para `https://nexusband.com.br` (usada nos links de retorno do Mercado Pago, no webhook e nos e-mails).
3. No painel do Mercado Pago, troque a URL do webhook para `https://nexusband.com.br/api/webhook`.
4. Opcional: cadastre o site no Google Search Console e envie `https://nexusband.com.br/sitemap.xml`.

## Galeria (fotos e vídeos)

1. No Supabase, abra o **SQL Editor** e execute os blocos **GALERIA** e **STORAGE: buckets das fotos da galeria e dos produtos** do `supabase_schema.sql` (podem ser executados mais de uma vez sem problema).
2. No painel admin, abra **Galeria**:
   - **Enviar fotos**: selecione (ou arraste) várias fotos de uma vez. O navegador redimensiona e converte para WebP antes de enviar e gera uma miniatura leve para a grade.
   - **Adicionar vídeo**: cole o link de um vídeo ou Shorts do YouTube. A capa vem do próprio YouTube.
   - Arraste os cards para reordenar, use o olho para ocultar/mostrar e a lixeira para excluir (o arquivo da foto também é apagado do Storage).

Como a galeria fica leve para o banco:
- o banco guarda só texto (tipo, título, URL); as fotos ficam no Storage e os vídeos no YouTube;
- a lista pública é cacheada na CDN da Vercel (5 min), então a maioria das visitas nem chega ao Supabase;
- reordenar é um único `UPDATE` (função `galeria_reordenar`);
- fotos substituídas/excluídas e uploads abandonados são apagados do Storage.

## Estrutura do front-end

- `public/css/nexus.css` — design system compartilhado (cores, tipografia, navegação, rodapé, botões, formulários, modais, toast, lightbox). Cada página só tem o CSS específico dela.
- `public/nexus-core.js` — ícones SVG (`<i data-icon="calendar"></i>` ou `nexusIcon('calendar')`), menu, config do site, toast, lightbox e utilitários.
- `public/venom.js` — tema alternativo preto e branco (Modo Venom), ligado pelo admin.
- `api/_lib/` — código compartilhado do backend (login, e-mails, regras da rifa e dos pedidos). Pastas com `_` não contam no limite de 12 funções do plano Hobby da Vercel.
- `api/site.js` — reúne `/api/config`, `/api/bilhetes`, `/api/pedido-status` e `/api/orcamento` numa única função (via rewrites no `vercel.json`), deixando espaço para novas rotas.

### Analytics
Cliques em ingressos, carrinho, checkout, orçamentos e vídeos são enviados como eventos ao Vercel Web Analytics (`nexusTrack` em `nexus-core.js`). Eventos personalizados só aparecem no painel da Vercel nos planos pagos; no plano grátis eles são simplesmente ignorados.

---

## Segurança

- As credenciais do Supabase e MP ficam APENAS nas variáveis de ambiente da Vercel
- O banco de dados usa Row Level Security (RLS): leitura pública OK, escrita só via service_role
- Bilhetes reservados expiram automaticamente (libere via admin ou implemente um cron)
- Login do admin gera uma sessão assinada que expira em 12h (a senha nunca fica salva no navegador), com limite de 5 tentativas erradas a cada 15 minutos por IP
- Preços da loja e da rifa são sempre calculados no servidor
- O webhook do Mercado Pago é idempotente: avisos repetidos não geram etiqueta, baixa de estoque ou e-mail em dobro

---

## Problemas comuns

**"Bilhetes não carregam"**
→ Verifique as variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` na Vercel

**"Pagamento não confirma automaticamente"**
→ Verifique se o webhook está configurado no Mercado Pago com a URL correta

**"Erro 500 no /api/criar-pagamento"**
→ Verifique `MP_ACCESS_TOKEN` — use credenciais de PRODUÇÃO, não sandbox
