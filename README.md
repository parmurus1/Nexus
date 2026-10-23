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
SITE_URL              = https://seu-projeto.vercel.app
ADMIN_PASSWORD        = uma_senha_forte_aqui
```

5. Clique em **Deploy**

### 4. Configurar Webhook no Mercado Pago

1. No painel do MP, vá em **Webhooks**
2. Adicione a URL: `https://seu-projeto.vercel.app/api/webhook`
3. Selecione o evento: **Pagamentos**
4. Salve

---

## Customização

### Ajustar quantidade de bilhetes
No arquivo `supabase_schema.sql`, mude o valor `100` na linha:
```sql
SELECT generate_series(1, 100);
```
E também o valor em:
```sql
('total_bilhetes', '100'),
```

### Ajustar valor do bilhete
No Supabase, vá em **Table Editor > config** e edite a linha `valor_bilhete`.

Ou via admin panel: Em breve (em desenvolvimento).

### Prêmios da rifa
Os prêmios ficam na lista `PREMIOS` no início do script de `public/rifa.html` (nome, quantidade, descrição e ícone).

---

## Painel admin

Acesse: `https://seu-site.vercel.app/admin`

Funcionalidades:
- Ver stats em tempo real (total, disponíveis, reservados, pagos)
- Liberar bilhetes reservados que expiraram (>30 min sem pagamento)
- Realizar sorteio aleatório entre bilhetes pagos
- Visualizar tabela de compradores e pedidos da loja
- Gerenciar produtos, agenda de shows, membros e a galeria

---

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

---

## Segurança

- As credenciais do Supabase e MP ficam APENAS nas variáveis de ambiente da Vercel
- O banco de dados usa Row Level Security (RLS): leitura pública OK, escrita só via service_role
- Bilhetes reservados expiram automaticamente (libere via admin ou implemente um cron)
- A senha do admin é comparada diretamente — suficiente para este caso de uso

---

## Problemas comuns

**"Bilhetes não carregam"**
→ Verifique as variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` na Vercel

**"Pagamento não confirma automaticamente"**
→ Verifique se o webhook está configurado no Mercado Pago com a URL correta

**"Erro 500 no /api/criar-pagamento"**
→ Verifique `MP_ACCESS_TOKEN` — use credenciais de PRODUÇÃO, não sandbox
