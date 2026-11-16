"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
	getSubscriptionStatus,
	subscribeUser,
	unsubscribeUser,
	type SubscribeResult,
} from "@/lib/push/actions";
import { FREQUENCIES, type Frequency } from "@/lib/push/schedule";
import { isValidEmail, MAX_EMAIL, MAX_NAME, normalizeLocale } from "@/lib/push/validation";

/**
 * Inscrição em notificações push.
 *
 * Três regras que o desenho anterior não seguia, e que faziam o sistema parecer
 * quebrado mesmo com o cron entregando:
 *
 * 1. Só mostrar "inscrito" depois que o banco confirmou. Antes a tela trocava
 *    antes da gravação, e um erro ia para um campo que já não aparecia: o
 *    navegador ficava inscrito, o banco não, e nada chegava.
 * 2. Perguntar ao banco, não só ao navegador. Uma linha apagada (endpoint
 *    expirado) continuava aparecendo como inscrição ativa.
 * 3. Dizer o que fazer quando o navegador não deixa: iPhone fora da Tela de
 *    Início e permissão bloqueada têm saída, e a tela agora explica qual.
 */

type View = "checking" | "unsupported" | "ios-install" | "blocked" | "form" | "subscribed";
type Notice = { tone: "info" | "error"; key: NoticeKey } | null;
type NoticeKey =
	| "notificationExpired"
	| "notificationConfirmed"
	| "notificationConfirmPending"
	| "notificationUpdated"
	| "notificationUnsubscribed"
	| "notificationErrorPermission"
	| "notificationErrorRejected"
	| "notificationErrorServer"
	| "notificationErrorSubscribe"
	| "notificationErrorUnsubscribe";
type FieldErrors = { name?: string; email?: string; frequency?: string };

const FREQ_LABEL_KEY: Record<Frequency, "notificationDaily" | "notificationWeekly" | "notificationMonthly"> = {
	Daily: "notificationDaily",
	Weekly: "notificationWeekly",
	Monthly: "notificationMonthly",
};

function urlBase64ToUint8Array(base64String: string) {
	const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
	const rawData = window.atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
	return outputArray;
}

/** iPhone/iPad só têm Web Push com o site instalado na Tela de Início (iOS 16.4+). */
function isIosOutsideHomeScreen() {
	const ua = navigator.userAgent;
	const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
	const standalone =
		window.matchMedia("(display-mode: standalone)").matches ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true;
	return ios && !standalone;
}

export default function PushNotificationManager() {
	const t = useTranslations("Notification");
	const locale = normalizeLocale(useLocale());

	const [view, setView] = useState<View>("checking");
	const [subscription, setSubscription] = useState<PushSubscription | null>(null);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [frequency, setFrequency] = useState<Frequency | "">("");
	const [errors, setErrors] = useState<FieldErrors>({});
	const [notice, setNotice] = useState<Notice>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		let cancelled = false;

		(async () => {
			const supported =
				"serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
			if (!supported) {
				setView(isIosOutsideHomeScreen() ? "ios-install" : "unsupported");
				return;
			}

			try {
				const registration = await navigator.serviceWorker.register("/sw.js", {
					scope: "/",
					updateViaCache: "none",
				});
				const sub = await registration.pushManager.getSubscription();
				if (cancelled) return;

				if (!sub) {
					setView(Notification.permission === "denied" ? "blocked" : "form");
					return;
				}

				const status = await getSubscriptionStatus({ endpoint: sub.endpoint }).catch(() => null);
				if (cancelled) return;

				if (status?.ok && !status.subscribed) {
					// O navegador acha que está inscrito, o banco não tem a linha.
					// Desfaz o lado do navegador para o formulário voltar a valer.
					await sub.unsubscribe().catch(() => {});
					if (cancelled) return;
					setNotice({ tone: "info", key: "notificationExpired" });
					setView("form");
					return;
				}

				// Sem resposta do servidor não dá para saber; não apagamos nada.
				setSubscription(sub);
				setView("subscribed");
			} catch (err) {
				console.error("[push] service worker indisponível:", err);
				if (!cancelled) setView("unsupported");
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	function validate(): FieldErrors {
		const found: FieldErrors = {};
		if (!name.trim()) found.name = t("notificationErrorName");
		if (!email.trim()) found.email = t("notificationErrorEmail");
		else if (!isValidEmail(email.trim())) found.email = t("notificationErrorEmailInvalid");
		if (!frequency) found.frequency = t("notificationErrorFrequency");
		return found;
	}

	async function subscribeToPush(event: FormEvent) {
		event.preventDefault();
		setNotice(null);

		const found = validate();
		setErrors(found);
		if (Object.keys(found).length > 0 || !frequency) return;

		setBusy(true);
		try {
			let sub: PushSubscription;
			try {
				const registration = await navigator.serviceWorker.ready;
				sub = await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""),
				});
			} catch (err) {
				console.error("[push] navegador recusou a inscrição:", err);
				if (Notification.permission === "denied") {
					setNotice({ tone: "error", key: "notificationErrorPermission" });
				} else {
					setNotice({ tone: "error", key: "notificationErrorSubscribe" });
				}
				return;
			}

			let result: SubscribeResult | null = null;
			try {
				result = await subscribeUser({
					name: name.trim(),
					email: email.trim(),
					frequency,
					locale,
					subscription: sub.toJSON(),
				});
			} catch (err) {
				// Rede, ou o limite de tentativas do WAF (429).
				console.error("[push] falha ao chamar o servidor:", err);
			}

			if (!result || !result.ok) {
				// O banco não gravou: o navegador não pode ficar inscrito sozinho.
				await sub.unsubscribe().catch(() => {});
				const reason = result && !result.ok ? result.reason : null;
				if (reason === "invalid-name") setErrors({ name: t("notificationErrorName") });
				else if (reason === "invalid-email") setErrors({ email: t("notificationErrorEmailInvalid") });
				else if (reason === "invalid-frequency") setErrors({ frequency: t("notificationErrorFrequency") });
				else
					setNotice({
						tone: "error",
						key: reason === "push-rejected" ? "notificationErrorRejected" : "notificationErrorServer",
					});
				return;
			}

			setSubscription(sub);
			setView("subscribed");
			setName("");
			setEmail("");
			setFrequency("");
			setErrors({});
			setNotice({
				tone: "info",
				key: !result.confirmed
					? "notificationConfirmPending"
					: result.status === "updated"
						? "notificationUpdated"
						: "notificationConfirmed",
			});
		} finally {
			setBusy(false);
		}
	}

	async function unsubscribeFromPush() {
		setNotice(null);
		setBusy(true);
		try {
			const endpoint = subscription?.endpoint;
			if (endpoint) {
				const result = await unsubscribeUser({ endpoint }).catch(() => null);
				if (!result?.ok) {
					// Mantém a inscrição do navegador para a pessoa poder tentar de novo.
					setNotice({ tone: "error", key: "notificationErrorUnsubscribe" });
					return;
				}
			}
			await subscription?.unsubscribe().catch(() => {});
			setSubscription(null);
			setView("form");
			setNotice({ tone: "info", key: "notificationUnsubscribed" });
		} finally {
			setBusy(false);
		}
	}

	const noticeEl = notice && (
		<p
			role={notice.tone === "error" ? "alert" : "status"}
			className={`text-sm rounded-md px-3 py-2 ${
				notice.tone === "error"
					? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
					: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
			}`}
		>
			{t(notice.key)}
		</p>
	);

	const privacy = (
		<p className="text-sm">
			<a href={`/${locale}/privacidade`} target="_blank" rel="noreferrer" className="underline">
				{t("notificationPrivacyLink")}
			</a>
		</p>
	);

	if (view === "checking") {
		return <p className="text-sm text-muted-foreground">{t("notificationChecking")}</p>;
	}

	if (view === "unsupported" || view === "ios-install" || view === "blocked") {
		const key =
			view === "ios-install"
				? "notificationIosInstall"
				: view === "blocked"
					? "notificationBlocked"
					: "notificationNotSuported";
		return (
			<div className="flex flex-col gap-3">
				<h2 className="text-2xl font-bold">{t("notificationTitle")}</h2>
				<p className={view === "unsupported" ? "text-red-500" : ""}>{t(key)}</p>
				{privacy}
			</div>
		);
	}

	if (view === "subscribed") {
		return (
			<div className="flex flex-col gap-4">
				<h2 className="text-2xl font-bold">{t("notificationTitle")}</h2>
				<p>{t("notificationSubtitle1")}</p>
				{noticeEl}
				<Button variant="destructive" className="w-full" onClick={unsubscribeFromPush} disabled={busy}>
					{t("notificationUnsubscribe")}
				</Button>
				{privacy}
			</div>
		);
	}

	return (
		<form className="flex flex-col gap-4" onSubmit={subscribeToPush} noValidate>
			<h2 className="text-2xl font-bold">{t("notificationTitle")}</h2>
			<p>{t("notificationSubtitle2")}</p>
			{noticeEl}

			<div className="space-y-1">
				<label htmlFor="push-name" className="text-sm font-medium">
					{t("notificationName")}
				</label>
				<Input
					id="push-name"
					type="text"
					autoComplete="name"
					maxLength={MAX_NAME}
					placeholder={t("notificationNamePlaceholder")}
					value={name}
					onChange={(e) => {
						setName(e.target.value);
						if (errors.name) setErrors({ ...errors, name: undefined });
					}}
					disabled={busy}
					aria-invalid={!!errors.name}
					className={errors.name ? "border-red-500" : ""}
				/>
				{errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
			</div>

			<div className="space-y-1">
				<label htmlFor="push-email" className="text-sm font-medium">
					{t("notificationEmail")}
				</label>
				<Input
					id="push-email"
					type="email"
					autoComplete="email"
					maxLength={MAX_EMAIL}
					placeholder={t("notificationEmailPlaceholder")}
					value={email}
					onChange={(e) => {
						setEmail(e.target.value);
						if (errors.email) setErrors({ ...errors, email: undefined });
					}}
					disabled={busy}
					aria-invalid={!!errors.email}
					className={errors.email ? "border-red-500" : ""}
				/>
				{errors.email && <p className="text-sm text-red-500">{errors.email}</p>}
			</div>

			<div className="space-y-1">
				<span className="text-sm font-medium">{t("notificationFrequency")}</span>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="outline"
							className={`w-full ${errors.frequency ? "border-red-500" : ""}`}
							disabled={busy}
						>
							{frequency ? t(FREQ_LABEL_KEY[frequency]) : t("notificationSelect")}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
						{FREQUENCIES.map((f) => (
							<DropdownMenuItem
								key={f}
								onClick={() => {
									setFrequency(f);
									if (errors.frequency) setErrors({ ...errors, frequency: undefined });
								}}
							>
								{t(FREQ_LABEL_KEY[f])}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				{errors.frequency && <p className="text-sm text-red-500">{errors.frequency}</p>}
				<p className="text-xs text-muted-foreground">{t("notificationWhen")}</p>
			</div>

			<Button type="submit" className="w-full" disabled={busy}>
				{busy ? t("notificationSubscribing") : t("notificationSubscribe")}
			</Button>
			{privacy}
		</form>
	);
}
