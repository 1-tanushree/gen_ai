export type Severity = 'HIGH' | 'MEDIUM' | 'LOW' | 'SAFE' | 'UNKNOWN';
export type OverruledStatus = 'overruled' | 'possibly_overruled' | 'safe' | 'unknown';

export interface OverruledEvidence {
  title: string;
  docid: number;
  date: string;
  court: string;
  phrase?: string;
  fragment?: string;
}

export interface OverruledResult {
  docid: number;
  status: OverruledStatus;
  severity: Severity;
  evidence: OverruledEvidence[];
  stage: 1 | 2 | null;
  error?: string;
}

export const checkOverruled = async (
  docid: number,
  caseName: string
): Promise<OverruledResult> => {
  const res = await fetch(
    `/api/check-overruled/${docid}?name=${encodeURIComponent(caseName)}`
  );
  if (!res.ok) throw new Error('Overruled check failed');
  return res.json();
};

export const severityConfig: Record<Severity, {
  label: string;
  labelHi: string;
  bg: string;
  border: string;
  text: string;
  dot: string;
  pulse: boolean;
}> = {
  HIGH: {
    label: 'OVERRULED',
    labelHi: 'खारिज',
    bg: 'bg-red-50',
    border: 'border-red-400',
    text: 'text-red-700',
    dot: 'bg-red-500',
    pulse: true,
  },
  MEDIUM: {
    label: 'POSSIBLY OVERRULED',
    labelHi: 'संभवतः खारिज',
    bg: 'bg-orange-50',
    border: 'border-orange-400',
    text: 'text-orange-700',
    dot: 'bg-orange-500',
    pulse: true,
  },
  LOW: {
    label: 'CAUTION',
    labelHi: 'सावधानी',
    bg: 'bg-yellow-50',
    border: 'border-yellow-400',
    text: 'text-yellow-700',
    dot: 'bg-yellow-500',
    pulse: false,
  },
  SAFE: {
    label: 'VALID LAW',
    labelHi: 'वैध कानून',
    bg: 'bg-green-50',
    border: 'border-green-300',
    text: 'text-green-700',
    dot: 'bg-green-500',
    pulse: false,
  },
  UNKNOWN: {
    label: 'CHECKING...',
    labelHi: 'जाँच हो रही है...',
    bg: 'bg-gray-50',
    border: 'border-gray-300',
    text: 'text-gray-500',
    dot: 'bg-gray-400',
    pulse: false,
  },
};
