"use server";
 
import webpush from 'web-push';
import supabase from '@/lib/usersdb';
import crypto from 'crypto';
 
webpush.setVapidDetails(
	'mailto:gaiasenses.cti@gmail.com',
	process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
	process.env.VAPID_PRIVATE_KEY
);
  
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Frequências que sendNotification sabe processar. Qualquer outra é ignorada lá. */
const ALLOWED_FREQUENCIES = ['Daily', 'Weekly', 'Monthly'];

/**
 * O público do GaiaSenses está no Brasil, e o combinado é notificar durante o
 * dia. O cron da Vercel roda 12:00 UTC, que é 09:00 em Brasília — manhã, dentro
 * do horário desejado. Este módulo agenda em torno disso.
 */
const TIMEZONE = 'America/Sao_Paulo';

/**
 * Hora UTC gravada em next_push. Não é a hora do envio: o envio acontece quando
 * o cron roda. É só uma marca que precisa cair DEPOIS da execução do dia
 * anterior e ANTES da execução do dia alvo, para o registro entrar no lote certo.
 *
 * 03:00 UTC é meia-noite em Brasília. Mesmo que o Brasil volte a ter horário de
 * verão e o fuso vire UTC-2, isto continua sendo madrugada local e segue muito
 * antes das 09:00 — a margem absorve a mudança sem precisar de tabela de fusos.
 */
const SCHEDULE_HOUR_UTC = 3;

/** Ano, mês e dia de um instante, vistos do Brasil. */
function brazilianDateParts(instant) {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(instant)
    .split('-')
    .map(Number);

  return { year, month, day };
}

/**
 * Próximo envio, contado a partir de `from` — normalmente agora, nunca a partir
 * do next_push antigo.
 *
 * Contar do valor antigo era o que transformava um atraso de duas semanas em
 * catorze notificações enfileiradas. Contando de agora, quem ficou para trás
 * recebe uma vez e volta ao ritmo.
 *
 * Exportada como async porque o formulário de inscrição também a usa, e num
 * arquivo "use server" todo export precisa ser assíncrono. Uma fonte só para o
 * primeiro envio e para os seguintes.
 */
export async function scheduleNextPush(frequency, from = new Date()) {
  if (!ALLOWED_FREQUENCIES.includes(frequency)) return null;

  const { year, month, day } = brazilianDateParts(from);

  if (frequency === 'Monthly') {
    // Somar um mês direto estoura em datas altas: 31 de janeiro vira 31 de
    // fevereiro, que o JavaScript normaliza para 3 de março — fevereiro inteiro
    // some e quem assinou dia 31 recebe dois meses depois. Fixar o dia 1 antes
    // de avançar o mês e só então limitar ao último dia existente evita isso.
    const target = new Date(Date.UTC(year, month, 1, SCHEDULE_HOUR_UTC));
    const lastDayOfTargetMonth = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
    ).getUTCDate();

    target.setUTCDate(Math.min(day, lastDayOfTargetMonth));
    return target;
  }

  const target = new Date(Date.UTC(year, month - 1, day, SCHEDULE_HOUR_UTC));
  target.setUTCDate(target.getUTCDate() + (frequency === 'Weekly' ? 7 : 1));

  return target;
}

/** Tetos de tamanho. Nada aqui precisa ser longo, e campos livres sem limite
 * são o que transforma uma tabela de PII em depósito de lixo. */
const MAX_NAME = 120;
const MAX_EMAIL = 254; // RFC 5321

/**
 * Exportada porque o formulário a usa para validar antes de enviar
 * (app/[locale]/notifications/notifications.tsx). É `async` por obrigação: num
 * arquivo "use server" todo export precisa ser uma função assíncrona.
 */
export async function isValidEmail(email) {
	return typeof email === 'string' && EMAIL_PATTERN.test(email);
}

/** Versão síncrona para uso interno — ver o comentário em subscribeUser. */
function isValidEmailSync(email) {
  return typeof email === 'string' && EMAIL_PATTERN.test(email);
}

function isNonEmptyString(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

export async function subscribeUser(user) {
  // O payload inteiro era escrito no log — nome, e-mail e a subscription de push
  // de uma pessoa real, retidos nos logs da Vercel. O próprio código trazia um
  // "remover depois". Nada de PII entra em log daqui em diante.
  if (!user || typeof user !== 'object') {
    throw new Error('Missing informations');
  }

  if (!isNonEmptyString(user.name, MAX_NAME) || !isNonEmptyString(user.email, MAX_EMAIL)
      || !user.freq || !user.first_push || !user.sub) {
    throw new Error('Missing informations');
  }

  // `isValidEmail` é async, e a chamada aqui era feita SEM await: `!Promise` é
  // sempre false, então esta validação nunca reprovou nada desde que existe.
  // Qualquer string passava como e-mail. A versão síncrona evita que o mesmo
  // erro volte por descuido.
  if (!isValidEmailSync(user.email)) {
    throw new Error('Invalid email');
  }

  if (!ALLOWED_FREQUENCIES.includes(user.freq)) {
    throw new Error('Invalid frequency');
  }

  if (Number.isNaN(new Date(user.first_push).getTime())) {
    throw new Error('Invalid first push date');
  }

  // A subscription precisa ao menos parecer uma subscription de push.
  if (typeof user.sub?.endpoint !== 'string' || !user.sub.endpoint.startsWith('https://')) {
    throw new Error('Invalid subscription');
  }

  const user_id = crypto.randomUUID();

  const { error } = await supabase
    .from('GaiaSubs')
    .insert({
      user_id,
      name: user.name,
      email: user.email,
      frequency: user.freq,
      next_push: user.first_push,
      subscription: user.sub
    });

  if (error) {
    // 23505 = unique_violation. Há um índice único no endpoint da subscription,
    // então reinscrever o mesmo navegador não duplica a linha nem multiplica os
    // envios. Não é limite de taxa — ver a nota no topo do PR.
    if (error.code === '23505') {
      return { success: true, alreadySubscribed: true };
    }
    console.error('[push] falha ao inscrever:', error.code, error.message);
    throw new Error('Error while subscribing user');
  }

  return { success: true, user_id };
}
 
export async function unsubscribeUser(sub) {
  if (typeof sub?.endpoint !== 'string') {
    return { success: false, reason: 'invalid-subscription' };
  }

  // Sem `.select()` o Supabase devolve `data: null` numa exclusão, então
  // `!data?.length` era sempre verdadeiro e esta função respondia falha mesmo
  // tendo apagado a linha. Como quem chama ignora o retorno, ninguém notou — e
  // uma falha de verdade também passaria despercebida. Isso importa para a
  // LGPD: o direito de revogação existe, mas não havia como confirmá-lo.
  const { error, data } = await supabase
    .from('GaiaSubs')
    .delete()
    .eq('subscription->>endpoint', sub.endpoint)
    .select('user_id');

  if (error) {
    console.error('[push] falha ao descadastrar:', error.code, error.message);
    return { success: false, reason: 'delete-failed' };
  }

  // Nenhuma linha atingida é sucesso do ponto de vista de quem pediu: o dado
  // não está mais lá. Distinguir os dois casos ajuda a diagnosticar.
  return { success: true, deleted: data?.length ?? 0 };
}

/**
 * Envia a quem está devendo e reagenda.
 *
 * A versão anterior buscava quem tivesse next_push dentro de um bloco fixo de
 * meio dia — 00:00-11:59 ou 12:00-23:59 de HOJE, escolhido pela hora corrente.
 * Isso tinha duas consequências que custaram inscritos de verdade:
 *
 * 1. Uma data no passado não cai em nenhuma janela futura. Bastava uma execução
 *    perdida — banco pausado, deploy sem CRON_SECRET, falha de rede — para a
 *    pessoa nunca mais receber nada. Quatro dos cinco inscritos estavam nesse
 *    estado, parados desde julho de 2026.
 * 2. O cron roda uma vez por dia, às 12:00 UTC, que cai sempre no bloco da
 *    tarde. O bloco da manhã nunca era avaliado, então quem se inscrevia de
 *    madrugada (horário do Brasil) entrava num balde que ninguém esvaziava.
 *
 * `next_push <= agora` resolve os dois: é "quem está devendo", não "quem vence
 * nesta fatia". Execução perdida é recuperada na seguinte, e não existe mais
 * bloco onde alguém possa ficar preso.
 */
export async function sendNotification() {
  const now = new Date();

  const { data: users, error } = await supabase
    .from('GaiaSubs')
    .select('*')
    .lte('next_push', now.toISOString());

  if (error) throw new Error('Error fetching users: ' + error.message);
  if (!users || users.length === 0) {
    return { success: true, message: 'No notifications due' };
  }

  const payload = JSON.stringify({
    title: 'GaiaSenses',
    body: 'Clique e veja o clima na sua região!',
    icon: '/icon.png'
  });

  let sent = 0;
  let removed = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const nextPush = await scheduleNextPush(user.frequency, now);

      if (!nextPush) {
        console.error('[push] frequência desconhecida:', user.frequency);
        failed++;
        continue;
      }

      // Enviar antes de reagendar. Se o envio falhar, next_push continua no
      // passado e a próxima execução tenta de novo — que agora é recuperação de
      // verdade, e não mais uma linha órfã.
      await webpush.sendNotification(user.subscription, payload);

      const { error: updateError } = await supabase
        .from('GaiaSubs')
        .update({ next_push: nextPush.toISOString() })
        .eq('user_id', user.user_id);

      if (updateError) throw updateError;

      sent++;
      // user_id, não nome: é um UUID aleatório e serve igual para depurar.
      console.log(`[push] ${user.user_id} enviado; próximo em ${nextPush.toISOString()}`);

    } catch (err) {
      // 404 e 410 são o navegador dizendo que a inscrição morreu — desinstalado,
      // permissão revogada, perfil apagado. Insistir nela é reenviar para sempre
      // a um endereço que não existe, então a linha sai. Guardar PII de quem não
      // recebe mais nada também não se justifica perante a LGPD.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabase.from('GaiaSubs').delete().eq('user_id', user.user_id);
        removed++;
        console.log(`[push] inscrição expirada removida: ${user.user_id}`);
        continue;
      }

      failed++;
      console.error(`[push] falha ao processar ${user.user_id}:`, err?.statusCode ?? err);
    }
  }

  return { success: true, due: users.length, sent, removed, failed };
}


//http://localhost:3000/api/notifications