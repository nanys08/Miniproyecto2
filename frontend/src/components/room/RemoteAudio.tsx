/**
 * @file RemoteAudio — Sumidero de audio de los participantes remotos.
 *
 * El audio NO debe depender del `<video>` de cada tile: ese elemento se oculta
 * (cuando el participante no tiene cámara) y se REMONTA al cambiar entre modo
 * grid y modo escenario (al empezar/dejar de compartir pantalla). En esos
 * remontajes el audio podía dejar de sonar.
 *
 * Para evitarlo, reproducimos el audio de cada stream remoto en un elemento
 * `<audio>` dedicado, montado de forma estable a nivel de la sala (keyed por
 * uid). Así el audio sigue sonando aunque el tile se oculte, se remonte o el
 * participante esté en miniatura. Los `<video>` de los tiles van siempre en
 * mute: solo pintan imagen; el sonido sale por aquí.
 */

import { useEffect, useRef } from "react";

interface RemoteAudioProps {
  /** Streams remotos por uid (cámara/pantalla + micrófono). */
  streams: Record<string, MediaStream>;
}

export default function RemoteAudio({ streams }: RemoteAudioProps) {
  return (
    <div aria-hidden="true" className="sr-only">
      {Object.entries(streams).map(([uid, stream]) => (
        <AudioSink key={uid} stream={stream} />
      ))}
    </div>
  );
}

function AudioSink({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    // El usuario ya interactuó con la página (entró a la sala), así que el
    // autoplay con audio está permitido; reintentamos por si acaso.
    el.play().catch(() => undefined);
  }, [stream]);

  // eslint-disable-next-line jsx-a11y/media-has-caption
  return <audio ref={ref} autoPlay />;
}
