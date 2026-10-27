"use client";
import { useState, useCallback, useRef } from "react";

export function useTTS() {
  const [speaking, setSpeaking] = useState(false);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "en-US";
    utt.rate = 0.85;
    utt.pitch = 1;
    utt.onstart = () => setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    utt.onerror = () => setSpeaking(false);
    // iOS Safari workaround: voices may not be loaded yet
    const doSpeak = () => {
      const voices = window.speechSynthesis.getVoices();
      const en = voices.find((v) => v.lang.startsWith("en"));
      if (en) utt.voice = en;
      window.speechSynthesis.speak(utt);
    };
    if (window.speechSynthesis.getVoices().length > 0) {
      doSpeak();
    } else {
      window.speechSynthesis.onvoiceschanged = doSpeak;
    }
  }, []);

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  return { speak, stop, speaking };
}

export type RecognitionState = "idle" | "listening" | "done" | "error";

export function useSpeechRecognition() {
  const [state, setState] = useState<RecognitionState>("idle");
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const recRef = useRef<unknown>(null);

  const startListening = useCallback((onResult?: (text: string) => void) => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      const isHttp = location.protocol === "http:" && location.hostname !== "localhost";
      setErrorMsg(
        isHttp
          ? "発音練習はHTTPS接続が必要です。VercelなどにデプロイしたURLで使えます。"
          : "このブラウザは音声認識に非対応です"
      );
      setState("error");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SR() as any;
    recRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => { setState("listening"); setTranscript(""); setErrorMsg(""); };
    rec.onresult = (e: any) => {
      const text: string = e.results[0][0].transcript;
      setTranscript(text);
      setState("done");
      onResult?.(text);
    };
    rec.onerror = (e: any) => {
      const msg = e.error === "not-allowed"
        ? "マイクの許可が必要です"
        : e.error === "no-speech"
        ? "声が聞こえませんでした"
        : "認識エラーが発生しました";
      setErrorMsg(msg);
      setState("error");
    };
    rec.onend = () => setState((s) => s === "listening" ? "idle" : s);
    rec.start();
  }, []);

  const reset = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (recRef.current as any)?.abort();
    setState("idle");
    setTranscript("");
    setErrorMsg("");
  }, []);

  return { startListening, reset, state, transcript, errorMsg };
}

export function similarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  const wordsA = new Set(na.split(/\s+/));
  const wordsB = nb.split(/\s+/);
  const matches = wordsB.filter((w) => wordsA.has(w)).length;
  return matches / Math.max(wordsA.size, wordsB.length);
}
