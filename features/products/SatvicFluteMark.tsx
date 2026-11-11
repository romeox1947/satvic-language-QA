export default function SatvicFluteMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M23 10C18 6 18 2 22 2c5 0 6 4 2 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M22 5c-1 1-1 2 0 3 2-1 2-2 0-3Z" fill="currentColor" />
      <path d="M18 13c1-5 12-6 15 1 1 2 1 4 0 6l-3 3c-1 5-7 7-11 3l-3-4c-2-2-1-7 2-9Z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 14c2-3 8-4 12-1M16 18c1-3 2-5 4-6M31 12l4 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M13 21c7 1 15 1 24-1M14 24c7 1 15 1 23-1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M18 24l-4 5m15-5 5 5M14 29c-2 3-3 6-3 10m18-10c4 3 6 6 7 10M11 39c7 2 17 2 25 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 20v1m8-1v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
