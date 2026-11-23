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

    SpeechRecognition.removeAllListeners();
    SpeechRecognition.addListener("partialResults", (data) => {
      if (data.matches && data.matches.length > 0) {
        onTextoParcial?.(data.matches[0]);
      }
    });

    const resultado = await SpeechRecognition.start({
      language: "pt-BR",
      maxResults: 1,
      prompt: "Fale seu comando...",
      partialResults: true,
      popup: false
    });

    if (resultado.matches && resultado.matches.length > 0) {
      const fraseFinal = resultado.matches[0];
      onTextoFinal?.(fraseFinal);
    }
  } catch (erro) {
    onErro?.(erro?.message || "Erro ao capturar áudio.");
  }
}

async function pararEscutaVoz() {
  if (SpeechRecognition) {
    await SpeechRecognition.stop();
  }
}
