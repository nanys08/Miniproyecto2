import Avatar from "@/components/Avatar";
import { useAuth } from "@/hooks/useAuth";

export default function ProfilePage() {
  const { user } = useAuth();

  const displayName = user?.displayName ?? user?.email?.split("@")[0]
    ?.replace(/\./g, " ")
    ?.replace(/\b\w/g, (c) => c.toUpperCase()) ?? "Usuario";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="relative">
        {/* Avatar superior centrado */}
        <div className="flex justify-center">
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={displayName}
              className="h-24 w-24 rounded-full object-cover ring-4 ring-white"
            />
          ) : (
            <Avatar
              name={displayName}
              email={user?.email}
              size="xl"
              className="ring-4 ring-white"
            />
          )}
        </div>

        {/* Card de perfil */}
        <div className="-mt-12 rounded-2xl bg-white p-8 pt-16 shadow-sm">
          <div className="text-center">
            {user?.username && (
              <p className="text-lg font-semibold text-slate-400">@{user.username}</p>
            )}
          </div>

          <div className="mt-8">
            <section aria-labelledby="datos-title">
              <h2 id="datos-title" className="text-lg font-bold text-slate-900">
                Datos Personales
              </h2>
              <dl className="mt-4 flex flex-col gap-4">

                {/* Nombre */}
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-0.5 text-slate-400">
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </span>
                  <div>
                    <dt className="text-sm font-medium text-slate-600">Nombre:</dt>
                    <dd className="text-sm text-slate-900">{displayName}</dd>
                  </div>
                </div>

                {/* Username */}
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-0.5 text-slate-400">
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </span>
                  <div>
                    <dt className="text-sm font-medium text-slate-600">Username:</dt>
                    <dd className="text-sm text-slate-900">@{user?.username ?? "—"}</dd>
                  </div>
                </div>

                {/* Correo */}
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-0.5 text-slate-400">
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
                      <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                  </span>
                  <div>
                    <dt className="text-sm font-medium text-slate-600">Correo electrónico:</dt>
                    <dd className="text-sm text-slate-900 break-all">{user?.email ?? "—"}</dd>
                  </div>
                </div>

              </dl>
            </section>
          </div>

          <p className="mt-8 border-t border-slate-100 pt-4 text-xs text-slate-500">
            (Edición de perfil y eliminación de cuenta — Sprint 1)
          </p>
        </div>
      </div>
    </div>
  );
}