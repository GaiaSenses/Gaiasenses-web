"use client";
import { useState, useEffect, useRef } from 'react';
import { isValidEmail, scheduleNextPush, subscribeUser, unsubscribeUser } from '@/lib/notifications.js';
import { Input } from '@/components/ui/input';
import { DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

export default function PushNotificationManager() {
	const [isSupported, setIsSupported] = useState(false);
	const [subscription, setSubscription] = useState<PushSubscription | null>(null);
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [frequency, setFrequency] = useState('');
	const [errors, setErrors] = useState<{ name?: string; email?: string; frequency?: string }>({});
	const [isLoading, setIsLoading] = useState(false);
	const t = useTranslations("Notification"); 

	function urlBase64ToUint8Array(base64String: string) {
		const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
		const base64 = (base64String + padding)
		.replace(/-/g, '+')
		.replace(/_/g, '/');
	
		const rawData = window.atob(base64);
		const outputArray = new Uint8Array(rawData.length);
	
		for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
		return outputArray;
	}
	
	useEffect(() => {
		if ('serviceWorker' in navigator && 'PushManager' in window) {
			setIsSupported(true);
			registerServiceWorker();
		}
	}, []);
 
	async function registerServiceWorker() {
		const registration = await navigator.serviceWorker.register('/sw.js', {
			scope: '/',
			updateViaCache: 'none',
		});
		const sub = await registration.pushManager.getSubscription();
		setSubscription(sub);
	}
 
	async function subscribeToPush() {
		// Reset errors
		setErrors({});

		// Validação básica
		const newErrors: { name?: string; email?: string; frequency?: string } = {};

		if (!name.trim()) {
			newErrors.name = t("notificationErrorName") || "Name is required";
		}

		if (!email.trim()) {
			newErrors.email = t("notificationErrorEmail") || "Email is required";
		} else if (!await isValidEmail(email)) {
			newErrors.email = t("notificationErrorEmailInvalid") || "Invalid email format";
		}

		if (!frequency) {
			newErrors.frequency = t("notificationErrorFrequency") || "Please select a frequency";
		}

		if (Object.keys(newErrors).length > 0) {
			setErrors(newErrors);
			return;
		}

		setIsLoading(true);
		try {
			const registration = await navigator.serviceWorker.ready;
			const sub = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(
					process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
				)
			});
			setSubscription(sub);
			const serializedSub = JSON.parse(JSON.stringify(sub));

			let formatFreq = "";

			switch (frequency) {
				case 'Daily':
				case 'Diária':
					formatFreq = 'Daily';
					break;

				case 'Weekly':
				case 'Semanal':
					formatFreq = 'Weekly';
					break;

				case 'Monthly':
				case 'Mensal':
					formatFreq = 'Monthly';
					break;

				default:
					break;
			}

			// O primeiro envio segue a mesma regra dos seguintes, calculada no
			// servidor. Antes, `first_push` era a hora da inscrição deslocada em
			// UTC, então quem se inscrevia de madrugada caía num horário que o
			// cron diário nunca visitava.
			const first_push = await scheduleNextPush(formatFreq);

			await subscribeUser({name, email, freq: formatFreq, first_push, sub: serializedSub});

			// Clear form on success
			setName('');
			setEmail('');
			setFrequency('');
			setErrors({});
		} catch (error) {
			console.error('Error subscribing to push notifications:', error);
			setErrors({ 
				frequency: t("notificationErrorSubscribe") || "Failed to subscribe. Please try again."
			});
		} finally {
			setIsLoading(false);
		}
	}
 
	async function unsubscribeFromPush() {
		await unsubscribeUser(subscription);
		await subscription?.unsubscribe();
		setSubscription(null);
		setFrequency('');
	}
 
	if (!isSupported) {
		return (
			<div className="flex-col items-center justify-center">
				<p className='text-center text-red-500'>{t("notificationNotSuported")}</p>
			</div>
		);
	}
 
	return (
		<div className="flex-col items-center justify-center">
			<p className="text-2xl font-bold mb-4">{t("notificationTitle")}</p>
			<p className="text-md mb-4">
				{subscription ?
				t("notificationSubtitle1") :
				t("notificationSubtitle2")
				}
			</p>
			<p className="space-y-4">
				{subscription ? (
					<Button variant='destructive' className='w-full' onClick={unsubscribeFromPush}>{t("notificationUnsubscribe")}</Button>
				) : (
					<div className='space-y-4'>
						{/* Campo de Nome */}
						<div className='space-y-1'>
							<label htmlFor="name" className='text-sm font-medium'>
								{t("notificationName") || "Name"}
							</label>
							<Input
								id="name"
								type="text"
								placeholder={t("notificationNamePlaceholder") || "Enter your name"}
								value={name}
								onChange={(e) => {
									setName(e.target.value);
									if (errors.name) setErrors({ ...errors, name: undefined });
								}}
								disabled={isLoading}
								className={errors.name ? 'border-red-500' : ''}
							/>
							{errors.name && <p className='text-sm text-red-500'>{errors.name}</p>}
						</div>

						{/* Campo de Email */}
						<div className='space-y-1'>
							<label htmlFor="email" className='text-sm font-medium'>
								{t("notificationEmail") || "Email"}
							</label>
							<Input
								id="email"
								type="email"
								placeholder={t("notificationEmailPlaceholder") || "Enter your email"}
								value={email}
								onChange={(e) => {
									setEmail(e.target.value);
									if (errors.email) setErrors({ ...errors, email: undefined });
								}}
								disabled={isLoading}
								className={errors.email ? 'border-red-500' : ''}
							/>
							{errors.email && <p className='text-sm text-red-500'>{errors.email}</p>}
						</div>

						{/* Campo de Frequência */}
						<div className='space-y-1'>
							<label className='text-sm font-medium'>
								{t("notificationFrequency") || "Frequency"}
							</label>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button 
										variant='outline' 
										className={`w-full ${errors.frequency ? 'border-red-500' : ''}`}
										disabled={isLoading}
									>
										{frequency ? frequency : t("notificationSelect")}
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent className='w-full'>
									{/* <DropdownMenuItem onClick={() => {
										setFrequency(t("notification60secTest"));
										if (errors.frequency) setErrors({ ...errors, frequency: undefined });
									}}>{t("notification60secTest")}</DropdownMenuItem> */}
									<DropdownMenuItem onClick={() => {
										setFrequency(t("notificationDaily"));
										if (errors.frequency) setErrors({ ...errors, frequency: undefined });
									}}>{t("notificationDaily")}</DropdownMenuItem>
									<DropdownMenuItem onClick={() => {
										setFrequency(t("notificationWeekly"));
										if (errors.frequency) setErrors({ ...errors, frequency: undefined });
									}}>{t("notificationWeekly")}</DropdownMenuItem>
									<DropdownMenuItem onClick={() => {
										setFrequency(t("notificationMonthly"));
										if (errors.frequency) setErrors({ ...errors, frequency: undefined });
									}}>{t("notificationMonthly")}</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
							{errors.frequency && <p className='text-sm text-red-500'>{errors.frequency}</p>}
						</div>

						{/* Botão de Subscribe */}
						<Button 
							className='w-full' 
							onClick={subscribeToPush}
							disabled={isLoading}
						>
							{isLoading ? t("notificationSubscribing") || "Subscribing..." : t("notificationSubscribe")}
						</Button>
					</div>
				)}
			</p>
		</div>
	);
}