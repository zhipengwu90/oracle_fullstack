"use client";

import { useMemo, useState } from "react";
import ProjectCard, { type ProjectData } from "./ProjectCard";

export default function ProjectFilter({ projects }: { projects: ProjectData[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  const tags = useMemo(() => {
    const seen = new Map<string, { id: number; name: string; slug: string }>();
    for (const project of projects) {
      for (const tag of project.tags) seen.set(tag.slug, tag);
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  const visible = selected
    ? projects.filter((p) => p.tags.some((t) => t.slug === selected))
    : projects;

  return (
    <div>
      <div className="mb-8 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
            selected === null
              ? "border-accent bg-accent/10 text-accent shadow-sm shadow-accent/20"
              : "border-foreground/15 text-foreground/70 hover:border-accent hover:text-accent"
          }`}
        >
          All
        </button>
        {tags.map((tag) => (
          <button
            type="button"
            key={tag.id}
            onClick={() => setSelected(tag.slug)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
              selected === tag.slug
                ? "border-accent bg-accent/10 text-accent shadow-sm shadow-accent/20"
                : "border-foreground/15 text-foreground/70 hover:border-accent hover:text-accent"
            }`}
          >
            {tag.name}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-foreground/60">No projects with this tag.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {visible.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
