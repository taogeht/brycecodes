import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import DailyLog from './pages/DailyLog'
import MealEntry from './pages/MealEntry'
import Workouts from './pages/Workouts'
import Progress from './pages/Progress'
import Settings from './pages/Settings'
import Import from './pages/Import'
import Sleep from './pages/Sleep'
import './index.css'

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename="/fitnessjourney">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="log/:date" element={<DailyLog />} />
            <Route path="meals/add" element={<MealEntry />} />
            <Route path="workouts" element={<Workouts />} />
            <Route path="progress" element={<Progress />} />
            <Route path="settings" element={<Settings />} />
            <Route path="import" element={<Import />} />
            <Route path="sleep" element={<Sleep />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
