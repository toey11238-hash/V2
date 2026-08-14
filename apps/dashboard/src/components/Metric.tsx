import type { ReactNode } from 'react';

export function Metric({ label, value, detail, icon }: { label: string; value: ReactNode; detail: string; icon?: ReactNode }) {
  return <article className="metric-card">
    <div className="metric-top"><span>{label}</span>{icon}</div>
    <div className="metric-value">{value}</div>
    <p>{detail}</p>
  </article>;
}
