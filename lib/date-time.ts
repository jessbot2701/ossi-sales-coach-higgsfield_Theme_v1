export const APP_TIME_ZONE = "Europe/Berlin";

type DateInput = Date | string | number;

function date(value: DateInput) {
  return value instanceof Date ? value : new Date(value);
}

export function formatAppDate(value: DateInput, dateStyle: "medium" | "long" = "medium") {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle,
    timeZone: APP_TIME_ZONE,
  }).format(date(value));
}

export function formatAppTime(value: DateInput) {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  }).format(date(value));
}

export function formatAppDateTime(value: DateInput) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIME_ZONE,
  }).format(date(value));
}
