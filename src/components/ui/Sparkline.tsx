/**
 * Reusable SVG sparkline component.
 *
 * Renders a mini trend line from an array of values (newest-first).
 * Optionally shows a dashed goal line and colours the trend green/red
 * depending on whether the latest value meets the goal.
 */
export function Sparkline({
  values,
  goalValue,
  width = 64,
  height = 20,
  color,
}: {
  values: (number | null)[];
  goalValue?: number;
  width?: number;
  height?: number;
  /** Override auto-colour (green/red based on goal). */
  color?: string;
}) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <span className="text-gray-300 text-[10px]">—</span>;

  const allNums = goalValue !== undefined ? [...nums, goalValue] : nums;
  const min = Math.min(...allNums);
  const max = Math.max(...allNums);
  const range = max - min || 1;
  const pad = 2;

  // Reverse so oldest is on the left
  const reversed = [...values].reverse();
  const points: string[] = [];
  for (let i = 0; i < reversed.length; i++) {
    if (reversed[i] !== null) {
      const x = pad + (i / (reversed.length - 1)) * (width - pad * 2);
      const y = pad + (1 - (reversed[i]! - min) / range) * (height - pad * 2);
      points.push(`${x},${y}`);
    }
  }

  const goalY =
    goalValue !== undefined
      ? pad + (1 - (goalValue - min) / range) * (height - pad * 2)
      : undefined;

  const lastVal = nums[0]; // newest value (nums preserves newest-first from filter)
  const latestFromReversed = nums[nums.length - 1]; // but points are built from reversed, so last plotted = last of reversed non-null
  const trending =
    goalValue !== undefined ? latestFromReversed >= goalValue : true;
  const strokeColor = color ?? (trending ? "#10B981" : "#EF4444");

  return (
    <svg width={width} height={height} className="inline-block">
      {/* Goal line */}
      {goalY !== undefined && (
        <line
          x1={pad}
          y1={goalY}
          x2={width - pad}
          y2={goalY}
          stroke="#9CA3AF"
          strokeWidth="0.5"
          strokeDasharray="2,2"
        />
      )}
      {/* Trend line */}
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(" ")}
      />
    </svg>
  );
}
