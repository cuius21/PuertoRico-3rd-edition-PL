export function GameValue({
  value,
  kind = 'coin',
}: {
  value: number;
  kind?: 'coin' | 'star';
}) {
  const label = kind === 'coin' ? 'Dublony' : 'Punkty zwycięstwa';
  return (
    <span
      className={'pr-value pr-value--' + kind}
      role="img"
      aria-label={label + ': ' + value}
      title={label}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {kind === 'coin' ? (
          <>
            <circle
              cx="12"
              cy="12"
              r="10"
              fill="#edbc45"
              stroke="#996122"
              strokeWidth="1.5"
            />
            <circle cx="12" cy="12" r="7" fill="#ffe193" stroke="#c18b2c" />
            <path
              d="M12 7v10m-3-7 3-3 3 3m-6 4 3 3 3-3"
              fill="none"
              stroke="#bd8124"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </>
        ) : (
          <path
            d="m12 2.3 3 6.1 6.7 1-4.9 4.7 1.2 6.7-6-3.2-6 3.2 1.2-6.7L2.3 9.4l6.7-1Z"
            fill="#f8d578"
            stroke="#a27731"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        )}
      </svg>
      <span aria-hidden="true">{value}</span>
    </span>
  );
}

export function ValueText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\d+\s+(?:D|PZ)\b)/g).map((part, i) => {
        const value = part.match(/^(\d+)\s+(D|PZ)$/);
        return value ? (
          <GameValue
            key={i}
            value={Number(value[1])}
            kind={value[2] === 'D' ? 'coin' : 'star'}
          />
        ) : (
          part
        );
      })}
    </>
  );
}
