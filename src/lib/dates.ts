const HOTEL_TIME_ZONE = "Asia/Colombo";

export function hotelToday(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: HOTEL_TIME_ZONE }).format(date);
}

export function hotelDayBounds(date: string) {
  const start = new Date(`${date}T00:00:00+05:30`);
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}
