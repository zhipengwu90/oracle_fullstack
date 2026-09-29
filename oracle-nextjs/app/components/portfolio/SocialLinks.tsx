import type { ComponentType } from "react";
import { GithubIcon, LinkedInIcon } from "./Icons";

type SocialLinkData = {
  id: number;
  platform: string;
  label: string;
  url: string;
};

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  github: GithubIcon,
  linkedin: LinkedInIcon,
};

export default function SocialLinks({
  links,
  className = "",
}: {
  links: SocialLinkData[];
  className?: string;
}) {
  const visible = links.filter((link) => link.platform !== "email");
  if (visible.length === 0) return null;

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {visible.map((link) => {
        const Icon = ICONS[link.platform];
        return (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            className="text-foreground/60 transition-all hover:scale-110 hover:text-accent"
          >
            {Icon ? <Icon className="h-5 w-5" /> : link.label}
          </a>
        );
      })}
    </div>
  );
}
