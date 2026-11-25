'use client';

import { useEffect, useState } from 'react';

type ClientDateTimeProps = {
  value: string | Date;
  className?: string;
  title?: string;
};

const FORMAT_LOCALE = 'en-IN';
const UTC_TIME_ZONE = 'UTC';

function formatDateTime(value: string | Date, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  return new Intl.DateTimeFormat(FORMAT_LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone,
    timeZoneName: 'short',
  }).format(date);
}

export function ClientDateTime({ value, className, title }: ClientDateTimeProps) {
  const [timeZone, setTimeZone] = useState(UTC_TIME_ZONE);
  const date = value instanceof Date ? value : new Date(value);
  const isoValue = Number.isNaN(date.getTime()) ? undefined : date.toISOString();

  useEffect(() => {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTimeZone) setTimeZone(browserTimeZone);
  }, []);

  return <time dateTime={isoValue} className={className} title={title || timeZone}>
    {formatDateTime(value, timeZone)}
  </time>;
}
