import Link from "next/link";
import concepts from "./concepts.json";

export default function ClarityIndex() {
  return (
    <main className="clarity-index">
      <header>
        <Link href="/" className="clarity-brand">
          <span /> CEFENSE
        </Link>
        <p>5-SECOND CLARITY LAB</p>
      </header>
      <section>
        <div>
          <span>20 DIRECTIONS</span>
          <h1>One truth. Twenty ways to feel it.</h1>
          <p>
            Every direction uses an exact five-word promise, an exact 50-word
            explanation, and the same operational spine.
          </p>
        </div>
        <ol>
          {concepts.map((concept) => (
            <li key={concept.id}>
              <Link href={`/clarity/${concept.id}`}>
                <span>{concept.id}</span>
                <div>
                  <strong>{concept.name}</strong>
                  <p>{concept.promise}</p>
                </div>
                <i>Open</i>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
