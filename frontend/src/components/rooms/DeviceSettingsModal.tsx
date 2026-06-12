/**
 * DeviceSettingsModal — Configuración individual de dispositivos de la sala.
 *
 * Cada persona elige qué micrófono y qué cámara usa en la videollamada. A
 * diferencia de RoomSettingsModal (que es del anfitrión y afecta a la sala),
 * esto es por-persona: la elección se guarda en su navegador (localStorage) y
 * se aplica en vivo con `replaceTrack`, sin reconectar.
 *
 * Incluye:
 *   - Selector de micrófono + medidor de nivel en vivo (para confirmar que el
 *     micrófono elegido realmente capta sonido — "ver qué micrófono se usa").
 *   - Selector de cámara + vista previa del video local.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import { cn } from "@/utils/cn";

interface DeviceSettingsModalProps {
  open: boolean;
  onClose: () => void;
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  selectedMicId: string | null;
  selectedCamId: string | null;
  onSelectMic: (deviceId: string) => void | Promise<void>;
  onSelectCam: (deviceId: string) => void | Promise<void>;
  /** Stream local (cámara+mic) para la vista previa y el medidor de nivel. */
  localStream: MediaStream | null;
  /** El micrófono está activado (si está silenciado, el medidor lo indica). */
  micOn: boolean;
  /** Elemento al que devolver el foco al cerrar (WCAG 2.4.3). */
  returnFocusRef?: RefObject<HTMLElement>;
}

export default function DeviceSettingsModal({
  open,
  onClose,
  audioDevices,
  videoDevices,
  selectedMicId,
  selectedCamId,
  onSelectMic,
  onSelectCam,
  localStream,
  micOn,
  returnFocusRef,
}: DeviceSettingsModalProps) {
  const noDevices = audioDevices.length === 0 && videoDevices.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Configuración de dispositivos"
      returnFocusRef={returnFocusRef}
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm text-slate-600">
          Elige qué micrófono y cámara usar en esta sala. Tu elección se guarda
          en este navegador y se aplica al instante.
        </p>

        {noDevices ? (
          <p
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800"
          >
            No se detectaron dispositivos. Habilita los permisos de cámara y
            micrófono en el navegador y vuelve a abrir esta ventana.
          </p>
        ) : (
          <>
            {/* ── Micrófono ───────────────────────────────────────────── */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="device-mic"
                className="text-sm font-medium text-slate-800"
              >
                Micrófono
              </label>
              <select
                id="device-mic"
                value={selectedMicId ?? ""}
                onChange={(e) => void onSelectMic(e.target.value)}
                disabled={audioDevices.length === 0}
                className={cn(
                  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
                  "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                )}
              >
                {audioDevices.length === 0 && (
                  <option value="">No hay micrófonos disponibles</option>
                )}
                {audioDevices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Micrófono ${i + 1}`}
                  </option>
                ))}
              </select>
              <MicLevelMeter stream={localStream} micOn={micOn} />
            </div>

            {/* ── Cámara ──────────────────────────────────────────────── */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="device-cam"
                className="text-sm font-medium text-slate-800"
              >
                Cámara
              </label>
              <select
                id="device-cam"
                value={selectedCamId ?? ""}
                onChange={(e) => void onSelectCam(e.target.value)}
                disabled={videoDevices.length === 0}
                className={cn(
                  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
                  "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                )}
              >
                {videoDevices.length === 0 && (
                  <option value="">No hay cámaras disponibles</option>
                )}
                {videoDevices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Cámara ${i + 1}`}
                  </option>
                ))}
              </select>
              <CameraPreview stream={localStream} />
            </div>
          </>
        )}

        <div className="mt-1 flex justify-end">
          <Button type="button" onClick={onClose}>
            Listo
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Medidor de nivel de micrófono ───────────────────────────────────────────
// Lee la pista de audio del stream local con la Web Audio API y muestra una
// barra que reacciona en tiempo real: así el usuario VE que el micrófono
// elegido capta sonido (o que no llega nada → eligió el equivocado).

function MicLevelMeter({
  stream,
  micOn,
}: {
  stream: MediaStream | null;
  micOn: boolean;
}) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    const track = stream?.getAudioTracks()[0];
    if (!stream || !track) {
      setLevel(0);
      return;
    }
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;

    const audioCtx = new Ctx();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      // Escalamos un poco para que el habla normal llene la barra.
      setLevel(Math.min(1, rms * 3));
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      void audioCtx.close().catch(() => undefined);
    };
  }, [stream]);

  const pct = micOn ? Math.round(level * 100) : 0;

  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="text-xs text-slate-500" aria-hidden="true">
        Nivel
      </span>
      <div
        role="progressbar"
        aria-label="Nivel del micrófono"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-75",
            pct > 70 ? "bg-red-500" : pct > 30 ? "bg-emerald-500" : "bg-emerald-400"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!micOn && (
        <span className="text-xs font-medium text-amber-600">Silenciado</span>
      )}
    </div>
  );
}

// ─── Vista previa de la cámara ───────────────────────────────────────────────

function CameraPreview({ stream }: { stream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideo = !!stream && stream.getVideoTracks().length > 0;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = hasVideo ? stream : null;
  }, [stream, hasVideo]);

  return (
    <div className="mt-1 flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-slate-900">
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full scale-x-[-1] object-cover"
        />
      ) : (
        <span className="text-xs text-slate-400">Cámara apagada o no disponible</span>
      )}
    </div>
  );
}
