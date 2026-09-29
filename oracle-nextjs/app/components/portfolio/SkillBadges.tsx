type SkillData = {
  id: number;
  name: string;
  category: string | null;
  is_featured: boolean;
};

export default function SkillBadges({
  skills,
  className = "",
}: {
  skills: SkillData[];
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {skills.map((skill) => (
        <span
          key={skill.id}
          className="rounded-full border border-foreground/15 bg-foreground/5 px-3.5 py-1.5 text-sm font-semibold transition-colors hover:border-accent/50 hover:text-accent"
        >
          {skill.name}
        </span>
      ))}
    </div>
  );
}
