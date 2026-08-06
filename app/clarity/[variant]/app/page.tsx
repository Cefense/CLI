import concepts from "../../concepts.json";
import { PrototypeWorkspace } from "../../prototype-workspace";

export function generateStaticParams() {
  return concepts.map((concept) => ({ variant: concept.id }));
}

export default async function PrototypeApp({ params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  const concept = concepts.find((item) => item.id === variant) ?? concepts[0];
  return <PrototypeWorkspace concept={concept} />;
}
