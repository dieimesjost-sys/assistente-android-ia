const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const WEBHOOK_LOCAL_BASE = "http://localhost:8080";

const FERRAMENTAS_ASSISTENTE = [
  {
    functionDeclarations: [
      {
        name: "executar_automacao_android",
        description:
          "Dispara uma macro ou automação local no Android (MacroDroid ou Tasker) para alterar configurações do aparelho, abrir rotinas ou executar ações de sistema.",
        parameters: {
          type: "OBJECT",
          properties: {
            nome_macro: {
              type: "STRING",
              description:
                "Identificador da macro configurada no MacroDroid/Tasker, ex: modo_silencioso, wifi, nao_perturbe, abrir_camera"
            },
            parametro: {
              type: "STRING",
              description:
                "Parâmetro opcional da ação, ex: ativar, desativar, 50, normal"
            }
          },
          required: ["nome_macro"]
        }
      },
      {
        name: "registrar_nota_rapida",
        description:
          "Salva uma nota, lembrete ou registro rápido no armazenamento local do aplicativo.",
        parameters: {
          type: "OBJECT",
          properties: {
            titulo: {
              type: "STRING",
              description: "Título curto da nota ou registro"
            },
            conteudo: {
              type: "STRING",
              description: "Texto completo ou valor anotado"
            }
          },
          required: ["titulo", "conteudo"]
        }
      }
    ]
  }
];

async function executarAutomacaoAndroid({ nome_macro, parametro = "" }) {
  const url = `${WEBHOOK_LOCAL_BASE}/${encodeURIComponent(nome_macro)}?valor=${encodeURIComponent(parametro)}`;

  try {
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) {
      return {
        status: "erro_http",
        mensagem: `MacroDroid/Tasker respondeu com status ${resp.status} para '${nome_macro}'.`
      };
    }
    return {
      status: "ok",
      mensagem: `Macro '${nome_macro}' disparada${parametro ? ` com parâmetro '${parametro}'` : ""}.`
    };
  } catch (err) {
    return {
      status: "falha_conexao",
      mensagem: `Não foi possível alcançar ${url}. Verifique se o gatilho Webhook está ativo no celular.`
    };
  }
}

function registrarNotaRapida({ titulo, conteudo }) {
  const chave = "assistente_notas_v1";
  const existentes = JSON.parse(localStorage.getItem(chave) || "[]");
  const novaNota = {
    id: Date.now(),
    titulo,
    conteudo,
    criadoEm: new Date().toISOString()
  };
  existentes.unshift(novaNota);
  localStorage.setItem(chave, JSON.stringify(existentes));

  return {
    status: "ok",
    mensagem: `Nota '${titulo}' salva localmente.`
  };
}

const EXECUTORES_LOCAIS = {
  executar_automacao_android: executarAutomacaoAndroid,
  registrar_nota_rapida: registrarNotaRapida
};

async function enviarComandoAoAssistente(promptUsuario, apiKey, historico = []) {
  if (!apiKey) {
    throw new Error("Chave da API do Gemini não configurada.");
  }

  const instrucaoSistema =
    "Você é um assistente pessoal rápido e objetivo no Android. " +
    "Quando o usuário pedir uma ação no aparelho ou anotar algo, chame a função correspondente. " +
    "Após receber o retorno da função, confirme ao usuário em português de forma curta e direta.";

  const mensagens = [
    ...historico,
    {
      role: "user",
      parts: [{ text: promptUsuario }]
    }
  ];

  const resposta1 = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instrucaoSistema }] },
      contents: mensagens,
      tools: FERRAMENTAS_ASSISTENTE,
      toolConfig: { functionCallingConfig: { mode: "AUTO" } }
    })
  });

  if (!resposta1.ok) {
    const erroTexto = await resposta1.text();
    throw new Error(`Erro na API Gemini (${resposta1.status}): ${erroTexto}`);
  }

  const dados1 = await resposta1.json();
  const candidato1 = dados1.candidates?.[0];
  const partes1 = candidato1?.content?.parts || [];
  const chamadasFuncao = partes1.filter((p) => p.functionCall);

  if (chamadasFuncao.length === 0) {
    const textoDireto = partes1.map((p) => p.text).filter(Boolean).join("\n");
    return {
      resposta: textoDireto || "Sem resposta de texto.",
      historicoAtualizado: [...mensagens, { role: "model", parts: partes1 }]
    };
  }

  const partesRespostaFuncao = [];
  for (const item of chamadasFuncao) {
    const { name, args = {} } = item.functionCall;
    const executor = EXECUTORES_LOCAIS[name];

    const resultadoExecucao = executor
      ? await executor(args)
      : { status: "nao_encontrada", mensagem: `Função '${name}' não implementada.` };

    partesRespostaFuncao.push({
      functionResponse: {
        name,
        response: resultadoExecucao
      }
    });
  }

  const mensagensComResultado = [
    ...mensagens,
    { role: "model", parts: partes1 },
    { role: "user", parts: partesRespostaFuncao }
  ];

  const resposta2 = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instrucaoSistema }] },
      contents: mensagensComResultado,
      tools: FERRAMENTAS_ASSISTENTE
    })
  });

  if (!resposta2.ok) {
    const erroTexto2 = await resposta2.text();
    throw new Error(`Erro na 2ª chamada Gemini (${resposta2.status}): ${erroTexto2}`);
  }

  const dados2 = await resposta2.json();
  const partes2 = dados2.candidates?.[0]?.content?.parts || [];
  const textoFinal = partes2.map((p) => p.text).filter(Boolean).join("\n");

  return {
    resposta: textoFinal || "Ação processada.",
    historicoAtualizado: [...mensagensComResultado, { role: "model", parts: partes2 }]
  };
}
