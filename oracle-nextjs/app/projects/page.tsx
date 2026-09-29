import ProjectFilter from "../components/portfolio/ProjectFilter";
import type { ProjectData } from "../components/portfolio/ProjectCard";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

async function getProjects(): Promise<ProjectData[]> {
  const res = await fetch(`${BACKEND_URL}/api/portfolio/projects/`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Backend responded ${res.status}`);
  return res.json();
}

export default async function ProjectsPage() {
  let projects: ProjectData[] = [];
  let error: string | null = null;
  try {
    projects = await getProjects();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-20 md:py-28">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold tracking-widest text-accent uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        Selected work
      </p>
      <h1 className="mb-12 text-4xl font-extrabold tracking-tight sm:text-5xl">Projects</h1>

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Failed to load: {error}
        </p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-foreground/60">No projects yet.</p>
      ) : (
        <ProjectFilter projects={projects} />
      )}
    </main>
  );
}
