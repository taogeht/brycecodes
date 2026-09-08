import { act, fireEvent, render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./LoginPage', () => ({ onLogin }: any) => (
  <button onClick={() => onLogin({ id: 'student', username: 'student', display_name: 'Student', user_type: 'student' })}>Log in</button>
));
jest.mock('./TeacherDashboard', () => () => <div>Teacher dashboard</div>);

test('opens ten 9×9 cards directly and offers another round', async () => {
  const cards = Array.from({ length: 10 }, (_, i) => ({
    card_id: i, card_state_id: String(i), front: `1 × ${i % 9 + 1}`,
    back: String(i % 9 + 1), next_review: '2099-01-01',
    interval_days: 1, ease_factor: 2.5, repetitions: 1
  }));
  global.fetch = jest.fn().mockImplementation((url: string) => Promise.resolve({
    ok: true,
    json: async () => url.includes('/review/') ? cards[0] : cards
  }));
  window.history.replaceState({}, '', '/12x12/?deck=old-deck');
  render(<App />);
  fireEvent.click(screen.getByText('Log in'));
  await screen.findByText(/Card 1 of 10/);
  expect(fetch).toHaveBeenCalledWith('/12x12/api/cards?limit=10&set=9x9', expect.anything());
  expect(screen.queryByText('Choose a deck')).not.toBeInTheDocument();
  jest.useFakeTimers();
  for (let i = 0; i < 10; i++) {
    fireEvent.click(screen.getByText(cards[i].front));
    fireEvent.click(screen.getByRole('button', { name: 'good' }));
    await act(async () => { await Promise.resolve(); });
    act(() => { jest.advanceTimersByTime(1000); });
  }
  expect(screen.getByText(/Session Complete/)).toBeInTheDocument();
  expect(screen.getByText('Done for now')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Practice 10 more'));
  await screen.findByText(/Card 1 of 10/);
  expect((fetch as jest.Mock).mock.calls.filter(([url]) => url.includes('/cards?'))).toHaveLength(2);
  jest.useRealTimers();
});
