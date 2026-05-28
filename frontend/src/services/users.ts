/**
 * @file users — Cliente REST para resolver perfiles públicos por uid.
 *
 * Usado por la sala para resolver el avatar/username de los demás
 * participantes a partir de los uids que vienen en `room.participants`
 * (snapshot REST) y en los eventos socket `user_joined` que no incluyan
 * avatar.
 */

import { api } from "@/services/api";

/** Subconjunto seguro del perfil del usuario (sin email ni teléfono). */
export interface PublicUser {
  uid: string;
  username: string;
  displayName?: string;
  avatar?: string;
}

/** GET /api/users/:uid — perfil público de un usuario. */
export async function getPublicUser(uid: string): Promise<PublicUser> {
  const res = await api.get<{ user: PublicUser }>(
    `/users/${encodeURIComponent(uid)}`
  );
  return res.user;
}
