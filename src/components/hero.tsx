/* eslint-disable react/no-unescaped-entities */
import { getTranslations } from "next-intl/server"
import { HeroClient } from "./hero-client"

export async function Hero({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'hero' });

  const translations = {
    main: {
      eyesOn: t('main.eyesOn'),
      title: t('main.title')
    },
    upload: {
      title: t('upload.title'),
      tip: t('upload.tip'),
      uploading: t('upload.uploading'),
      choose: t('upload.choose'),
      dragTip: t('upload.dragTip'),
      noImageTip: t('upload.noImageTip'),
      noImageUrls: (t.raw('upload.noImageUrls') as string[]) || [],
      defaultImageUrl: t('upload.defaultImageUrl')
    },
    prompt: {
      title: t('prompt.title'),
      tip: t('prompt.tip'),
      placeholder: t('prompt.placeholder')
    },
    button: {
      uploadFirst: t('button.uploadFirst'),
      generate: t('button.generate')
    },
    result: {
      title: t('result.title'),
      copy: t('result.copy'),
      copied: t('result.copied')
    },
    ready: {
      title: t('ready.title'),
      prefixDesc: t('ready.prefixDesc'),
      desc1: t('ready.desc1'),
      desc2: t('ready.desc2'),
      generating: t('ready.generating'),
      waiting: t('ready.waiting')
    }
  };

  return <HeroClient translations={translations} />
}

