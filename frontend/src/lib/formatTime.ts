export function formatEventTime(timeInput: any): string {
  if (!timeInput) return '-';

  try {
    let dateObj: Date;

    // 1. If it's already a number (timestamp in ms)
    if (typeof timeInput === 'number') {
      dateObj = new Date(timeInput);
    } 
    // 2. If it's a string containing numbers only (stringified timestamp ms)
    else if (typeof timeInput === 'string' && /^\d+$/.test(timeInput)) {
      dateObj = new Date(Number(timeInput));
    } 
    // 3. Try parsing string formats
    else {
      dateObj = new Date(timeInput);
      
      // If native Date fails and it looks like DD/MM/YYYY HH:MM:SS
      if (isNaN(dateObj.getTime()) && typeof timeInput === 'string') {
        const parts = timeInput.split(/[\s/:]+/);
        if (parts.length >= 3) {
          // Attempt custom parse (very basic fallback)
          dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T${parts[3] || '00'}:${parts[4] || '00'}:${parts[5] || '00'}`);
        }
      }
    }

    // Check if valid date
    if (isNaN(dateObj.getTime())) {
      return String(timeInput); // Fallback to raw string if parsing fails
    }

    // Format output: "06 Aug 2026, 17:42:23"
    const opts: Intl.DateTimeFormatOptions = { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };

    return new Intl.DateTimeFormat('en-GB', opts).format(dateObj);
  } catch (e) {
    return String(timeInput);
  }
}
