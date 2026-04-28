import { useState, useEffect } from 'react';

interface User {
  id: string;
  username: string;
  display_name: string;
  user_type: string;
  picture_password: string;
}

interface LoginResponse {
  user?: User;
  success: boolean;
  error?: string;
}

type LoginMode = 'student' | 'teacher';

const PICTURE_OPTIONS = [
  { id: '1', emoji: '🐶', label: 'Dog' },
  { id: '2', emoji: '🐱', label: 'Cat' },
  { id: '3', emoji: '🐰', label: 'Rabbit' },
  { id: '4', emoji: '🦊', label: 'Fox' },
  { id: '5', emoji: '🐻', label: 'Bear' }
];

const filterUsers = (list: User[], teacherOnly: boolean) =>
  list.filter(user =>
    teacherOnly ? user.user_type === 'teacher' : user.user_type !== 'teacher'
  );

export default function LoginPage({
  onLogin,
  mode = 'student'
}: {
  onLogin: (user: User) => void;
  mode?: LoginMode;
}) {
  const isTeacherMode = mode === 'teacher';
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedPicture, setSelectedPicture] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userListError, setUserListError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingUsers(true);
    setUserListError(null);

    (async () => {
      try {
        const response = await fetch('/12x12/api/users');
        const data: User[] = await response.json();
        if (active) {
          setUsers(filterUsers(data, isTeacherMode));
          setUserListError(null);
        }
      } catch (err) {
        console.error('Failed to load users:', err);
        if (active) {
          setUsers([]);
          setUserListError(
            'Unable to load accounts. Please try again or contact your administrator.'
          );
        }
      } finally {
        if (active) setLoadingUsers(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isTeacherMode]);

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
    setSelectedPicture(null);
    setError('');
  };

  const handlePictureSelect = (pictureId: string) => {
    setSelectedPicture(pictureId);
    setError('');
  };

  const handleLogin = async () => {
    if (!selectedUser || !selectedPicture) {
      setError('Please select your username and picture');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/12x12/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: selectedUser.username,
          picturePassword: selectedPicture
        })
      });

      const data: LoginResponse = await response.json();

      if (data.success && data.user) {
        if (isTeacherMode && data.user.user_type !== 'teacher') {
          setError('This portal is for teachers only.');
          return;
        }
        if (!isTeacherMode && data.user.user_type === 'teacher') {
          setError('Teacher accounts must use the teacher portal.');
          return;
        }
        onLogin(data.user);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setSelectedUser(null);
    setSelectedPicture(null);
    setError('');
  };

  if (loadingUsers) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{ fontSize: '18px', color: '#666' }}>Loading users...</div>
      </div>
    );
  }

  if (selectedUser) {
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
          width: '100%',
          maxWidth: '500px'
        }}>
          <h1 style={{ marginBottom: '16px', color: '#333' }}>
            {`Welcome back, ${selectedUser.display_name}!`}
          </h1>
          <p style={{ marginBottom: '32px', color: '#666' }}>
            {isTeacherMode
              ? 'Confirm your teacher picture password to continue'
              : 'Select your picture password to continue'}
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px',
            marginBottom: '32px'
          }}>
            {PICTURE_OPTIONS.map(option => (
              <button
                key={option.id}
                onClick={() => handlePictureSelect(option.id)}
                style={{
                  padding: '24px',
                  border: selectedPicture === option.id
                    ? '3px solid #007bff'
                    : '2px solid #ddd',
                  borderRadius: '12px',
                  backgroundColor: selectedPicture === option.id ? '#e7f3ff' : 'white',
                  cursor: 'pointer',
                  fontSize: '48px',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  minHeight: '120px'
                }}
                onMouseOver={(e) => {
                  if (selectedPicture !== option.id) {
                    e.currentTarget.style.backgroundColor = '#f8f9fa';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }
                }}
                onMouseOut={(e) => {
                  if (selectedPicture !== option.id) {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
              >
                <span>{option.emoji}</span>
                <span style={{ fontSize: '12px', color: '#666' }}>{option.label}</span>
              </button>
            ))}
          </div>

          {error && (
            <div style={{
              marginBottom: '24px',
              padding: '12px',
              backgroundColor: '#f8d7da',
              border: '1px solid #f5c6cb',
              borderRadius: '6px',
              color: '#721c24',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
            <button
              onClick={goBack}
              style={{
                flex: 1,
                padding: '14px',
                fontSize: '16px',
                fontWeight: 'bold',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease'
              }}
            >
              ← Back
            </button>
            <button
              onClick={handleLogin}
              disabled={loading || !selectedPicture}
              style={{
                flex: 2,
                padding: '14px',
                fontSize: '16px',
                fontWeight: 'bold',
                backgroundColor: (loading || !selectedPicture) ? '#6c757d' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: (loading || !selectedPicture) ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s ease'
              }}
            >
              {loading ? 'Logging in...' : 'Login →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

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
        width: '100%',
        maxWidth: '600px'
      }}>
        <h1 style={{ marginBottom: '8px', color: '#333' }}>
          {isTeacherMode ? 'Teacher Portal' : 'Flashcards!'}
        </h1>
        <p style={{ marginBottom: '32px', color: '#666' }}>
          {isTeacherMode
            ? 'Sign in to manage student progress and sessions.'
            : 'Select your username card to continue'}
        </p>

        {users.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '32px'
          }}>
            {users.map(user => (
              <button
                key={user.id}
                onClick={() => handleUserSelect(user)}
                style={{
                  padding: '24px',
                  border: '2px solid #ddd',
                  borderRadius: '12px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  minHeight: '120px'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#f8f9fa';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.1)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  backgroundColor: user.user_type === 'teacher' ? '#28a745' : '#007bff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  marginBottom: '8px'
                }}>
                  {user.user_type === 'teacher' ? '👨‍🏫' : '👨‍🎓'}
                </div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>
                  {user.display_name}
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  @{user.username}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: user.user_type === 'teacher' ? '#28a745' : '#007bff',
                  fontWeight: 'bold'
                }}>
                  {user.user_type === 'teacher' ? 'Teacher' : 'Student'}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div style={{
            marginBottom: '32px'
          }}>
            <div style={{
              padding: '24px',
              backgroundColor: userListError ? '#f8d7da' : '#fff3cd',
              border: `1px solid ${userListError ? '#f5c6cb' : '#ffeeba'}`,
              borderRadius: '8px',
              color: userListError ? '#721c24' : '#856404'
            }}>
              {userListError ??
                `No ${isTeacherMode ? 'teacher' : 'student'} accounts found. Please contact your administrator.`}
            </div>
          </div>
        )}

        {error && (
          <div style={{
            marginBottom: '24px',
            padding: '12px',
            backgroundColor: '#f8d7da',
            border: '1px solid #f5c6cb',
            borderRadius: '6px',
            color: '#721c24',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #eee' }}>
          {isTeacherMode ? (
            <button
              onClick={() => (window.location.href = '/')}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              ← Back to student login
            </button>
          ) : (
            <button
              onClick={() => (window.location.href = '/teacher')}
              style={{
                padding: '8px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Teacher login →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
