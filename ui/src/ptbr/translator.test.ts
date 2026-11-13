import { describe, expect, it } from "vitest";

import dictionary from "./dictionary.pt-BR.json";
import { createTranslator, type PtBrDictionary } from "./translator";

const { translate } = createTranslator(dictionary as PtBrDictionary);

describe("tradução pt-BR", () => {
  it("traduz textos exatos preservando espaços de borda", () => {
    expect(translate("Settings")).toBe("Configurações");
    expect(translate(" running")).toBe(" em execução");
    expect(translate("Loading…")).toBe("Carregando…");
  });

  it("traduz padrões com variáveis", () => {
    expect(translate("5m ago")).toBe("há 5 min");
    expect(translate("2026-11-11: 1 issues")).toBe("2026-11-11: 1 tarefas");
  });

  it("traduz o valor capturado quando ele também está no dicionário", () => {
    expect(translate("Tarefa: sort ascending")).toBe("Tarefa: ordenação crescente");
  });

  it("não traduz frases do usuário que só contêm um pedaço genérico de padrão", () => {
    expect(translate("Interview me and propose a plan and an agent team to execute it.")).toBeNull();
    expect(translate("I have a task in mind")).toBeNull();
    expect(translate("is the audience new cards get when the requester does not ask for one;")).toBeNull();
  });

  it("ignora texto sem letras", () => {
    expect(translate("42")).toBeNull();
    expect(translate(" · ")).toBeNull();
  });
});
