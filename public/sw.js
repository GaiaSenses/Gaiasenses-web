/*
 * Service worker do push do GaiaSenses.
 *
 * O servidor manda { title, body, icon, tag, url } (lib/push/messages.ts). O
 * clique abre `url` — o mapa no idioma de quem se inscreveu — reaproveitando
 * uma aba do site que já esteja aberta.
 */

self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
	let data = {};
	if (event.data) {
		try {
			data = event.data.json();
		} catch {
			data = { body: event.data.text() };
		}
	}

	event.waitUntil(
		self.registration.showNotification(data.title || 'GaiaSenses', {
			body: data.body || '',
			icon: data.icon || '/icon-192.png',
			badge: '/badge.png',
			tag: data.tag,
			data: { url: data.url || '/' },
		}),
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;

	event.waitUntil(
		(async () => {
			const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
			for (const client of windows) {
				if (new URL(client.url).origin !== self.location.origin) continue;
				await client.focus();
				if ('navigate' in client) {
					try {
						await client.navigate(target);
					} catch {
						// Aba não controlada por este worker: focar já basta.
					}
				}
				return;
			}
			await self.clients.openWindow(target);
		})(),
	);
});

/*
 * O navegador trocou o endereço de entrega por conta própria (expiração ou
 * rotação de chaves). Reinscreve e avisa o servidor, senão o próximo envio volta
 * 410 e a pessoa é removida sem ter pedido.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
	event.waitUntil(
		(async () => {
			const old = event.oldSubscription;
			if (!old) return;
			const fresh =
				event.newSubscription ||
				(await self.registration.pushManager.subscribe(old.options));
			await fetch('/api/push/resubscribe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ oldEndpoint: old.endpoint, subscription: fresh.toJSON() }),
			});
		})(),
	);
});
