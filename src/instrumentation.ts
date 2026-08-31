export async function register(): Promise<void> {
  // Dynamic import required: scheduler pulls better-sqlite3 which only exists in
  // the Node runtime — a static import would break edge/other runtimes loading this file.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./server/scheduler");
    startScheduler();
  }
}
