import { useState, useEffect, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface Student {
  id: string;
  username: string;
  display_name: string;
  total_reviews: number;
  correct_reviews: number;
  cards_completed: number;
  last_activity: string | null;
}

interface StudentStats {
  total_reviews: number;
  correct_reviews: number;
  cards_completed: number;
}

interface ReviewData {
  date: string;
  reviews_count: number;
  correct_count: number;
}

interface DeckReviewStats {
  deck_id: string | null;
  deck_name: string;
  total_reviews: number;
  correct_reviews: number;
  recentReviews: ReviewData[];
}

interface DeckSummary {
  id: string;
  name: string;
  description: string;
  created_at: string;
  created_by?: string | null;
  card_count: number;
}

interface DeckCard {
  id: number;
  front: string;
  back: string;
  created_at: string;
}

interface DeckFormCard {
  front: string;
  back: string;
}

interface DeckFormState {
  name: string;
  description: string;
  cards: DeckFormCard[];
}

const createEmptyDeckForm = (): DeckFormState => ({
  name: '',
  description: '',
  cards: [{ front: '', back: '' }]
});

const PICTURE_OPTIONS = [
  { id: '1', label: 'Dog 🐶' },
  { id: '2', label: 'Cat 🐱' },
  { id: '3', label: 'Rabbit 🐰' },
  { id: '4', label: 'Fox 🦊' },
  { id: '5', label: 'Bear 🐻' }
];

export default function TeacherDashboard({ onLogout, userId }: { onLogout: () => void; userId: string }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<DeckSummary | null>(null);
  const [deckCards, setDeckCards] = useState<DeckCard[]>([]);
  const [deckCardsLoading, setDeckCardsLoading] = useState(false);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [showDeckForm, setShowDeckForm] = useState(false);
  const [deckForm, setDeckForm] = useState<DeckFormState>(() => createEmptyDeckForm());
  const [deckFormError, setDeckFormError] = useState<string | null>(null);
  const [deckBusy, setDeckBusy] = useState(false);
  const [showAddCardForm, setShowAddCardForm] = useState(false);
  const [deckCardForm, setDeckCardForm] = useState({ front: '', back: '' });
  const [deckCardBusy, setDeckCardBusy] = useState(false);
  const [deckCardError, setDeckCardError] = useState<string | null>(null);
  const [deckShareCopy, setDeckShareCopy] = useState<{ deckId: string; kind: 'link' | 'code' } | null>(null);

  const resetDeckForm = () => setDeckForm(createEmptyDeckForm());

  const updateDeckFormCard = (index: number, field: 'front' | 'back', value: string) => {
    setDeckForm(prev => {
      const cards = prev.cards.map((card, idx) =>
        idx === index ? { ...card, [field]: value } : card
      );
      return { ...prev, cards };
    });
  };

  const addDeckFormCardRow = () => {
    setDeckForm(prev => ({
      ...prev,
      cards: [...prev.cards, { front: '', back: '' }]
    }));
  };

  const removeDeckFormCardRow = (index: number) => {
    setDeckForm(prev => {
      if (prev.cards.length === 1) return prev;
      const cards = prev.cards.filter((_, idx) => idx !== index);
      return {
        ...prev,
        cards: cards.length > 0 ? cards : [{ front: '', back: '' }]
      };
    });
  };
  const copyDeckValue = async (value: string, kind: 'link' | 'code', deckId: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setDeckShareCopy({ deckId, kind });
      setTimeout(() => {
        setDeckShareCopy(prev =>
          prev && prev.deckId === deckId && prev.kind === kind ? null : prev
        );
      }, 2000);
    } catch {
      window.prompt('Copy this deck info:', value);
    }
  };
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentStats, setStudentStats] = useState<StudentStats | null>(null);
  const [reviewData, setReviewData] = useState<ReviewData[]>([]);
  const [deckReviewStats, setDeckReviewStats] = useState<DeckReviewStats[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    displayName: '',
    username: '',
    picturePassword: '1'
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);

  const loadStudents = useCallback(async () => {
    try {
      const response = await fetch('/12x12/api/teacher/students', {
        headers: { 'X-User-Id': userId }
      });
      const data = await response.json();
      setStudents(data);
    } catch (err) {
      console.error('Failed to load students:', err);
    }
  }, [userId]);

  const loadDecks = useCallback(async () => {
    try {
      const response = await fetch('/12x12/api/teacher/decks', {
        headers: { 'X-User-Id': userId }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data)) {
        throw new Error(data?.error ?? `Failed to load decks (${response.status})`);
      }
      setDeckError(null);
      setDecks(data);
      if (selectedDeck) {
        const match = data.find((deck: DeckSummary) => deck.id === selectedDeck.id);
        if (!match) {
          setSelectedDeck(null);
          setDeckCards([]);
        } else {
          setSelectedDeck(prev => (prev ? { ...prev, card_count: match.card_count } : match));
        }
      }
    } catch (err) {
      console.error('Failed to load decks:', err);
      setDecks([]);
      setDeckError('Unable to load decks right now.');
      if (selectedDeck) {
        setSelectedDeck(null);
        setDeckCards([]);
      }
    }
  }, [userId, selectedDeck]);

  const loadDeckCards = useCallback(async (deck: DeckSummary) => {
    setDeckCardsLoading(true);
    setDeckCardError(null);
    try {
      const response = await fetch(`/12x12/api/teacher/decks/${deck.id}/cards`, {
        headers: { 'X-User-Id': userId }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error(data?.error ?? `Failed to load deck (${response.status})`);
      }
      const cards: DeckCard[] = Array.isArray(data.cards) ? data.cards : [];
      const cardCount =
        typeof data.card_count === 'number'
          ? data.card_count
          : cards.length;

      setDeckCards(cards);
      setSelectedDeck({
        id: data.deck.id,
        name: data.deck.name,
        description: data.deck.description ?? '',
        created_at: data.deck.created_at,
        created_by: data.deck.created_by ?? null,
        card_count: cardCount
      });
      setDeckError(null);
    } catch (err: any) {
      console.error('Failed to load deck cards:', err);
      setDeckCardError(err.message || 'Failed to load deck cards');
    } finally {
      setDeckCardsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    loadDecks();
  }, [loadDecks]);

  const loadStudentStats = async (student: Student) => {
    try {
      const response = await fetch(`/12x12/api/teacher/stats/${student.id}`, {
        headers: { 'X-User-Id': userId }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        const errorMessage =
          data?.error ?? `Failed to load stats (${response.status})`;
        throw new Error(errorMessage);
      }
      setSelectedStudent(student);
      setStudentStats(
        data?.stats ?? { total_reviews: 0, correct_reviews: 0, cards_completed: 0 }
      );
      setDeckReviewStats(
        Array.isArray(data?.deckStats) ? data.deckStats : []
      );
      setReviewData(Array.isArray(data?.recentReviews) ? data.recentReviews : []);
    } catch (err) {
      console.error('Failed to load student stats:', err);
      setStudentStats({ total_reviews: 0, correct_reviews: 0, cards_completed: 0 });
      setReviewData([]);
      setDeckReviewStats([]);
    }
  };

  const createDeck = async () => {
    const name = deckForm.name.trim();
    if (!name) {
      setDeckFormError('Please provide a deck name.');
      return;
    }

    const preparedCards = deckForm.cards.map((card, index) => ({
      index,
      front: card.front.trim(),
      back: card.back.trim()
    }));

    const nonEmptyCards = preparedCards.filter(card => card.front || card.back);
    const incompleteCard = nonEmptyCards.find(card => !card.front || !card.back);
    if (incompleteCard) {
      setDeckFormError(
        `Please provide both front and back for card ${incompleteCard.index + 1}.`
      );
      return;
    }

    const payload: {
      name: string;
      description?: string;
      cards?: Array<{ front: string; back: string }>;
    } = { name };

    if (deckForm.description.trim()) {
      payload.description = deckForm.description.trim();
    }

    if (nonEmptyCards.length > 0) {
      payload.cards = nonEmptyCards.map(card => ({
        front: card.front,
        back: card.back
      }));
    }

    setDeckBusy(true);
    setDeckFormError(null);

    try {
      const response = await fetch('/12x12/api/teacher/decks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error(data?.error || 'Failed to create deck');
      }

      const summary: DeckSummary = {
        id: data.id,
        name: data.name,
        description: data.description ?? '',
        created_at: data.created_at,
        created_by: data.created_by ?? null,
        card_count: data.card_count ?? (Array.isArray(data.cards) ? data.cards.length : 0)
      };

      setShowDeckForm(false);
      resetDeckForm();
      setDeckFormError(null);
      await loadDecks();
      await loadDeckCards(summary);
      setShowAddCardForm(false);
      setDeckCardForm({ front: '', back: '' });
      setDeckCardError(null);
    } catch (err: any) {
      setDeckFormError(err.message || 'Failed to create deck');
    } finally {
      setDeckBusy(false);
    }
  };

  const addCardToDeck = async () => {
    if (!selectedDeck) return;

    const front = deckCardForm.front.trim();
    const back = deckCardForm.back.trim();
    if (!front || !back) {
      setDeckCardError('Please provide both sides of the card.');
      return;
    }

    setDeckCardBusy(true);
    setDeckCardError(null);

    try {
      const response = await fetch(`/12x12/api/teacher/decks/${selectedDeck.id}/cards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId
        },
        body: JSON.stringify({ cards: [{ front, back }] })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error(data?.error || 'Failed to add card');
      }

      setDeckCardForm({ front: '', back: '' });

      const updatedSummary: DeckSummary = {
        ...selectedDeck,
        card_count:
          typeof data.card_count === 'number'
            ? data.card_count
            : selectedDeck.card_count + (data.added_cards ?? 0)
      };

      await loadDeckCards(updatedSummary);
      await loadDecks();
    } catch (err: any) {
      setDeckCardError(err.message || 'Failed to add card');
    } finally {
      setDeckCardBusy(false);
    }
  };

  const resetStudent = async (studentId: string, type: 'clear' | 'reset-srs') => {
    setActionLoading(type);
    try {
      const response = await fetch(`/12x12/api/teacher/${type}/${studentId}`, {
        method: 'POST',
        headers: { 'X-User-Id': userId }
      });
      const data = await response.json();
      
      if (data.success) {
        alert(data.message);
        loadStudents();
        if (selectedStudent?.id === studentId) {
          loadStudentStats(selectedStudent);
        }
      } else {
        alert('Failed to reset student data');
      }
    } catch (err) {
      alert('Network error. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const createStudent = async () => {
    if (!addForm.displayName.trim() || !addForm.username.trim()) {
      setAddError('Please enter a display name and username.');
      return;
    }

    setAddBusy(true);
    setAddError(null);

    try {
      const response = await fetch('/12x12/api/teacher/students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId
        },
        body: JSON.stringify({
          displayName: addForm.displayName.trim(),
          username: addForm.username.trim(),
          picturePassword: addForm.picturePassword
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add student');
      }

      const newStudent: Student = await response.json();
      setShowAddForm(false);
      setAddForm({ displayName: '', username: '', picturePassword: '1' });
      setAddError(null);
      await loadStudents();
      setSelectedStudent(newStudent);
      setStudentStats({
        total_reviews: 0,
        correct_reviews: 0,
        cards_completed: 0
      });
      setReviewData([]);
    } catch (err: any) {
      setAddError(err.message || 'Failed to add student');
    } finally {
      setAddBusy(false);
    }
  };

  const deleteStudent = async (student: Student) => {
    const confirmed = window.confirm(`Remove ${student.display_name}? This will delete their progress.`);
    if (!confirmed) return;

    setDeleteBusyId(student.id);
    try {
      const response = await fetch(`/12x12/api/teacher/students/${student.id}`, {
        method: 'DELETE',
        headers: { 'X-User-Id': userId }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        const errMsg = data?.error || `Failed to delete student (${response.status})`;
        throw new Error(errMsg);
      }
      if (data?.message) {
        alert(data.message);
      }
      await loadStudents();
      if (selectedStudent?.id === student.id) {
        setSelectedStudent(null);
        setStudentStats(null);
        setReviewData([]);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete student');
    } finally {
      setDeleteBusyId(null);
    }
  };

  const chartData = {
    labels: reviewData.map(d => new Date(d.date).toLocaleDateString()),
    datasets: [
      {
        label: 'Cards Reviewed',
        data: reviewData.map(d => d.reviews_count),
        borderColor: '#007bff',
        backgroundColor: '#007bff20',
        tension: 0.1
      },
      {
        label: 'Correct Answers',
        data: reviewData.map(d => d.correct_count),
        borderColor: '#28a745',
        backgroundColor: '#28a74520',
        tension: 0.1
      }
    ]
  };

  const deckChartData = (stats: DeckReviewStats) => {
    return {
      labels: stats.recentReviews.map(d => new Date(d.date).toLocaleDateString()),
      datasets: [
        {
          label: 'Cards Reviewed',
          data: stats.recentReviews.map(d => d.reviews_count),
          borderColor: '#6f42c1',
          backgroundColor: '#6f42c120',
          tension: 0.1
        },
        {
          label: 'Correct Answers',
          data: stats.recentReviews.map(d => d.correct_count),
          borderColor: '#20c997',
          backgroundColor: '#20c99720',
          tension: 0.1
        }
      ]
    };
  };

  return (
    <div style={{ backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        padding: '16px 24px',
        borderBottom: '1px solid #ddd',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h1 style={{ margin: 0, color: '#333' }}>Teacher Dashboard</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => {
              setShowDeckForm(prev => !prev);
              setDeckFormError(null);
              if (!showDeckForm) {
                setDeckError(null);
                resetDeckForm();
              }
              setShowAddForm(false);
              setAddError(null);
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: showDeckForm ? '#6c757d' : '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {showDeckForm ? 'Close Deck Form' : 'New Deck'}
          </button>
          <button
            onClick={() => {
              setShowAddForm(prev => !prev);
              setAddError(null);
              if (!showAddForm) {
                setShowDeckForm(false);
                setDeckFormError(null);
              }
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: showAddForm ? '#6c757d' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {showAddForm ? 'Close' : 'Add Student'}
          </button>
          <button
            onClick={onLogout}
            style={{
              padding: '8px 16px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 73px)' }}>
        {/* Student List */}
        <div style={{
          width: '350px',
          backgroundColor: 'white',
          borderRight: '1px solid #ddd',
          overflowY: 'auto'
        }}>
          <h2 style={{ padding: '16px', margin: 0, borderBottom: '1px solid #eee' }}>
            Students ({students.length})
          </h2>
          {students.map(student => (
            <div
              key={student.id}
              onClick={() => loadStudentStats(student)}
              style={{
                padding: '16px',
                borderBottom: '1px solid #eee',
                cursor: 'pointer',
                backgroundColor: selectedStudent?.id === student.id ? '#f8f9fa' : 'white',
                transition: 'background-color 0.2s ease'
              }}
              onMouseOver={(e) => {
                if (selectedStudent?.id !== student.id) {
                  e.currentTarget.style.backgroundColor = '#f8f9fa';
                }
              }}
              onMouseOut={(e) => {
                if (selectedStudent?.id !== student.id) {
                  e.currentTarget.style.backgroundColor = 'white';
                }
              }}
            >
              <div style={{ fontWeight: 'bold', color: '#333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{student.display_name} (@{student.username})</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteStudent(student);
                  }}
                  disabled={deleteBusyId === student.id}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: deleteBusyId === student.id ? 'not-allowed' : 'pointer'
                  }}
                >
                  {deleteBusyId === student.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
              <div style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
                Reviews: {student.total_reviews} | 
                Correct: {student.correct_reviews} | 
                Completed: {student.cards_completed}
              </div>
              <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                Last activity: {student.last_activity ? new Date(student.last_activity).toLocaleDateString() : 'Never'}
              </div>
            </div>
          ))}
        </div>

        {/* Decks & Student Details */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{
            padding: '24px',
            borderBottom: '1px solid #ddd',
            backgroundColor: '#ffffff'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, color: '#333' }}>Deck Management</h2>
              <button
                type="button"
                onClick={() => loadDecks()}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Refresh
              </button>
            </div>

            {deckError && (
              <div style={{
                marginTop: '12px',
                padding: '12px',
                backgroundColor: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: '6px',
                color: '#721c24',
                fontSize: '14px'
              }}>
                {deckError}
              </div>
            )}

            {showDeckForm && (
              <div style={{
                marginTop: '16px',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid #e2e6ea',
                backgroundColor: '#f8f9fa'
              }}>
                <h3 style={{ margin: '0 0 12px 0', color: '#333' }}>Create Deck</h3>
                {deckFormError && (
                  <div style={{
                    marginBottom: '12px',
                    padding: '10px',
                    backgroundColor: '#f8d7da',
                    border: '1px solid #f5c6cb',
                    borderRadius: '6px',
                    color: '#721c24',
                    fontSize: '14px'
                  }}>
                    {deckFormError}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', color: '#555', marginBottom: '4px' }}>Deck Name</label>
                    <input
                      value={deckForm.name}
                      onChange={e => setDeckForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Vocabulary – Unit 1"
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '6px',
                        border: '1px solid #ccc'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', color: '#555', marginBottom: '4px' }}>Description</label>
                    <input
                      value={deckForm.description}
                      onChange={e => setDeckForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Optional description"
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '6px',
                        border: '1px solid #ccc'
                      }}
                    />
                  </div>
                </div>
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {deckForm.cards.map((card, index) => (
                    <div
                      key={index}
                      style={{
                        border: '1px solid #dee2e6',
                        borderRadius: '8px',
                        padding: '12px',
                        backgroundColor: 'white'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <strong style={{ color: '#333' }}>Card {index + 1}</strong>
                        {deckForm.cards.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeDeckFormCardRow(index)}
                            style={{
                              padding: '6px 10px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '4px' }}>Front</label>
                          <textarea
                            value={card.front}
                            onChange={e => updateDeckFormCard(index, 'front', e.target.value)}
                            rows={3}
                            style={{
                              width: '100%',
                              padding: '10px',
                              borderRadius: '6px',
                              border: '1px solid #ccc',
                              resize: 'vertical'
                            }}
                            placeholder="Question or prompt"
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '4px' }}>Back</label>
                          <textarea
                            value={card.back}
                            onChange={e => updateDeckFormCard(index, 'back', e.target.value)}
                            rows={3}
                            style={{
                              width: '100%',
                              padding: '10px',
                              borderRadius: '6px',
                              border: '1px solid #ccc',
                              resize: 'vertical'
                            }}
                            placeholder="Answer"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addDeckFormCardRow}
                    style={{
                      alignSelf: 'flex-start',
                      padding: '8px 16px',
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    + Add Another Card
                  </button>
                </div>
                <div style={{ marginTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={createDeck}
                    disabled={deckBusy}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#17a2b8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: deckBusy ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {deckBusy ? 'Creating…' : 'Create Deck'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeckForm(false);
                      resetDeckForm();
                      setDeckFormError(null);
                    }}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div style={{ marginTop: '24px' }}>
              <h3 style={{ margin: '0 0 12px 0', color: '#333' }}>Decks</h3>
              {decks.length === 0 ? (
                <div style={{
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px dashed #ced4da',
                  color: '#555',
                  fontSize: '14px'
                }}>
                  No decks yet. Create one to get started.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  {decks.map(deck => {
                    const isSelected = selectedDeck?.id === deck.id;
                    return (
                      <button
                        key={deck.id}
                        type="button"
                        onClick={() => {
                          setDeckCardError(null);
                          setDeckCardForm({ front: '', back: '' });
                          setShowAddCardForm(false);
                          setDeckCards([]);
                          setSelectedDeck(deck);
                          loadDeckCards(deck);
                        }}
                        style={{
                          padding: '16px',
                          textAlign: 'left',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid #007bff' : '1px solid #ddd',
                          backgroundColor: isSelected ? '#e9f2ff' : '#fafafa',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ fontWeight: 'bold', color: '#333' }}>{deck.name}</div>
                        <div style={{ marginTop: '6px', color: '#555', fontSize: '14px' }}>
                          {deck.card_count} card{deck.card_count === 1 ? '' : 's'}
                        </div>
                        {deck.description && (
                          <div style={{ marginTop: '8px', fontSize: '12px', color: '#777' }}>
                            {deck.description}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedDeck && (
              <div style={{
                marginTop: '24px',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid #e2e6ea',
                backgroundColor: '#f8f9fa'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 8px 0', color: '#333' }}>{selectedDeck.name}</h3>
                    <div style={{ fontSize: '14px', color: '#555' }}>
                      {selectedDeck.description || 'No description yet.'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#777', marginTop: '6px' }}>
                      Cards: {selectedDeck.card_count}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddCardForm(prev => !prev);
                      setDeckCardError(null);
                    }}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: showAddCardForm ? '#6c757d' : '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    {showAddCardForm ? 'Close' : 'Add Card'}
                  </button>
                </div>

                <div style={{
                  marginTop: '16px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #dee2e6',
                  backgroundColor: 'white'
                }}>
                  <div style={{ fontSize: '14px', color: '#333', marginBottom: '8px' }}>
                    Share with students
                  </div>
                  {(() => {
                    const origin = typeof window !== 'undefined' ? window.location.origin : '';
                    const shareLink = origin ? `${origin}?deck=${selectedDeck.id}` : `?deck=${selectedDeck.id}`;
                    return (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div>
                            <div style={{ fontSize: '12px', color: '#555' }}>Share link</div>
                            <div style={{
                              padding: '8px',
                              backgroundColor: '#f8f9fa',
                              borderRadius: '6px',
                              border: '1px solid #e2e6ea',
                              wordBreak: 'break-all',
                              fontSize: '13px',
                              color: '#333'
                            }}>
                              {shareLink}
                            </div>
                            <div style={{ marginTop: '6px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => copyDeckValue(shareLink, 'link', selectedDeck.id)}
                                style={{
                                  padding: '6px 12px',
                                  backgroundColor: '#007bff',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer'
                                }}
                              >
                                Copy Link
                              </button>
                              {deckShareCopy?.deckId === selectedDeck.id && deckShareCopy.kind === 'link' && (
                                <span style={{ fontSize: '12px', color: '#28a745' }}>Copied!</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '12px', color: '#555' }}>Share code</div>
                            <div style={{
                              padding: '8px',
                              backgroundColor: '#f8f9fa',
                              borderRadius: '6px',
                              border: '1px solid #e2e6ea',
                              fontFamily: 'monospace',
                              fontSize: '13px',
                              color: '#333'
                            }}>
                              {selectedDeck.id}
                            </div>
                            <div style={{ marginTop: '6px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => copyDeckValue(selectedDeck.id, 'code', selectedDeck.id)}
                                style={{
                                  padding: '6px 12px',
                                  backgroundColor: '#17a2b8',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer'
                                }}
                              >
                                Copy Code
                              </button>
                              {deckShareCopy?.deckId === selectedDeck.id && deckShareCopy.kind === 'code' && (
                                <span style={{ fontSize: '12px', color: '#28a745' }}>Copied!</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: '12px', color: '#777', marginTop: '8px' }}>
                          Students can paste the link or code on their practice setup screen to load this deck.
                        </div>
                      </>
                    );
                  })()}
                </div>

                {showAddCardForm && (
                  <div style={{ marginTop: '16px' }}>
                    {deckCardError && (
                      <div style={{
                        marginBottom: '12px',
                        padding: '10px',
                        backgroundColor: '#f8d7da',
                        border: '1px solid #f5c6cb',
                        borderRadius: '6px',
                        color: '#721c24',
                        fontSize: '14px'
                      }}>
                        {deckCardError}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', color: '#555', marginBottom: '4px' }}>Front</label>
                        <textarea
                          value={deckCardForm.front}
                          onChange={e => setDeckCardForm(prev => ({ ...prev, front: e.target.value }))}
                          rows={3}
                          style={{
                            width: '100%',
                            padding: '10px',
                            borderRadius: '6px',
                            border: '1px solid #ccc',
                            resize: 'vertical'
                          }}
                          placeholder="Question or prompt"
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '14px', color: '#555', marginBottom: '4px' }}>Back</label>
                        <textarea
                          value={deckCardForm.back}
                          onChange={e => setDeckCardForm(prev => ({ ...prev, back: e.target.value }))}
                          rows={3}
                          style={{
                            width: '100%',
                            padding: '10px',
                            borderRadius: '6px',
                            border: '1px solid #ccc',
                            resize: 'vertical'
                          }}
                          placeholder="Answer"
                        />
                      </div>
                    </div>
                    <div style={{ marginTop: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={addCardToDeck}
                        disabled={deckCardBusy}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: '#007bff',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: deckCardBusy ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {deckCardBusy ? 'Adding…' : 'Add Card'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddCardForm(false);
                          setDeckCardForm({ front: '', back: '' });
                          setDeckCardError(null);
                        }}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: '#6c757d',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {!showAddCardForm && deckCardError && (
                  <div style={{
                    marginTop: '12px',
                    padding: '10px',
                    backgroundColor: '#f8d7da',
                    border: '1px solid #f5c6cb',
                    borderRadius: '6px',
                    color: '#721c24',
                    fontSize: '14px'
                  }}>
                    {deckCardError}
                  </div>
                )}

                <div style={{ marginTop: '16px' }}>
                  {deckCardsLoading ? (
                    <div>Loading cards…</div>
                  ) : deckCards.length === 0 ? (
                    <div style={{ color: '#777', fontSize: '14px' }}>No cards in this deck yet.</div>
                  ) : (
                    <div style={{
                      maxHeight: '260px',
                      overflowY: 'auto',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      backgroundColor: 'white'
                    }}>
                      {deckCards.map(card => (
                        <div key={card.id} style={{ padding: '12px 16px', borderBottom: '1px solid #eee' }}>
                          <div style={{ fontWeight: 'bold', color: '#333' }}>{card.front}</div>
                          <div style={{ marginTop: '6px', color: '#555' }}>{card.back}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {showAddForm && (
            <div style={{
              padding: '24px',
              borderBottom: '1px solid #ddd',
              backgroundColor: '#ffffff'
            }}>
              <h2 style={{ margin: '0 0 16px 0', color: '#333' }}>Add Student</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
                <div style={{ flex: '1 1 240px' }}>
                  <label style={{ display: 'block', fontSize: '14px', color: '#555', marginBottom: '4px' }}>Display Name</label>
                  <input
                    value={addForm.displayName}
                    onChange={e => setAddForm(prev => ({ ...prev, displayName: e.target.value }))}
                    placeholder="Student Name"
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid #ccc'
                    }}
                  />
                </div>
                <div style={{ flex: '1 1 200px' }}>
                  <label style={{ display: 'block', fontSize: '14px', color: '#555', marginBottom: '4px' }}>Username</label>
                  <input
                    value={addForm.username}
                    onChange={e => setAddForm(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="username"
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid #ccc'
                    }}
                  />
                </div>
                <div style={{ flex: '1 1 200px' }}>
                  <label style={{ display: 'block', fontSize: '14px', color: '#555', marginBottom: '4px' }}>Picture Password</label>
                  <select
                    value={addForm.picturePassword}
                    onChange={e => setAddForm(prev => ({ ...prev, picturePassword: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid #ccc'
                    }}
                  >
                    {PICTURE_OPTIONS.map(option => (
                      <option value={option.id} key={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {addError && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px',
                  backgroundColor: '#f8d7da',
                  border: '1px solid #f5c6cb',
                  borderRadius: '6px',
                  color: '#721c24',
                  fontSize: '14px'
                }}>
                  {addError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={createStudent}
                  disabled={addBusy}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: addBusy ? 'not-allowed' : 'pointer'
                  }}
                >
                  {addBusy ? 'Adding…' : 'Add Student'}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setAddForm({ displayName: '', username: '', picturePassword: '1' });
                    setAddError(null);
                  }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {selectedStudent ? (
            <div style={{ padding: '24px' }}>
              <h2 style={{ margin: '0 0 24px 0', color: '#333' }}>
                {selectedStudent.display_name}'s Progress
              </h2>

              {/* Stats Summary */}
              {studentStats && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '16px',
                  marginBottom: '32px'
                }}>
                  <div style={{
                    backgroundColor: 'white',
                    padding: '20px',
                    borderRadius: '8px',
                    border: '1px solid #ddd'
                  }}>
                    <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
                      Total Reviews
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>
                      {studentStats.total_reviews}
                    </div>
                  </div>
                  <div style={{
                    backgroundColor: 'white',
                    padding: '20px',
                    borderRadius: '8px',
                    border: '1px solid #ddd'
                  }}>
                    <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
                      Correct Answers
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
                      {studentStats.correct_reviews}
                    </div>
                  </div>
                  <div style={{
                    backgroundColor: 'white',
                    padding: '20px',
                    borderRadius: '8px',
                    border: '1px solid #ddd'
                  }}>
                    <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
                      Success Rate
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#17a2b8' }}>
                      {studentStats.total_reviews > 0 
                        ? Math.round((studentStats.correct_reviews / studentStats.total_reviews) * 100)
                        : 0}%
                    </div>
                  </div>
                </div>
              )}

              {/* Progress Chart */}
              {reviewData.length > 0 && (
                <div style={{
                  backgroundColor: 'white',
                  padding: '24px',
                  borderRadius: '8px',
                  border: '1px solid #ddd',
                  marginBottom: '32px'
                }}>
                  <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>
                    Progress Over Last 30 Days
                  </h3>
                  <div style={{ height: '300px' }}>
                    <Line data={chartData} options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        title: {
                          display: true,
                          text: 'Daily Progress'
                        }
                      },
                      scales: {
                        y: {
                          beginAtZero: true
                        }
                      }
                    }} />
                  </div>
                </div>
              )}

              {deckReviewStats.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h3 style={{ margin: '0', color: '#333' }}>Deck-specific progress</h3>
                  {deckReviewStats.map(deckStat => {
                    const total = deckStat.total_reviews;
                    const correct = deckStat.correct_reviews;
                    const successRate = total > 0 ? Math.round((correct / total) * 100) : 0;
                    return (
                      <div
                        key={deckStat.deck_id ?? deckStat.deck_name}
                        style={{
                          backgroundColor: 'white',
                          padding: '16px',
                          borderRadius: '8px',
                          border: '1px solid #ddd'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <div>
                            <div style={{ fontWeight: 'bold', color: '#333' }}>{deckStat.deck_name || 'Unknown deck'}</div>
                            <div style={{ fontSize: '12px', color: '#777', marginTop: '4px' }}>
                              Reviews: {total} • Correct: {correct} • Success: {successRate}%
                            </div>
                          </div>
                        </div>
                        {deckStat.recentReviews.length > 0 ? (
                          <div style={{ height: '240px' }}>
                            <Line
                              data={deckChartData(deckStat)}
                              options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                  legend: { display: true },
                                  title: { display: false }
                                },
                                scales: { y: { beginAtZero: true } }
                              }}
                            />
                          </div>
                        ) : (
                          <div style={{ fontSize: '13px', color: '#777' }}>No recent activity for this deck.</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <button
                  onClick={() => resetStudent(selectedStudent.id, 'reset-srs')}
                  disabled={actionLoading === 'reset-srs'}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#ffc107',
                    color: '#212529',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: actionLoading === 'reset-srs' ? 'not-allowed' : 'pointer',
                    opacity: actionLoading === 'reset-srs' ? 0.6 : 1
                  }}
                >
                  {actionLoading === 'reset-srs' ? 'Resetting...' : 'Reset SRS Only'}
                </button>
                <button
                  onClick={() => resetStudent(selectedStudent.id, 'clear')}
                  disabled={actionLoading === 'clear'}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: actionLoading === 'clear' ? 'not-allowed' : 'pointer',
                    opacity: actionLoading === 'clear' ? 0.6 : 1
                  }}
                >
                  {actionLoading === 'clear' ? 'Clearing...' : 'Clear All Data'}
                </button>
              </div>

              <div style={{ marginTop: '16px', fontSize: '12px', color: '#666' }}>
                <strong>Reset SRS Only:</strong> Keeps cards but resets scheduling and intervals<br />
                <strong>Clear All Data:</strong> Removes all progress and card assignments
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#666'
            }}>
              Select a student to view their progress
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
