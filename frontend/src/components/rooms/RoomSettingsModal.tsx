/**
 * RoomSettingsModal — "Configuración de sala" del anfitrión (US-07).
 *
 * Tres vistas dentro del mismo diálogo:
 *   1. menu   → menú de opciones (Editar / Copiar código / Ver participantes /
 *               Eliminar).
 *   2. edit   → formulario de edición (nombre + descripción + código de solo
 *               lectura).
 *   3. delete → confirmación destructiva con type-to-confirm ("Eliminar").
 *
 * Estados: cargando ("Guardando cambios…" / "Eliminando sala…", botones
 * deshabilitados), éxito (callback al padre → toast) y error (mensaje inline
 * accesible, conserva datos y permite reintentar — US-07 Esc4).
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import { cn } from "@/utils/cn";
import { updateRoom, deleteRoom, type Room } from "@/services/rooms";
import { ApiError } from "@/services/api";
import { friendlyError } from "@/services/apiErrors";

const CONFIRM_WORD = "Eliminar";
const ROOM_NAME_MAX = 100;

type View = "menu" | "edit" | "delete";

interface RoomSettingsModalProps {
  open: boolean;
  onClose: () => void;
  room: Room;
  onUpdated: (room: Room) => void;
  onDeleted: () => void;
}

export default function RoomSettingsModal({
  open,
  onClose,
  room,
  onUpdated,
  onDeleted,
}: RoomSettingsModalProps) {
  const [view, setView] = useState<View>("menu");

  // Edición
  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description ?? "");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Eliminación
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const [copied, setCopied] = useState(false);

  // Reset al abrir.
  useEffect(() => {
    if (!open) return;
    setView("menu");
    setName(room.name);
    setDescription(room.description ?? "");
    setConfirm("");
    setEditError(null);
    setDeleteError(null);
    setSaving(false);
    setDeleting(false);
    setCopied(false);
  }, [open, room.name, room.description]);

  // Foco al input relevante al cambiar de vista (accesibilidad teclado).
  useEffect(() => {
    if (view === "edit") nameRef.current?.focus();
    if (view === "delete") confirmRef.current?.focus();
  }, [view]);

  const busy = saving || deleting;
  const canDelete = confirm.trim().toLowerCase() === CONFIRM_WORD.toLowerCase() && !busy;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setEditError("El nombre no puede estar vacío");
      nameRef.current?.focus();
      return;
    }
    if (trimmed.length > ROOM_NAME_MAX) {
      setEditError(`El nombre no puede superar ${ROOM_NAME_MAX} caracteres`);
      return;
    }
    setEditError(null);
    setSaving(true);
    try {
      const updated = await updateRoom(room.roomId, {
        name: trimmed,
        description: description.trim(),
      });
      onUpdated(updated);
    } catch (err) {
      setSaving(false);
      // US-07 Esc4: conservar los cambios y permitir reintentar.
      if (err instanceof ApiError && err.status === 403) {
        setEditError("No tienes permisos para administrar esta sala");
      } else {
        setEditError("No fue posible actualizar la sala");
      }
    }
  }

  async function handleDelete() {
    if (!canDelete) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteRoom(room.roomId);
      onDeleted();
    } catch (err) {
      setDeleting(false);
      if (err instanceof ApiError && err.status === 403) {
        setDeleteError("No tienes permisos para administrar esta sala");
      } else {
        setDeleteError(friendlyError(err).message || "No fue posible eliminar la sala");
      }
    }
  }

  function handleCopyCode() {
    void navigator.clipboard?.writeText(room.accessCode).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      },
      () => undefined
    );
  }

  function handleClose() {
    if (busy) return;
    onClose();
  }

  const title =
    view === "edit"
      ? "Editar sala"
      : view === "delete"
      ? "Eliminar sala"
      : "Configuración de sala";

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      {/* ── Vista: menú de opciones ─────────────────────────────────── */}
      {view === "menu" && (
        <div className="flex flex-col gap-3">
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            Código:
            <span className="rounded bg-brand-50 px-2 py-0.5 font-mono text-sm font-bold tracking-widest text-brand-700">
              {room.accessCode}
            </span>
          </p>

          <ul className="flex flex-col gap-2">
            <li>
              <MenuRow
                icon="✏️"
                label="Editar sala"
                highlighted
                onClick={() => setView("edit")}
              />
            </li>
            <li>
              <MenuRow
                icon="🔗"
                label={copied ? "¡Código copiado!" : "Copiar código de acceso"}
                onClick={handleCopyCode}
              />
            </li>
            <li>
              <div className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700">
                <span aria-hidden="true">👥</span>
                <span className="flex-1 text-left">Ver participantes</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {room.participants?.length ?? 0}
                </span>
              </div>
            </li>
            <li>
              <MenuRow
                icon="🗑️"
                label="Eliminar sala"
                destructive
                onClick={() => setView("delete")}
              />
            </li>
          </ul>

          <div className="mt-1 flex justify-end">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cerrar
            </Button>
          </div>
        </div>
      )}

      {/* ── Vista: editar ───────────────────────────────────────────── */}
      {view === "edit" && (
        <form onSubmit={handleSave} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="room-name" className="text-sm font-medium text-slate-800">
              Nombre de la sala
              <span aria-hidden="true" className="ml-0.5 text-red-600">*</span>
            </label>
            <input
              ref={nameRef}
              id="room-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (editError) setEditError(null);
              }}
              disabled={busy}
              maxLength={ROOM_NAME_MAX}
              aria-required="true"
              aria-invalid={editError ? true : undefined}
              aria-describedby={editError ? "room-name-error" : undefined}
              className={cn(
                "h-11 w-full rounded-md border px-3 text-base text-slate-900",
                "focus-visible:outline-none focus-visible:ring-2 focus:bg-white",
                "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
                editError
                  ? "border-red-500 bg-red-50 focus-visible:ring-red-500"
                  : "border-slate-300 focus-visible:ring-brand-600"
              )}
            />
            {editError && (
              <p
                id="room-name-error"
                role="alert"
                className="flex items-center gap-1.5 text-sm font-medium text-red-700"
              >
                <ErrorIcon />
                {editError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="room-desc" className="text-sm font-medium text-slate-800">
              Descripción <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              id="room-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              maxLength={200}
              placeholder="Ej. Cálculo III — grupo 2"
              className="h-11 w-full rounded-md border border-slate-300 px-3 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:cursor-not-allowed disabled:bg-slate-100"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="room-code" className="text-sm font-medium text-slate-800">
              Código de acceso
            </label>
            <input
              id="room-code"
              type="text"
              value={room.accessCode}
              readOnly
              aria-describedby="room-code-help"
              className="h-11 w-full cursor-default rounded-md border border-brand-100 bg-brand-50 px-3 text-center font-mono text-base font-semibold tracking-[0.14em] text-brand-700"
            />
            <p id="room-code-help" className="text-xs text-slate-500">
              El código no cambia al editar.
            </p>
          </div>

          <div className="mt-1 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setView("menu")}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button type="submit" isLoading={saving} disabled={busy} className="min-w-[150px]">
              {saving ? "Guardando cambios…" : "Guardar cambios"}
            </Button>
          </div>
        </form>
      )}

      {/* ── Vista: eliminar ─────────────────────────────────────────── */}
      {view === "delete" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1 text-center">
            <span aria-hidden="true" className="text-3xl">⚠️</span>
            <p className="text-base font-bold text-red-700">¿Eliminar esta sala?</p>
          </div>

          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-semibold text-red-800">Consecuencias:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-red-700">
              <li>Se eliminará el historial de chat</li>
              <li>Todos los participantes perderán acceso</li>
              <li>Esta acción no se puede deshacer</li>
            </ul>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm-delete" className="text-sm text-slate-700">
              Escribe <span className="font-mono font-bold text-red-700">"{CONFIRM_WORD}"</span> para confirmar:
            </label>
            <input
              ref={confirmRef}
              id="confirm-delete"
              type="text"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                if (deleteError) setDeleteError(null);
              }}
              disabled={busy}
              autoComplete="off"
              placeholder="Escribe aquí…"
              aria-describedby={deleteError ? "delete-error" : undefined}
              className="h-11 w-full rounded-md border border-slate-300 px-3 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:bg-slate-100"
            />
            {deleteError && (
              <p
                id="delete-error"
                role="alert"
                className="flex items-center gap-1.5 text-sm font-medium text-red-700"
              >
                <ErrorIcon />
                {deleteError}
              </p>
            )}
          </div>

          <div className="mt-1 flex justify-center gap-2">
            <Button
              type="button"
              onClick={() => setView("menu")}
              disabled={busy}
            >
              ← Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDelete}
              disabled={!canDelete}
              isLoading={deleting}
            >
              {deleting ? "Eliminando sala…" : "Eliminar sala"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Fila del menú de configuración ──────────────────────────────────────────

interface MenuRowProps {
  icon: string;
  label: string;
  onClick: () => void;
  highlighted?: boolean;
  destructive?: boolean;
}

function MenuRow({ icon, label, onClick, highlighted, destructive }: MenuRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600",
        destructive
          ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
          : highlighted
          ? "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
          : "border-slate-200 text-slate-700 hover:bg-slate-50"
      )}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      <span aria-hidden="true" className="text-slate-400">›</span>
    </button>
  );
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
        clipRule="evenodd"
      />
    </svg>
  );
}
