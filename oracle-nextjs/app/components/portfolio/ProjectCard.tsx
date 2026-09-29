import { GithubIcon } from "./Icons";

type TagData = { id: number; name: string; slug: string };

export type ProjectData = {
  id: number;
  title: string;
  slug: string;
  description: string;
  image: string | null;
  project_url: string | null;
  github_url: string | null;
  app_store_url: string | null;
  is_internal: boolean;
  is_in_progress: boolean;
  tags: TagData[];
};

export default function ProjectCard({ project }: { project: ProjectData }) {
  const image = project.image ? (
    // Runtime-uploaded, proxied through nginx/rewrites like /static already
    // is; next/image's optimizer would add a fragile extra hop through it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={project.image}
      alt={project.title}
      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
    />
  ) : null;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-foreground/10 bg-foreground/2 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-foreground/10 md:flex-row">
      <div className="relative aspect-video overflow-hidden ring-1 ring-black/5 ring-inset md:w-2/5 md:shrink-0 dark:ring-white/10">
        {project.project_url ? (
          <a href={project.project_url} target="_blank" rel="noopener noreferrer">
            {image}
          </a>
        ) : (
          image
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-6 md:p-7">
        <div className="flex flex-wrap items-center gap-2">
          {project.is_internal && (
            <span className="rounded-full border border-foreground/20 bg-foreground/10 px-3 py-1 text-xs font-semibold">
              🔒 Government / Internal
            </span>
          )}
          {project.is_in_progress && (
            <span className="rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              ⚙ In Progress
            </span>
          )}
        </div>

        <h3 className="text-2xl font-bold tracking-tight transition-colors group-hover:text-accent">
          {project.title}
        </h3>
        <p className="flex-1 text-sm leading-relaxed text-foreground/70">
          {project.description}
        </p>

        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {project.tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-md bg-foreground/5 px-2 py-0.5 text-xs font-medium text-foreground/55"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 pt-2">
          {project.github_url && (
            <a
              href={project.github_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
              className="text-foreground/70 transition-colors hover:text-accent"
            >
              <GithubIcon className="h-6 w-6" />
            </a>
          )}
          {project.project_url && (
            <a
              href={project.project_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-md shadow-foreground/10 transition-all hover:scale-[1.03] hover:bg-accent hover:shadow-accent/30 active:scale-[0.98]"
            >
              Visit Project
            </a>
          )}
          {project.app_store_url && (
            <a
              href={project.app_store_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-foreground/20 px-4 py-2 text-sm font-semibold transition-colors hover:border-accent hover:text-accent"
            >
              App Store
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
