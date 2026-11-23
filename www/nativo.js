const SpeechRecognition = window.Capacitor?.Plugins?.SpeechRecognition;

async function iniciarEscutaVoz(onTextoParcial, onTextoFinal, onErro) {
  if (!SpeechRecognition) {
    onErro?.("Plugin SpeechRecognition não carregado no build nativo.");
    return;
  }

  try {
    const { available } = await SpeechRecognition.available();
    if (!available) {
      onErro?.("Reconhecimento de voz indisponível neste dispositivo.");
      return;
    }

    const status = await SpeechRecognition.checkPermissions();
    if (status.speechRecognition !== "granted") {
      const pedido = await SpeechRecognition.requestPermissions();
      if (pedido.speechRecognition !== "granted") {
        onErro?.("Permissão de microfone negada.");
        return;
      }
    }

    let ultimoTexto = "";
    let finalizado = false;

    const concluir = async () => {
      if (finalizado) return;
      finalizado = true;
      await SpeechRecognition.removeAllListeners();
      if (ultimoTexto.trim()) {
        onTextoFinal?.(ultimoTexto.trim());
      } else {
        onErro?.("Nenhuma fala detetada.");
      }
    };

    await SpeechRecognition.removeAllListeners();

    await SpeechRecognition.addListener("partialResults", (data) => {
      const texto = data?.matches?.[0];
      if (texto) {
        ultimoTexto = texto;
        onTextoParcial?.(texto);
      }
    });

    await SpeechRecognition.addListener("listeningState", (state) => {
      if (state?.status === "stopped") {
        concluir();
      }
    });

    const resultado = await SpeechRecognition.start({
      language: "pt-BR",
      maxResults: 1,
      prompt: "Fale seu comando...",
      partialResults: true,
      popup: false
    });

    const textoDireto = resultado?.matches?.[0];
    if (textoDireto) {
      ultimoTexto = textoDireto;
      await concluir();
    }
  } catch (erro) {
    onErro?.(erro?.message || "Erro ao capturar áudio.");
  }
}

async function pararEscutaVoz() {
  if (SpeechRecognition) {
    try {
      await SpeechRecognition.stop();
    } catch (_) {}
  }
}
