/** From this hour Sydney time, a pass spent on today opens tomorrow as well. */
export const LATE_PASS_HOUR = 16;

/** True from 4pm Sydney, for the button's wording. */
export const latePassNow = () =>
  Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "2-digit", hourCycle: "h23" }).format(new Date())) >= LATE_PASS_HOUR;
