"use client";

import { motion } from "framer-motion";

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

function formatMonthYear(dateStr: string): string {
  const [year, month] = dateStr.split("-").map(Number);
  return new Date(year, month - 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function formatRange(start: string, end: string | null): string {
  const startLabel = formatMonthYear(start);
  return `${startLabel} – ${end ? formatMonthYear(end) : "Present"}`;
}

export default function ExperienceTimeline({ items }: { items: ExperienceData[] }) {
  return (
    <ol>
      {items.map((item, i) => (
        <motion.li
          key={item.id}
          className="grid grid-cols-[1rem_1fr] gap-x-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex flex-col items-center">
            <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-accent shadow-[0_0_0_4px] shadow-accent/15" />
            {i < items.length - 1 && (
              <span className="my-1 w-px flex-1 bg-foreground/15" />
            )}
          </div>
          <div className="pb-10">
            <h3 className="text-xl font-bold tracking-tight">
              {item.position}{" "}
              {item.company_url ? (
                <a
                  href={item.company_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent"
                >
                  @{item.company}
                </a>
              ) : (
                <span className="text-accent">@{item.company}</span>
              )}
            </h3>
            <p className="text-sm font-medium text-foreground/60">
              {formatRange(item.start_date, item.end_date)}
              {item.location ? ` · ${item.location}` : ""}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-foreground/80">
              {item.description}
            </p>
          </div>
        </motion.li>
      ))}
    </ol>
  );
}
