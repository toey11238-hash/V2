export interface JobFairnessSignals { inFlight: number; recentStarts: number; priority: number; createdAtMs: number; }
export function jobPriorityBand(priority:number):0|1|2{
  if(!Number.isFinite(priority))return 2;
  if(priority>=90)return 0;
  if(priority>=70)return 1;
  return 2;
}
export function compareJobFairness(a: JobFairnessSignals, b: JobFairnessSignals): number {
  const bandA=jobPriorityBand(a.priority),bandB=jobPriorityBand(b.priority);
  if(bandA!==bandB)return bandA-bandB;
  if (a.inFlight !== b.inFlight) return a.inFlight - b.inFlight;
  if (a.recentStarts !== b.recentStarts) return a.recentStarts - b.recentStarts;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.createdAtMs - b.createdAtMs;
}
