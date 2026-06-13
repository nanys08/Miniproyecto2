/**
 * @file useSpeakingDetection — Detección de actividad de voz por participante
 * (C3, Tarea 6 / US-09 Escenario 4).
 *
 * Recibe un mapa `uid → MediaStream` (el local + los remotos) y devuelve qué
 * uids están "hablando" en este momento. Analiza la pista de audio de cada
 * stream con la Web Audio API (RMS sobre el dominio del tiempo) y aplica un
 * umbral + "hangover" de 1.5s: el indicador permanece encendido 1.5s tras la
 * última actividad para no parpadear en frases cortas.
 *
 * Coste: un AudioContext compartido y un AnalyserNode por stream. El bucle
 * usa requestAnimationFrame y solo dispara un re-render cuando cambia el
 * conjunto de hablantes (no en cada frame).
 */

import { useEffect, useRef, useState } from "react";

interface Entry {
  streamId: string;
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  data: Uint8Array<ArrayBuffer>;
  /** timestamp (performance.now) hasta el que se considera "hablando". */
  activeUntil: number;
}

type AudioCtxCtor = typeof AudioContext;

export function useSpeakingDetection(
  streams: Record<string, MediaStream | null | undefined>,
  threshold = 0.06,
  hangoverMs = 1500
): Record<string, boolean> {
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});

  // Leemos los streams vía ref para no recrear el efecto en cada render; el
  // efecto solo se rearma cuando cambia la "firma" (qué streams hay).
  const streamsRef = useRef(streams);
  streamsRef.current = streams;

  const ctxRef = useRef<AudioContext | null>(null);
  const entriesRef = useRef<Map<string, Entry>>(new Map());

  // Firma del conjunto de streams con audio: cambia al entrar/salir un peer o
  // al sustituir su pista (cambio de micrófono) → rearma analizadores.
  const signature = Object.entries(streams)
    .filter(([, s]) => s && s.getAudioTracks().length > 0)
    .map(([uid, s]) => `${uid}:${s!.id}`)
    .sort()
    .join("|");

  useEffect(() => {
    const Ctor: AudioCtxCtor | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: AudioCtxCtor })
        .webkitAudioContext;
    if (!Ctor) return;
    if (!ctxRef.current) ctxRef.current = new Ctor();
    const ctx = ctxRef.current;
    const entries = entriesRef.current;
    const current = streamsRef.current;

    // (Re)construir analizadores según los streams actuales.
    const wanted = new Set<string>();
    Object.entries(current).forEach(([uid, s]) => {
      if (!s || s.getAudioTracks().length === 0) return;
      wanted.add(uid);
      const existing = entries.get(uid);
      if (existing && existing.streamId === s.id) return; // ya enganchado
      if (existing) {
        try {
          existing.source.disconnect();
        } catch {
          /* noop */
        }
      }
      try {
        const source = ctx.createMediaStreamSource(s);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        entries.set(uid, {
          streamId: s.id,
          analyser,
          source,
          data: new Uint8Array(analyser.frequencyBinCount),
          activeUntil: 0,
        });
      } catch {
        /* el stream puede no admitir source (sin audio): se ignora */
      }
    });
    // Quitar analizadores de streams que ya no están.
    entries.forEach((e, uid) => {
      if (!wanted.has(uid)) {
        try {
          e.source.disconnect();
        } catch {
          /* noop */
        }
        entries.delete(uid);
      }
    });

    let stopped = false;
    let raf = 0;
    let last: Record<string, boolean> = {};

    const tick = () => {
      if (stopped) return;
      const now = performance.now();
      const next: Record<string, boolean> = {};
      entries.forEach((e, uid) => {
        e.analyser.getByteTimeDomainData(e.data);
        let sum = 0;
        for (let i = 0; i < e.data.length; i++) {
          const v = (e.data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / e.data.length);
        if (rms > threshold) e.activeUntil = now + hangoverMs;
        next[uid] = now < e.activeUntil;
      });

      // Re-render solo si cambió el conjunto de hablantes.
      const keys = new Set([...Object.keys(next), ...Object.keys(last)]);
      let changed = false;
      keys.forEach((k) => {
        if (Boolean(next[k]) !== Boolean(last[k])) changed = true;
      });
      if (changed) {
        last = next;
        setSpeaking(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [signature, threshold, hangoverMs]);

  // Liberar el AudioContext al desmontar.
  useEffect(() => {
    const entries = entriesRef.current;
    return () => {
      entries.forEach((e) => {
        try {
          e.source.disconnect();
        } catch {
          /* noop */
        }
      });
      entries.clear();
      if (ctxRef.current) {
        void ctxRef.current.close().catch(() => undefined);
        ctxRef.current = null;
      }
    };
  }, []);

  return speaking;
}
