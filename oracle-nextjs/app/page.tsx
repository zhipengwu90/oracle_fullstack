import Link from "next/link";

type ProfileData = {
  full_name: string;
  role_title: string;
  hero_heading: string;
  hero_bio: string;
  about_heading: string;
  about_bio: string;
  hero_image: string | null;
  about_image: string | null;
  email: string | null;
  location: string | null;
  resume_url: string | null;
};

type SkillData = { id: number; name: string; category: string | null; is_featured: boolean };

// Backend base URL for server-side fetches:
//   - local dev:  unset -> http://localhost:8000 (Django runserver)
//   - Docker:     BACKEND_URL=http://backend:8000 (set in docker-compose.yml)
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

async function getHomeData() {
  const [profileRes, skillsRes] = await Promise.all([
    fetch(`${BACKEND_URL}/api/portfolio/profile/`, { cache: "no-store" }),
    fetch(`${BACKEND_URL}/api/portfolio/skills/`, { cache: "no-store" }),
  ]);
  if (!profileRes.ok) throw new Error(`Backend responded ${profileRes.status}`);

  const profile: ProfileData = await profileRes.json();
  const skills: SkillData[] = skillsRes.ok ? await skillsRes.json() : [];
  return { profile, featuredSkills: skills.filter((s) => s.is_featured) };
}

export default async function Home() {
  let data: Awaited<ReturnType<typeof getHomeData>> | null = null;
  let error: string | null = null;
  try {
    data = await getHomeData();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error || !data) {
    return (
      <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold">Portfolio content isn&apos;t set up yet</h1>
        <p className="max-w-md text-foreground/60">
          {error ??
            "Run oracle-backend/sql/portfolio_schema.sql and portfolio_seed.sql against the database, then refresh."}
        </p>
      </main>
    );
  }

  const { profile, featuredSkills } = data;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-14 px-6 py-20 md:flex-row-reverse md:justify-between md:gap-16 md:py-28">
      {profile.hero_image && (
        <div className="relative w-full max-w-xs shrink-0 md:w-2/5 md:max-w-none">
          <div
       
            aria-hidden="true"
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- see ProjectCard */}
          <img
            src={profile.hero_image}
            alt={profile.full_name}
            className="w-full"
          />
        </div>
      )}

      <div className="flex flex-col items-center text-center md:w-3/5 md:items-start md:text-left">
        <p className="mb-4 flex items-center gap-2 text-sm font-bold tracking-widest text-accent uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          {profile.role_title}
        </p>
        <h1 className="text-4xl leading-[1.1] font-extrabold tracking-tight text-balance sm:text-5xl md:text-6xl">
          {profile.hero_heading}
        </h1>
        <p className="my-6 max-w-xl text-lg leading-relaxed text-foreground/70">
          {profile.hero_bio}
        </p>

        {featuredSkills.length > 0 && (
          <div className="mb-8 flex flex-wrap justify-center gap-2 md:justify-start">
            {featuredSkills.map((skill) => (
              <span
                key={skill.id}
                className="rounded-full border border-foreground/15 bg-foreground/5 px-3 py-1 text-xs font-semibold transition-colors hover:border-accent/50 hover:text-accent"
              >
                {skill.name}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-6">
          <Link
            href="/about"
            className="rounded-xl bg-foreground px-7 py-3 font-semibold text-background shadow-lg shadow-foreground/10 transition-all hover:scale-[1.03] hover:bg-accent hover:shadow-accent/30 active:scale-[0.98]"
          >
            About Me
          </Link>
          <Link
            href="/projects"
            className="group font-semibold transition-colors hover:text-accent"
          >
            View Projects
            <span className="ml-1 inline-block transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
}
