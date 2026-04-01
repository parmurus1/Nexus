// api/debug.js
// ATENÇÃO: delete este arquivo após resolver o problema!
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const checks = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_URL_value: process.env.SUPABASE_URL?.slice(0, 30) + '...' || 'NÃO DEFINIDA',
    SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
    SUPABASE_SERVICE_KEY_prefix: process.env.SUPABASE_SERVICE_KEY?.slice(0, 20) + '...' || 'NÃO DEFINIDA',
    MP_ACCESS_TOKEN: !!process.env.MP_ACCESS_TOKEN,
    ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
    ADMIN_PASSWORD_length: process.env.ADMIN_PASSWORD?.length || 0,
    SITE_URL: process.env.SITE_URL || 'NÃO DEFINIDA',
  };

  // Testar conexão com Supabase
  let supabaseOk = false;
  let supabaseError = null;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { error } = await supabase.from('config').select('chave').limit(1);
    supabaseOk = !error;
    supabaseError = error?.message || null;
  } catch (e) {
    supabaseError = e.message;
  }

  return res.status(200).json({
    variaveis: checks,
    supabase_conectado: supabaseOk,
    supabase_erro: supabaseError,
  });
}
