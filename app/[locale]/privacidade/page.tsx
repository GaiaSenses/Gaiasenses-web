import Link from "next/link";
import { getTranslations } from "next-intl/server";

type PageProps = {
  params: { locale: string };
};

export async function generateMetadata({ params }: PageProps) {
  const t = await getTranslations({
    locale: params.locale,
    namespace: "Privacy",
  });
  return { title: `GaiaSenses — ${t("title")}` };
}

export default async function Page({ params }: PageProps) {
  const t = await getTranslations("Privacy");

  const secoes = [
    {
      titulo: t("locationTitle"),
      paragrafos: [t("locationP1"), t("locationP2")],
    },
    { titulo: t("corpusTitle"), paragrafos: [t("corpusP1"), t("corpusP2")] },
    { titulo: t("pushTitle"), paragrafos: [t("pushP1")] },
    { titulo: t("thirdTitle"), paragrafos: [t("thirdP1")] },
    { titulo: t("rightsTitle"), paragrafos: [t("rightsP1")] },
  ];

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-2xl mx-auto px-6 py-16 flex flex-col gap-10">
        <header>
          <h1 className="text-4xl font-bold">{t("title")}</h1>
          <p className="text-sm text-neutral-400 mt-2">{t("updated")}</p>
        </header>

        <p className="text-lg leading-relaxed">{t("intro")}</p>

        {secoes.map((secao) => (
          <section key={secao.titulo} className="flex flex-col gap-3">
            <h2 className="text-2xl font-semibold">{secao.titulo}</h2>
            {secao.paragrafos.map((paragrafo) => (
              <p key={paragrafo} className="leading-relaxed">
                {paragrafo}
              </p>
            ))}
          </section>
        ))}

        <Link
          href={`/${params.locale}/map3`}
          className="underline hover:no-underline"
        >
          {t("backToMap")}
        </Link>
      </div>
    </main>
  );
}
