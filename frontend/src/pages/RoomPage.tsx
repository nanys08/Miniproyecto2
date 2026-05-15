// Placeholder de sala — Sprint 0.
// Sprint 2+ traerá: stream de video (T3), chat en vivo (T2), compartir pantalla (T4).
export default function RoomPage() {
  return (
    <>
      <section
        aria-labelledby="region-stage"
        className="rounded-lg bg-slate-800 p-6 min-h-[400px] flex items-center justify-center"
      >
        <h2 id="region-stage" className="sr-only">
          Área de video y compartición de pantalla
        </h2>
        <p className="text-slate-400">
          (Video, audio y screen-share aparecerán aquí en Sprints 2+)
        </p>
      </section>

      <aside
        aria-labelledby="region-chat"
        className="rounded-lg bg-slate-800 p-4 flex flex-col"
      >
        <h2 id="region-chat" className="text-base font-semibold">
          Chat
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          (Chat en tiempo real — Sprint 1)
        </p>
      </aside>
    </>
  );
}
