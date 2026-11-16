"use client";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import PushNotificationManager from "../notifications/notifications";

export default function NotificationDialog() {
	const t = useTranslations("Notification");
	return (
		<Dialog>
			<DialogTrigger asChild>
				<div className="absolute top-[215px] right-0 z-10">
					<div className="mr-[10px] mt-[10px]">
						<button
							type="button"
							aria-label={t("notificationTitle")}
							className="bg-white w-[29px] h-[29px] rounded-sm flex justify-center items-center hover:bg-gray-200"
						>
							<BellRing width={22} height={22} strokeWidth={2.5} />
						</button>
					</div>
				</div>
			</DialogTrigger>
			{/* Antes max-w-[30%]: num celular de 390 px o formulário ficava com
			    ~117 px de largura. Agora ocupa a tela com margem e para em 28rem. */}
			<DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[90dvh] overflow-y-auto">
				<PushNotificationManager />
			</DialogContent>
		</Dialog>
	);
}
