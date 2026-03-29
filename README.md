# 🎸 Rifa Nexus Band

Site completo de rifa online com pagamento automático via Mercado Pago (Pix) e painel admin.

## Stack
- **Frontend:** HTML/CSS/JS puro
- **Backend:** Node.js (Vercel Serverless Functions)
- **Banco:** Supabase (PostgreSQL)
- **Pagamento:** Mercado Pago (Pix automático via webhook)
- **Hospedagem:** Vercel

---

## 🚀 GUIA DE DEPLOY (passo a passo)

### 1. Criar conta no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita
2. Crie um novo projeto (anote a senha do banco)
3. Vá em **SQL Editor** e execute o conteúdo do arquivo `supabase_schema.sql`
4. Vá em **Settings > API** e copie:
   - `Project URL` → vai para `SUPABASE_URL`
   - `service_role secret` → vai para `SUPABASE_SERVICE_KEY` ⚠️ NUNCA exponha essa chave no frontend

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

## ⚙️ Customização

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

### Substituir ícones dos prêmios por modelos 3D
No `public/index.html`, localize a seção `.premios-grid` e substitua os emojis por `<img>` apontando para suas imagens/renders 3D.

---

## 🔑 Painel Admin

Acesse: `https://seu-site.vercel.app/admin.html`

Funcionalidades:
- Ver stats em tempo real (total, disponíveis, reservados, pagos)
- Liberar bilhetes reservados que expiraram (>30 min sem pagamento)
- Realizar sorteio aleatório entre bilhetes pagos
- Visualizar tabela de compradores

---

## 🔒 Segurança

- As credenciais do Supabase e MP ficam APENAS nas variáveis de ambiente da Vercel
- O banco de dados usa Row Level Security (RLS): leitura pública OK, escrita só via service_role
- Bilhetes reservados expiram automaticamente (libere via admin ou implemente um cron)
- A senha do admin é comparada diretamente — suficiente para este caso de uso

---

## ❓ Problemas comuns

**"Bilhetes não carregam"**
→ Verifique as variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` na Vercel

**"Pagamento não confirma automaticamente"**
→ Verifique se o webhook está configurado no Mercado Pago com a URL correta

**"Erro 500 no /api/criar-pagamento"**
→ Verifique `MP_ACCESS_TOKEN` — use credenciais de PRODUÇÃO, não sandbox
