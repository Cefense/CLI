"use client";

import { useEffect, useRef, useState } from "react";

const steps = [
  ["01", "Observed", "A live attack becomes one reproducible behavior.", "Authentication bypass reconstructed from the network."],
  ["02", "Matched", "The behavior maps to a reachable file and line.", "src/auth/session.service.ts:87 · reachability 94%"],
  ["03", "Fix prepared", "A focused repair closes the shared control point.", "Ownership guard · 3 files · +18 −30"],
  ["04", "Proven closed", "Replay fails across the original and six variants.", "Evidence recorded · path no longer resolves"],
];

export function ScrollSequence() {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target instanceof HTMLElement) {
          const index = Number(visible.target.dataset.step ?? 0);
          setActive(index);
        }
      },
      { threshold: [0.35, 0.65], rootMargin: "-12% 0px -12%" },
    );
    refs.current.forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, []);

  const current = steps[active];

  return (
    <section id="fix" className="scroll-sequence" aria-labelledby="sequence-title">
      <div className="sequence-sticky">
        <p className="public-label">THE IMMUNITY LOOP</p>
        <div className="sequence-number">{current[0]}</div>
        <h2 id="sequence-title">{current[1]}</h2>
        <p>{current[2]}</p>
        <strong>{current[3]}</strong>
        <div className="sequence-progress" aria-label={`Step ${active + 1} of 4`}>
          {steps.map((step, index) => (
            <span key={step[0]} className={index === active ? "active" : ""} />
          ))}
        </div>
      </div>
      <div className="sequence-steps">
        {steps.map((step, index) => (
          <article
            key={step[0]}
            data-step={index}
            ref={(node) => { refs.current[index] = node; }}
          >
            <span>{step[0]}</span>
            <div>
              <small>{step[1]}</small>
              <h3>{step[2]}</h3>
              <p>{step[3]}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
