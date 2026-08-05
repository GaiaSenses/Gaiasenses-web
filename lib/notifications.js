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

// A lógica do sendNotification funciona com o seguinte: a cada execução, o sistema verifica quais usuários estão dentro do bloco de tempo atual (00:00-11:59 ou 12:00-23:59) e envia a notificação para eles. Depois disso, ele calcula a próxima data de envio com base na frequência do usuário e atualiza o campo next_push no banco de dados. Dessa forma, mesmo que haja uma falha no envio da notificação, o sistema tentará novamente na próxima execução, evitando loops infinitos.

export async function sendNotification() {
  const now = new Date();
  const currentHour = now.getUTCHours();

  let windowStart, windowEnd;

  // definição dos dois blocos (em UTC)
  if (currentHour < 12) {
    // 00:00 → 11:59
    windowStart = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0, 0, 0
    ));

    windowEnd = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      11, 59, 59
    ));
  } else {
    // 12:00 → 23:59
    windowStart = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      12, 0, 0
    ));

    windowEnd = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23, 59, 59
    ));
  }

  // busca dos usuários dentro do bloco
  const { data: users, error } = await supabase
    .from('GaiaSubs')
    .select('*')
    .gte('next_push', windowStart.toISOString())
    .lte('next_push', windowEnd.toISOString());

  if (error) throw new Error('Error fetching users: ' + error.message);
  if (!users || users.length === 0) {
    return { success: true, message: 'No notifications in this block' };
  }

  const payload = JSON.stringify({
    title: 'GaiaSenses',
    body: 'Clique e veja o clima na sua região!',
    icon: '/icon.png'
  });

  for (const user of users) {
    try {
      let baseDate = new Date(user.next_push);

      // calculando a próxima ocorrência
      switch (user.frequency) {
        case 'Daily':
          baseDate.setUTCDate(baseDate.getUTCDate() + 1);
          break;

        case 'Weekly':
          baseDate.setUTCDate(baseDate.getUTCDate() + 7);
          break;

        case 'Monthly':
          baseDate.setUTCMonth(baseDate.getUTCMonth() + 1);
          break;

        default:
          console.error("Unknown frequency:", user.frequency);
          continue;
      }

      // enviar notificação primeiro
      await webpush.sendNotification(user.subscription, payload);

      // daí atualizar next_push depois (evita perder envio)
      const { error: updateError } = await supabase
        .from('GaiaSubs')
        .update({ next_push: baseDate.toISOString() })
        .eq('user_id', user.user_id);
        // user_id, não nome: é um UUID aleatório e serve igual para depurar.
        console.log(`[push] next_push de ${user.user_id} atualizado para ${baseDate.toISOString()}`);

      if (updateError) throw updateError;

    } catch (err) {
      console.error(`[push] falha ao processar ${user.user_id}:`, err);
    }
  }

  return { success: true };
}


//http://localhost:3000/api/notifications