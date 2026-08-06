import concepts from "../concepts.json";
import { ConceptLanding } from "../concept-ui";

export function generateStaticParams() {
  return concepts.map((concept) => ({ variant: concept.id }));
}

export default async function ClarityConcept({
  params,
}: {
  params: Promise<{ variant: string }>;
}) {
  const { variant } = await params;
  const concept = concepts.find((item) => item.id === variant) ?? concepts[0];
  const index = concepts.findIndex((item) => item.id === concept.id);
  const previous = concepts[(index + concepts.length - 1) % concepts.length];
  const next = concepts[(index + 1) % concepts.length];

  return <ConceptLanding concept={concept} previous={previous} next={next} />;
}
