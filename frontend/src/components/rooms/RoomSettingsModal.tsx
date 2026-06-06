/**
 * RoomSettingsModal — Configuración de sala para el anfitrión (US-07).
 *
 * Dos zonas:
 *   1. Editar nombre (campo pre-llenado + "Guardar cambios").
 *   2. Zona de peligro: eliminar con patrón type-to-confirm (hay que escribir
 *      "ELIMINAR" para habilitar el botón destructivo — igual que US-05).
 *
 * Estados: cargando (spinner + botones deshabilitados), éxito (callback al
 * padre → toast) y error (mensaje inline accesible, conserva los datos y
 * permite reintentar — US-07 Escenario 4).
 *
 * Accesibilidad: labels asociados, `aria-invalid`/`aria-describedby`,
 * `role="alert"`, foco inicial gestionado por Modal, botón destructivo con
 * `disabled` nativo hasta confirmar.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import { cn } from "@/utils/cn";
import { updateRoom, deleteRoom, type Room } from "@/services/rooms";
import { ApiError } from "@/services/api";
import { friendlyError } from "@/services/apiErrors";

const CONFIRM_WORD = "ELIMINAR";
const ROOM_NAME_MAX = 100;

interface RoomSettingsModalProps {
  open: boolean;
  onClose: () => void;
  room: Room;
  /** La sala se actualizó correctamente (el padre refresca y muestra toast). */
  onUpdated: (room: Room) => void;
  /** La sala se eliminó correctamente (el padre redirige y muestra toast). */
  onDeleted: () => void;
}

export default function RoomSettingsModal({
  open,
  onClose,
  room,
  onUpdated,
  onDeleted,
}: RoomSettingsModalProps) {
  const [name, setName] = useState(room.name);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(room.name);
    setEditError(null);
    setConfirm("");
    setDeleteError(null);
    setSaving(false);
    setDeleting(false);
  }, [open, room.name]);

  const busy = saving || deleting;
  const nameChanged = name.trim() !== room.name && name.trim().length > 0;
  const canDelete = confirm.trim().toUpperCase() === CONFIRM_WORD && !busy;

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
      const updated = await updateRoom(room.roomId, trimmed);
      onUpdated(updated);
    } catch (err) {
      setSaving(false);
      // US-07 Escenario 4: conservar los cambios del formulario y reintentar.
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

  function handleClose() {
    if (busy) return;
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Configuración de sala">
      {/* ── Editar nombre ───────────────────────────────────────────── */}
      <form onSubmit={handleSave} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="room-name" className="text-sm font-medium text-slate-800">
            Nombre de la sala
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
            aria-invalid={editError ? true : undefined}
            aria-describedby={editError ? "room-name-error" : undefined}
            className={cn(
              "h-11 w-full rounded-md border px-3 text-base text-slate-900",
              "focus-visible:outline-none focus-visible:ring-2",
              "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
              editError
                ? "border-red-500 focus-visible:ring-red-500"
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

        <div className="flex justify-start gap-2">
          <Button
            type="submit"
            disabled={!nameChanged || busy}
            isLoading={saving}
            className="min-w-[150px]"
          >
            {saving ? "Guardando cambios…" : "Guardar cambios"}
          </Button>
          <Button type="button" variant="secondary" onClick={handleClose} disabled={busy}>
            Cancelar
          </Button>
        </div>
      </form>

      {/* ── Zona de peligro: eliminar ───────────────────────────────── */}
      <div className="mt-6 border-t border-slate-200 pt-5">
        <h3 className="text-sm font-semibold text-red-700">Zona de peligro</h3>
        <p className="mt-1 text-sm text-slate-600">
          Eliminar la sala borra su historial de mensajes y desconecta a todos
          los participantes. Esta acción es irreversible.
        </p>

        <div className="mt-3 flex flex-col gap-1.5">
          <label htmlFor="confirm-delete" className="text-sm font-medium text-slate-800">
            Escribe <span className="font-mono font-bold">{CONFIRM_WORD}</span> para confirmar
          </label>
          <input
            id="confirm-delete"
            type="text"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (deleteError) setDeleteError(null);
            }}
            disabled={busy}
            autoComplete="off"
            aria-describedby={deleteError ? "delete-error" : undefined}
            className={cn(
              "h-11 w-full rounded-md border border-slate-300 px-3 text-base text-slate-900",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500",
              "disabled:cursor-not-allowed disabled:bg-slate-100"
            )}
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

        <div className="mt-3">
          <Button
            type="button"
            variant="danger"
            onClick={handleDelete}
            disabled={!canDelete}
            isLoading={deleting}
          >
            {deleting ? "Eliminando sala…" : "Eliminar sala permanentemente"}
          </Button>
        </div>
      </div>
    </Modal>
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
