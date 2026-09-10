import Link from "next/link";

export default function Home() {


  return (
    <main className="mx-auto max-w-2xl p-8">
      <div>
        <h1 className="text-3xl font-bold mb-4">Next.js + Django Test</h1>
        <Link href="/testPage" className="text-blue-500 hover:underline">
          Go to Test Page
        </Link>
        </div>
    </main>
  );
}
