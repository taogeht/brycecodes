import { useEffect, useState } from 'react';
import { CardDTO, Grade } from './types';
import { statusFor } from './lib/time';
import LoginPage from './LoginPage';
import TeacherDashboard from './TeacherDashboard';

interface User {
  id: string;
  username: string;
  display_name: string;
  user_type: string;
}

type PracticeSet = '9x9' | 'full';
type SessionLength = number | 'endless';

interface SharedDeckInfo {
  id: string;
  name: string;
  description: string;
  card_count: number;
}

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function extractDeckCode(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const uuidMatch = trimmed.match(UUID_REGEX);
  if (uuidMatch) return uuidMatch[0];

  const lower = trimmed.toLowerCase();
  const queryKey = lower.includes('deck=') ? 'deck=' : lower.includes('deck:') ? 'deck:' : null;
  if (queryKey) {
    const start = lower.indexOf(queryKey) + queryKey.length;
    const remainder = trimmed.slice(start);
    return remainder.split(/[\s&#?]/)[0];
  }

  return trimmed;
}

function getDeckFromQuery(): string {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.search);
    const deck = params.get('deck') ?? '';
    return deck;
  } catch {
    return '';
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [sessionSize, setSessionSize] = useState<SessionLength | null>(null);
  const [practiceSet, setPracticeSet] = useState<PracticeSet | null>(null);
  const [cards, setCards] = useState<CardDTO[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialDeckFromUrl = typeof window !== 'undefined' ? getDeckFromQuery() : '';
  const [deckOverride, setDeckOverride] = useState<string | null>(initialDeckFromUrl || null);
  const [pendingDeckInput, setPendingDeckInput] = useState<string>(initialDeckFromUrl);
  const normalizedPendingDeckCode = extractDeckCode(pendingDeckInput);
  const deckCodeIsUuid = UUID_REGEX.test(normalizedPendingDeckCode);
  const [pendingDeckInfo, setPendingDeckInfo] = useState<SharedDeckInfo | null>(null);
  const [pendingDeckInfoStatus, setPendingDeckInfoStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [pendingDeckInfoError, setPendingDeckInfoError] = useState<string | null>(null);
  const [activeDeckInfo, setActiveDeckInfo] = useState<SharedDeckInfo | null>(null);
  const [availableDecks, setAvailableDecks] = useState<SharedDeckInfo[]>([]);
  const [availableDecksStatus, setAvailableDecksStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [availableDecksError, setAvailableDecksError] = useState<string | null>(null);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('default-12x12');
  const isTeacherRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/12x12/teacher');
  const handleDeckInputChange = (value: string) => {
    setSelectedDeckId('manual-input');
    setPendingDeckInput(value);
    setPendingDeckInfoStatus('idle');
  };

  useEffect(() => {
    if (!currentUser) return;
    if (isTeacherRoute && currentUser.user_type !== 'teacher') {
      setCurrentUser(null);
      window.location.href = '/12x12/';
    }
  }, [currentUser, isTeacherRoute]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!currentUser || currentUser.user_type === 'teacher') return;
    if (!normalizedPendingDeckCode) {
      setPendingDeckInfo(null);
      setPendingDeckInfoStatus('idle');
      setPendingDeckInfoError(null);
      return;
    }
    if (!deckCodeIsUuid) {
      setPendingDeckInfo(null);
      setPendingDeckInfoStatus('idle');
      setPendingDeckInfoError(null);
      return;
    }

    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      try {
        setPendingDeckInfoStatus('loading');
        setPendingDeckInfoError(null);
        const response = await fetch(`/12x12/api/decks/${normalizedPendingDeckCode}`, {
          headers: { 'X-User-Id': currentUser.id },
          signal: controller.signal
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) {
          const message = data?.error ?? `Unable to load deck (${response.status})`;
          throw new Error(message);
        }
        if (!controller.signal.aborted) {
          setPendingDeckInfoError(null);
          setPendingDeckInfo({
            id: data.id,
            name: data.name,
            description: data.description ?? '',
            card_count: data.card_count ?? 0
          });
          setPendingDeckInfoStatus('success');
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setPendingDeckInfo(null);
        setPendingDeckInfoStatus('error');
        setPendingDeckInfoError(
          err instanceof Error ? err.message : 'Unable to load deck'
        );
      }
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [normalizedPendingDeckCode, deckCodeIsUuid, currentUser]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (normalizedPendingDeckCode) {
      params.set('deck', normalizedPendingDeckCode);
    } else {
      params.delete('deck');
    }
    const query = params.toString();
    const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', newUrl);
  }, [normalizedPendingDeckCode]);

  useEffect(() => {
    if (!deckOverride) {
      setActiveDeckInfo(null);
      return;
    }
    if (!currentUser || currentUser.user_type === 'teacher') return;
    if (activeDeckInfo && activeDeckInfo.id === deckOverride) return;

    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`/12x12/api/decks/${deckOverride}`, {
          headers: { 'X-User-Id': currentUser.id },
          signal: controller.signal
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) {
          throw new Error(data?.error ?? `Unable to load deck (${response.status})`);
        }
        if (!controller.signal.aborted) {
          setActiveDeckInfo({
            id: data.id,
            name: data.name,
            description: data.description ?? '',
            card_count: data.card_count ?? 0
          });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn('Unable to fetch active deck info', err);
        setActiveDeckInfo(null);
      }
    })();

    return () => controller.abort();
  }, [deckOverride, currentUser, activeDeckInfo]);

  useEffect(() => {
    if (!currentUser || currentUser.user_type === 'teacher') return;
    let active = true;
    setAvailableDecksStatus('loading');
    setAvailableDecksError(null);
    (async () => {
      try {
        const response = await fetch('/12x12/api/decks', {
          headers: { 'X-User-Id': currentUser.id }
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data)) {
          throw new Error(data?.error ?? `Unable to load decks (${response.status})`);
        }
        if (!active) return;
        setAvailableDecks(data);
        setAvailableDecksStatus('success');
      } catch (err) {
        if (!active) return;
        setAvailableDecks([]);
        setAvailableDecksStatus('error');
        setAvailableDecksError(err instanceof Error ? err.message : 'Unable to load decks');
      }
    })();

    return () => {
      active = false;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!deckCodeIsUuid) return;
    const match = availableDecks.find(deck => deck.id === normalizedPendingDeckCode);
    if (match && selectedDeckId !== match.id) {
      setSelectedDeckId(match.id);
    }
  }, [availableDecks, deckCodeIsUuid, normalizedPendingDeckCode, selectedDeckId]);

  useEffect(() => {
    if (
      sessionSize !== null &&
      practiceSet !== null &&
      currentUser &&
      currentUser.user_type !== 'teacher'
    ) {
      let active = true;
      setLoading(true);
      setError(null);
      (async () => {
        try {
          const params = new URLSearchParams();
          if (typeof sessionSize === 'number') {
            params.set('limit', String(sessionSize));
          }
          params.set('set', practiceSet);
          if (deckOverride) {
            params.set('deck', deckOverride);
          }
          const res = await fetch(`/12x12/api/cards?${params.toString()}`, {
            headers: { 'X-User-Id': currentUser.id }
          });
          if (!res.ok) {
            throw new Error(`Failed to load cards: ${res.status}`);
          }
          const data: CardDTO[] = await res.json();
          if (active) {
            setCards(data);
          }
        } catch (err) {
          console.error('Failed to fetch cards', err);
          if (active) {
            setCards([]);
            setError('Unable to load cards right now. Please try again.');
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      })();
      return () => {
        active = false;
      };
    }
  }, [sessionSize, practiceSet, currentUser, deckOverride]);

  // Show login page if no user is logged in
  if (!currentUser) {
    return (
      <LoginPage
        onLogin={setCurrentUser}
        mode={isTeacherRoute ? 'teacher' : 'student'}
      />
    );
  }

  // Show teacher dashboard if user is teacher
  if (currentUser.user_type === 'teacher') {
    if (!isTeacherRoute) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#f5f5f5',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '48px',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            textAlign: 'center',
            maxWidth: '520px'
          }}>
            <h1 style={{ marginBottom: '16px', color: '#dc3545' }}>Teacher Portal Required</h1>
            <p style={{ marginBottom: '24px', color: '#666' }}>
              Teacher accounts must sign in from <code>/12x12/teacher</code>.
            </p>
            <button
              onClick={() => {
                setCurrentUser(null);
                window.location.href = '/12x12/teacher';
              }}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Go to Teacher Login
            </button>
          </div>
        </div>
      );
    }
    return <TeacherDashboard userId={currentUser.id} onLogout={() => setCurrentUser(null)} />;
  }

  if (practiceSet === null || sessionSize === null) {
    return (
      <SessionSetup
        deckInput={pendingDeckInput}
        normalizedDeckCode={normalizedPendingDeckCode}
        deckInfo={pendingDeckInfo}
        deckInfoStatus={pendingDeckInfoStatus}
        deckInfoError={pendingDeckInfoError}
        availableDecks={availableDecks}
        availableDecksStatus={availableDecksStatus}
        availableDecksError={availableDecksError}
        selectedDeckId={selectedDeckId}
        onDeckInputChange={handleDeckInputChange}
        onDeckSelect={(deckId) => {
          if (deckId === 'default-12x12' || deckId === 'builtin-9x9') {
            setSelectedDeckId(deckId);
            setPendingDeckInput('');
            setPendingDeckInfo(null);
            setPendingDeckInfoStatus('idle');
            setPendingDeckInfoError(null);
            return;
          }
          if (deckId) {
            setSelectedDeckId(deckId);
            setPendingDeckInput(deckId);
            const match = availableDecks.find(deck => deck.id === deckId);
            if (match) {
              setPendingDeckInfo(match);
              setPendingDeckInfoStatus('success');
              setPendingDeckInfoError(null);
            }
          } else {
            setSelectedDeckId('default-12x12');
            setPendingDeckInput('');
            setPendingDeckInfo(null);
            setPendingDeckInfoStatus('idle');
            setPendingDeckInfoError(null);
          }
        }}
        onStart={({ size, chosenSet, deckId }) => {
          setError(null);
          setCards([]);
          setCurrentCardIndex(0);
          setPracticeSet(chosenSet);
          setSessionSize(size);
          setDeckOverride(deckId ?? null);
          if (deckId && pendingDeckInfo && pendingDeckInfo.id === deckId) {
            setActiveDeckInfo(pendingDeckInfo);
          } else if (!deckId) {
            setActiveDeckInfo(null);
          }
          if (deckId) {
            setPendingDeckInput(deckId);
          }
        }}
      />
    );
  }

  if (loading) return <div>Loading…</div>;

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '48px',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          textAlign: 'center',
          maxWidth: '520px'
        }}>
          <h1 style={{ marginBottom: '16px', color: '#dc3545' }}>Something went wrong</h1>
          <p style={{ marginBottom: '24px', color: '#666' }}>{error}</p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              setCards([]);
              setCurrentCardIndex(0);
              setPracticeSet(null);
              setSessionSize(null);
            }}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Back to Session Setup
          </button>
        </div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '48px',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          textAlign: 'center',
          maxWidth: '520px'
        }}>
          <h1 style={{ marginBottom: '16px', color: '#17a2b8' }}>All caught up!</h1>
          <p style={{ marginBottom: '32px', color: '#666' }}>
            There aren't any cards due for review right now. Check back later or start a new session once cards become due.
          </p>
          <button
            onClick={() => {
              setSessionSize(null);
              setLoading(true);
              setCards([]);
              setPracticeSet(null);
              setError(null);
              setCurrentCardIndex(0);
            }}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Back to Session Setup
          </button>
        </div>
      </div>
    );
  }

  if (currentCardIndex >= cards.length) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '48px',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <h1 style={{ marginBottom: '16px', color: '#28a745' }}>🎉 Session Complete!</h1>
          <p style={{ marginBottom: '32px', color: '#666' }}>
            You've reviewed all {cards.length} cards in this session.
          </p>
          <button
            onClick={() => {
              setSessionSize(null);
              setLoading(true);
              setCards([]);
              setPracticeSet(null);
              setCurrentCardIndex(0);
            }}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Start New Session
          </button>
        </div>
      </div>
    );
  }

  const currentCard = cards[currentCardIndex];
  const isLastCard = currentCardIndex === cards.length - 1;
  const totalCardsLabel = sessionSize === 'endless' ? '∞' : String(cards.length);

  return (
    <div>
      <div style={{ padding: '16px', borderBottom: '1px solid #ddd', marginBottom: '16px' }}>
          <button 
            onClick={() => {
              setSessionSize(null);
              setLoading(true);
              setCards([]);
              setPracticeSet(null);
              setError(null);
              setCurrentCardIndex(0);
            }}
            style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            ← Back to Session Setup
        </button>
        <div>
          <h2 style={{ margin: '8px 0' }}>
            {currentUser.display_name}'s Practice: Card {currentCardIndex + 1} of {totalCardsLabel}
          </h2>
          <div style={{ fontSize: '14px', color: '#666', margin: '0 0 8px 0' }}>
            @{currentUser.username} • Student Account
          </div>
          <div style={{ fontSize: '14px', color: '#666' }}>
            Practice Set: {practiceSet === '9x9' ? '9×9 Times Table' : 'Full Times Table'}
          </div>
          {deckOverride && (
            <div style={{ fontSize: '14px', color: '#666' }}>
              Deck: {activeDeckInfo?.name ?? 'Shared Deck'}
              {activeDeckInfo &&
                ` • ${activeDeckInfo.card_count} card${activeDeckInfo.card_count === 1 ? '' : 's'}`}
            </div>
          )}
        </div>
      </div>
      <SingleCard
        card={currentCard}
        onUpdate={(updated) => {
          setCards(prev => prev.map(x => x.card_state_id === updated.card_state_id ? updated : x));
        }}
        onNext={() => setCurrentCardIndex(prev => prev + 1)}
        isLastCard={isLastCard}
        userId={currentUser.id}
      />
    </div>
  );
}

function SessionSetup({
  onStart,
  deckInput,
  normalizedDeckCode,
  deckInfo,
  deckInfoStatus,
  deckInfoError,
  availableDecks,
  availableDecksStatus,
  availableDecksError,
  selectedDeckId,
  onDeckInputChange,
  onDeckSelect
}: {
  onStart: (options: { size: SessionLength; chosenSet: PracticeSet; deckId?: string | null }) => void;
  deckInput: string;
  normalizedDeckCode: string;
  deckInfo: SharedDeckInfo | null;
  deckInfoStatus: 'idle' | 'loading' | 'success' | 'error';
  deckInfoError: string | null;
  availableDecks: SharedDeckInfo[];
  availableDecksStatus: 'idle' | 'loading' | 'success' | 'error';
  availableDecksError: string | null;
  selectedDeckId: string;
  onDeckInputChange: (value: string) => void;
  onDeckSelect: (deckId: string | null) => void;
}) {
  const hasDeckOverride = normalizedDeckCode.length > 0;
  const deckCodeIsUuid = UUID_REGEX.test(normalizedDeckCode);
  const isDefaultSelection = selectedDeckId === 'default-12x12' || selectedDeckId === 'builtin-9x9';
  const deckReady =
    !hasDeckOverride ||
    isDefaultSelection ||
    (deckInfoStatus === 'success' && deckInfo && deckInfo.id === normalizedDeckCode);

  const sessionOptions: { id: SessionLength; label: string; description?: string }[] = [
    { id: 5, label: '5' },
    { id: 10, label: '10' },
    { id: 15, label: '15' },
    { id: 20, label: '20' },
    { id: 'endless', label: '∞', description: 'Endless practice' }
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '48px',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <h1 style={{ marginBottom: '8px', color: '#333' }}>Flashcards!</h1>
        <p style={{ marginBottom: '16px', color: '#666' }}>Choose your deck, then pick how many cards to practice.</p>

        <div style={{ textAlign: 'left', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', color: '#555', marginBottom: '6px' }}>
              Choose a deck
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              {[
                { id: 'default-12x12', name: '12×12 deck (default)', info: 'Full table' },
                { id: 'builtin-9x9', name: '9×9 deck', info: 'Default subset' },
                ...availableDecks.map(deck => ({
                  id: deck.id,
                  name: deck.name,
                  info: `${deck.card_count} card${deck.card_count === 1 ? '' : 's'}`
                }))
              ].map(choice => {
                const isSelected = selectedDeckId === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    onClick={() => onDeckSelect(choice.id)}
                    disabled={availableDecksStatus === 'loading'}
                    style={{
                      padding: '12px',
                      textAlign: 'left',
                      borderRadius: '10px',
                      border: isSelected ? '2px solid #007bff' : '1px solid #ddd',
                      backgroundColor: isSelected ? '#e7f1ff' : '#fff',
                      cursor: availableDecksStatus === 'loading' ? 'not-allowed' : 'pointer',
                      boxShadow: isSelected ? '0 4px 12px rgba(0,123,255,0.15)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#333' }}>{choice.name}</div>
                    <div style={{ fontSize: '12px', color: '#777', marginTop: '4px' }}>{choice.info}</div>
                  </button>
                );
              })}
            </div>
            {availableDecksStatus === 'loading' && (
              <div style={{ fontSize: '12px', color: '#555', marginTop: '6px' }}>Loading decks…</div>
            )}
            {availableDecksStatus === 'error' && availableDecksError && (
              <div style={{ fontSize: '12px', color: '#dc3545', marginTop: '6px' }}>
                {availableDecksError}
              </div>
            )}
            {availableDecksStatus === 'success' && availableDecks.length === 0 && (
              <div style={{ fontSize: '12px', color: '#777', marginTop: '6px' }}>
                No shared decks available yet.
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', color: '#555', marginBottom: '6px' }}>
              Deck share link or code (optional)
            </label>
            <input
              value={deckInput}
              onChange={e => onDeckInputChange(e.target.value)}
              placeholder="Paste the link or code your teacher shared"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #ccc'
              }}
            />
            <div style={{ fontSize: '12px', color: '#777', marginTop: '6px' }}>
              Looks like <code>https://example.com?deck=123e4567-e89b-12d3-a456-426614174000</code> or just the code itself.
            </div>
            {hasDeckOverride && !deckCodeIsUuid && (
              <div style={{ fontSize: '12px', color: '#dc3545', marginTop: '8px' }}>
                Keep typing the full code — it should be 36 characters long.
              </div>
            )}
            {hasDeckOverride && deckCodeIsUuid && deckInfoStatus === 'loading' && (
              <div style={{ fontSize: '12px', color: '#555', marginTop: '8px' }}>
                Looking up deck…
              </div>
            )}
            {hasDeckOverride && deckCodeIsUuid && deckInfoStatus === 'error' && deckInfoError && (
              <div style={{ fontSize: '12px', color: '#dc3545', marginTop: '8px' }}>
                {deckInfoError}
              </div>
            )}
            {hasDeckOverride && deckCodeIsUuid && deckInfoStatus === 'success' && deckInfo && (
              <div style={{ fontSize: '12px', color: '#28a745', marginTop: '8px' }}>
                Ready: {deckInfo.name} • {deckInfo.card_count} card{deckInfo.card_count === 1 ? '' : 's'}
              </div>
            )}
          </div>
        </div>

        <p style={{ marginBottom: '16px', color: '#666' }}>How many cards would you like to practice?</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '32px' }}>
          {sessionOptions.map(option => (
            <button
              key={String(option.id)}
              onClick={() => {
                if (hasDeckOverride && !deckReady) return;
                const isNineDeck = selectedDeckId === 'builtin-9x9';
                const finalSet: PracticeSet = isNineDeck ? '9x9' : 'full';
                const chosenDeckId =
                  selectedDeckId === 'manual-input'
                    ? normalizedDeckCode
                    : selectedDeckId && selectedDeckId !== 'default-12x12' && selectedDeckId !== 'builtin-9x9'
                      ? selectedDeckId
                      : hasDeckOverride
                        ? normalizedDeckCode
                        : null;
                onStart({ size: option.id, chosenSet: finalSet, deckId: chosenDeckId });
              }}
              disabled={hasDeckOverride && !deckReady}
              style={{
                padding: '24px 32px',
                fontSize: '24px',
                fontWeight: 'bold',
                border: '2px solid #007bff',
                backgroundColor: hasDeckOverride && !deckReady ? '#f1f1f1' : 'white',
                color: hasDeckOverride && !deckReady ? '#999' : '#007bff',
                borderRadius: '8px',
                cursor: hasDeckOverride && !deckReady ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                minWidth: '120px'
              }}
            >
              {option.label}
              {option.description && (
                <div style={{ fontSize: '14px', fontWeight: 'normal', marginTop: '8px', color: '#555' }}>
                  {option.description}
                </div>
              )}
            </button>
          ))}
        </div>
        
        <p style={{ fontSize: '14px', color: '#999' }}>
          Cards will be selected from those due for review
        </p>
      </div>
    </div>
  );
}

function SingleCard({ 
  card, 
  onUpdate, 
  onNext, 
  isLastCard,
  userId
}: { 
  card: CardDTO; 
  onUpdate: (updated: CardDTO) => void; 
  onNext: () => void; 
  isLastCard: boolean;
  userId: string;
}) {
  const [showBack, setShowBack] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasAnswered, setHasAnswered] = useState(false);
  const color = statusFor(card.next_review); // red/yellow/green
  const due = color === 'red';

  const grade = async (label: Grade) => {
    if (busy || hasAnswered) return;
    setBusy(true);
    setHasAnswered(true);

    try {
      const res = await fetch(`/12x12/api/review/${card.card_state_id}`, {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'X-User-Id': userId
        },
        body: JSON.stringify({ grade: label })
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      onUpdate({ ...card,
        next_review: data.next_review,
        interval_days: data.interval_days,
        ease_factor: data.ease_factor,
        repetitions: data.repetitions
      });
      
      // Auto-advance to next card after grading
      setTimeout(() => {
        onNext();
        setShowBack(false);
        setHasAnswered(false);
      }, 1000);
    } catch {
      alert('Failed to submit review.');
      setBusy(false);
      setHasAnswered(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '70vh',
      padding: '20px'
    }}>
      <div style={{
        border: '2px solid #ddd',
        borderRadius: '12px',
        padding: '40px',
        minHeight: '300px',
        width: '100%',
        maxWidth: '600px',
        backgroundColor: 
          color === 'red' ? '#ffe5e5' :
          color === 'yellow' ? '#fff7cc' : '#e8ffe8',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        fontSize: '24px',
        fontWeight: 'bold',
        cursor: due && !showBack ? 'pointer' : 'default',
        transition: 'all 0.3s ease',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
      }}
      onClick={() => { 
        if (due && !showBack && !hasAnswered) {
          setShowBack(true);
        }
      }}
      onMouseOver={(e) => {
        if (due && !showBack && !hasAnswered) {
          e.currentTarget.style.transform = 'scale(1.02)';
          e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.15)';
        }
      }}
      onMouseOut={(e) => {
        if (due && !showBack && !hasAnswered) {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        }
      }}
      >
        <div style={{ marginBottom: '20px', color: '#666', fontSize: '14px' }}>
          {!showBack ? 'Question' : 'Answer'}
        </div>
        <div style={{ minHeight: '60px' }}>
          {showBack ? card.back : card.front}
        </div>
      </div>

      {showBack && !hasAnswered && (
        <div style={{ 
          marginTop: '30px', 
          display: 'flex', 
          gap: '16px',
          flexWrap: 'wrap',
          justifyContent: 'center'
        }}>
          {[
            { label: 'again', color: '#dc3545' },
            { label: 'hard', color: '#fd7e14' },
            { label: 'good', color: '#28a745' },
            { label: 'easy', color: '#007bff' }
          ].map(({ label, color }) => (
            <button
              key={label}
              onClick={(e) => { 
                e.stopPropagation(); 
                grade(label as 'again'|'hard'|'good'|'easy'); 
              }}
              disabled={busy}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: color,
                color: 'white',
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1,
                transition: 'all 0.2s ease',
                minWidth: '80px'
              }}
              onMouseOver={(e) => {
                if (!busy) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = `0 4px 8px ${color}40`;
                }
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {hasAnswered && (
        <div style={{ 
          marginTop: '20px', 
          padding: '12px 20px',
          backgroundColor: '#d4edda',
          border: '1px solid #c3e6cb',
          borderRadius: '8px',
          color: '#155724',
          fontSize: '14px'
        }}>
          ✓ Moving to next card...
        </div>
      )}

      {!due && !hasAnswered && (
        <div style={{ 
          marginTop: '20px', 
          padding: '12px 20px',
          backgroundColor: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '8px',
          color: '#721c24',
          fontSize: '14px'
        }}>
          This card is not due for review yet
        </div>
      )}
    </div>
  );
}
