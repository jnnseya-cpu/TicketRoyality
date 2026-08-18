import * as React from 'react';

/**
 * Minimal formatting for organiser-written (and AI-drafted) descriptions.
 *
 * The event-draft assistant writes `**bold**` markdown, and the page printed the
 * asterisks raw — "**Kinshasa**" on a live event page. This renders exactly the three
 * things a description legitimately uses — paragraphs, bold, italics — as React nodes,
 * never as injected HTML, so a description can format text and can never carry markup.
 * Anything fancier than that does not belong in an event description.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n{2,}/).filter((para) => para.trim().length > 0);
  return (
    <div className={className}>
      {paragraphs.map((para, index) => (
        <p key={index} className="whitespace-pre-line leading-relaxed [&:not(:first-child)]:mt-4">
          {inline(para)}
        </p>
      ))}
    </div>
  );
}

function inline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // **bold** first; *italic* inside the remaining plain segments.
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      nodes.push(<strong key={`b${i}`}>{part}</strong>);
      return;
    }
    const italics = part.split(/\*([^*\n]+)\*/g);
    italics.forEach((segment, j) => {
      if (j % 2 === 1) nodes.push(<em key={`i${i}-${j}`}>{segment}</em>);
      else if (segment) nodes.push(segment);
    });
  });
  return nodes;
}
