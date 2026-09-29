import ExperienceTimeline from "../components/portfolio/ExperienceTimeline";
import SkillBadges from "../components/portfolio/SkillBadges";
import StatCounter from "../components/portfolio/StatCounter";

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
type StatData = { id: number; label: string; value: number; suffix: string };
type SkillData = { id: number; name: string; category: string | null; is_featured: boolean };
type ExperienceData = {
  id: number;
  position: string;
  company: string;
  company_url: string | null;
  location: string | null;
  start_date: string;
  end_date: string | null;
  description: string;
};

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

async function getAboutData() {
  const [profileRes, statsRes, skillsRes, experienceRes] = await Promise.all([
    fetch(`${BACKEND_URL}/api/portfolio/profile/`, { cache: "no-store" }),
    fetch(`${BACKEND_URL}/api/portfolio/stats/`, { cache: "no-store" }),
    fetch(`${BACKEND_URL}/api/portfolio/skills/`, { cache: "no-store" }),
    fetch(`${BACKEND_URL}/api/portfolio/experience/`, { cache: "no-store" }),
  ]);
  if (!profileRes.ok) throw new Error(`Backend responded ${profileRes.status}`);

  const profile: ProfileData = await profileRes.json();
  const stats: StatData[] = statsRes.ok ? await statsRes.json() : [];
  const skills: SkillData[] = skillsRes.ok ? await skillsRes.json() : [];
  const experience: ExperienceData[] = experienceRes.ok ? await experienceRes.json() : [];

  return { profile, stats, skills, experience };
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-2 text-sm font-bold tracking-widest text-accent uppercase">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      {children}
    </p>
  );
}

export default async function AboutPage() {
  let data: Awaited<ReturnType<typeof getAboutData>> | null = null;
  let error: string | null = null;
  try {
    data = await getAboutData();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error || !data) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-20">
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          Failed to load: {error ?? "no profile found"}
        </p>
      </main>
    );
  }

  const { profile, stats, skills, experience } = data;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-20 md:py-28">
      <Eyebrow>Get to know me</Eyebrow>
      <h1 className="mb-12 text-4xl font-extrabold tracking-tight sm:text-5xl">
        {profile.about_heading}
      </h1>

      <div className="grid gap-10 md:grid-cols-3 md:gap-14">
        <div className="md:col-span-2">
          <h2 className="mb-3 text-sm font-bold tracking-widest text-foreground/50 uppercase">
            Biography
          </h2>
          {profile.about_bio.split("\n\n").map((paragraph, i) => (
            <p key={i} className="mb-4 text-base leading-relaxed text-foreground/75">
              {paragraph}
            </p>
          ))}
        </div>

        {profile.about_image && (
          <div className="overflow-hidden rounded-2xl border border-foreground/10 shadow-xl shadow-foreground/5">
            {/* eslint-disable-next-line @next/next/no-img-element -- see ProjectCard */}
            <img
              src={profile.about_image}
              alt={profile.full_name}
              className="h-full w-full object-cover"
            />
          </div>
        )}
      </div>

      {stats.length > 0 && (
        <div className="my-20 flex flex-wrap justify-around gap-10 rounded-3xl border border-foreground/10 bg-foreground/3 px-8 py-12">
          {stats.map((stat) => (
            <StatCounter key={stat.id} value={stat.value} suffix={stat.suffix} label={stat.label} />
          ))}
        </div>
      )}

      {skills.length > 0 && (
        <section className="mb-20">
          <h2 className="mb-5 text-sm font-bold tracking-widest text-foreground/50 uppercase">
            Skills
          </h2>
          <SkillBadges skills={skills} />
        </section>
      )}

      {experience.length > 0 && (
        <section>
          <h2 className="mb-10 text-sm font-bold tracking-widest text-foreground/50 uppercase">
            Experience
          </h2>
          <ExperienceTimeline items={experience} />
        </section>
      )}
    </main>
  );
}
