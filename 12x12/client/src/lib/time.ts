export function statusFor(nextReview: string): 'red' | 'yellow' | 'green' {
  const now = new Date();
  const reviewDate = new Date(nextReview);
  const diffHours = (reviewDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  if (diffHours <= 0) return 'red';     // Due now or overdue
  if (diffHours <= 24) return 'yellow'; // Due within 24 hours
  return 'green'; // Due later
}
