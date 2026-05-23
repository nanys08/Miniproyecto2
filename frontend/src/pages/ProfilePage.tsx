import Avatar from "@/components/Avatar";
import { useAuth } from "@/hooks/useAuth";

const interests = ["Matemáticas", "Historia", "Idiomas"];

const themeColors = ["#f8fafc", "#fb923c", "#22c55e", "#a855f7", "#1e293b"];

export default function ProfilePage() {
  const { user } = useAuth();

  const displayName =
    user?.email?.split("@")[0]
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
            <h1 className="text-2xl font-bold text-slate-900">{displayName}</h1>
            {user?.username && (
              <p className="mt-0.5 text-sm text-slate-400">@{user.username}</p>
            )}
            <p className="mt-1 inline-flex items-center gap-1 text-sm text-slate-600">
              Estudiante <span aria-hidden="true">📚</span>
            </p>
          </div>

          <div className="mt-8 grid gap-8 md:grid-cols-2">
            {/* Datos personales */}
            <section aria-labelledby="datos-title">
              <h2
                id="datos-title"
                className="text-lg font-bold text-slate-900"
              >
                Datos Personales
              </h2>
              <h3 className="mt-3 text-sm font-semibold text-slate-700">
                Información del Usuario
              </h3>
              <dl className="mt-3 flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 text-slate-400"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                      <rect
                        x="3"
                        y="5"
                        width="18"
                        height="14"
                        rx="2"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <path
                        d="M3 7l9 6 9-6"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>
                  </span>
                  <div>
                    <dt className="text-sm font-medium text-slate-600">
                      Correo electrónico:
                    </dt>
                    <dd className="text-sm text-slate-900 break-all">
                      {user?.email ?? "—"}
                    </dd>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 text-slate-400"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                      <path
                        d="M3 9l9-5 9 5-9 5-9-5z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M21 9v6m-9 0v5m-7-9v5l7 4 7-4v-5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <div>
                    <dt className="text-sm font-medium text-slate-600">
                      Universidad:
                    </dt>
                    <dd className="text-sm text-slate-900">
                      Universidad Nacional
                    </dd>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 text-slate-400"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                      <path
                        d="M7 7h.01M7 3h5a2 2 0 011.41.59l7 7a2 2 0 010 2.82l-5.18 5.18a2 2 0 01-2.82 0l-7-7A2 2 0 013 10.41V5a2 2 0 012-2"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <div>
                    <dt className="text-sm font-medium text-slate-600">
                      Intereses:
                    </dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {interests.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                        >
                          {tag}
                        </span>
                      ))}
                    </dd>
                  </div>
                </div>
              </dl>
            </section>

            {/* Preferencias */}
            <section aria-labelledby="prefs-title">
              <h2
                id="prefs-title"
                className="text-lg font-bold text-slate-900"
              >
                Preferencias
              </h2>
              <dl className="mt-3 flex flex-col gap-3">
                <div>
                  <dt className="text-sm font-medium text-slate-600">
                    Idioma:
                  </dt>
                  <dd className="text-sm text-slate-900">Español</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-slate-600">
                    Notificaciones:
                  </dt>
                  <dd className="text-sm text-slate-900">Activadas</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-slate-600">
                    Tema de interfaz:
                  </dt>
                  <dd className="mt-1 flex items-center gap-2 text-sm text-slate-900">
                    <span>Claro</span>
                    <div
                      aria-hidden="true"
                      className="flex items-center gap-1.5"
                    >
                      {themeColors.map((c) => (
                        <span
                          key={c}
                          className="h-4 w-4 rounded-sm border border-slate-200"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </dd>
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
