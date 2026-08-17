export function FantasyIndexRank({ rank, variant = "plain" }: { rank?: number; variant?: "plain" | "badge" }) {
  if (!rank) return null;
  return <><span aria-hidden> · </span><strong className={`fi-rank ${variant === "badge" ? "fi-rank-badge" : ""}`} title={`Fantasy Index positional rank ${rank}`}>Fi {rank}</strong></>;
}
