import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold">Welcome to Wu App</h1>
      <p className="max-w-md text-gray-600">
        Next.js frontend talking to a Django + DRF backend, backed by PostgreSQL
        on the Oracle server.
      </p>
    </main>
  );
}
