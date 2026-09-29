"use client";

import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "framer-motion";

export default function StatCounter({
  value,
  suffix,
  label,
}: {
  value: number;
  suffix: string;
  label: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { duration: 2000 });
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (isInView) motionValue.set(value);
  }, [isInView, value, motionValue]);

  useEffect(() => {
    return springValue.on("change", (latest) => {
      if (ref.current) ref.current.textContent = String(Math.round(latest));
    });
  }, [springValue]);

  return (
    <div className="flex flex-col items-center">
      <span className="text-4xl font-extrabold tracking-tight text-accent sm:text-5xl">
        <span ref={ref}>0</span>
        {suffix}
      </span>
      <span className="mt-2 text-sm font-medium text-foreground/60">{label}</span>
    </div>
  );
}
