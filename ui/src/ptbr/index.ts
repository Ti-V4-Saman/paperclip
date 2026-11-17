// Ativa a interface em português (pt-BR).
//
// Roda como script independente (deploy/easypanel/ptbr.js), injetado no index.html da imagem oficial.
// Ligado por padrão. Para voltar ao inglês, abra a UI com ?lang=en (fica salvo no navegador);
// para religar, use ?lang=pt-BR.

import dictionary from "./dictionary.pt-BR.json";
import { createTranslator, patchDateLocale, patchNativeDialogs, startDomTranslation, type PtBrDictionary } from "./translator";

const STORAGE_KEY = "paperclip.ui.language";
const LOCALE = "pt-BR";

function readPreference(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("lang");
    if (fromUrl) window.localStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl ?? window.localStorage.getItem(STORAGE_KEY) ?? LOCALE;
  } catch {
    return LOCALE;
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined" && readPreference() !== "en") {
  const { translate } = createTranslator(dictionary as PtBrDictionary);
  document.documentElement.lang = LOCALE;
  patchDateLocale(LOCALE);
  patchNativeDialogs(translate);
  startDomTranslation(translate);
}
