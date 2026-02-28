import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';

const navItems = [
    { to: '/', label: 'Dashboard', icon: '📊' },
    { to: `/log/${format(new Date(), 'yyyy-MM-dd')}`, label: 'Today\'s Log', icon: '📝' },
    { to: '/meals/add', label: 'Add Meal', icon: '🍽️' },
    { to: '/workouts', label: 'Workouts', icon: '💪' },
    { to: '/progress', label: 'Progress', icon: '📈' },
    { to: '/sleep', label: 'Sleep', icon: '😴' },
    { to: '/import', label: 'Import', icon: '📥' },
    { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Layout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="flex h-screen overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 bg-surface-900 border-r border-surface-800 flex flex-col shrink-0">
                {/* Logo */}
                <div className="p-6 border-b border-surface-800">
                    <h1 className="text-xl font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">
                        Fitness Journey
                    </h1>
                    <p className="text-surface-200 text-sm mt-1">Welcome, {user?.name}</p>
                </div>

                {/* Nav */}
                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map(item => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === '/'}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${isActive
                                    ? 'bg-primary-600/20 text-primary-300 shadow-lg shadow-primary-600/10'
                                    : 'text-surface-200 hover:bg-surface-800 hover:text-white'
                                }`
                            }
                        >
                            <span className="text-lg">{item.icon}</span>
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                {/* Bottom */}
                <div className="p-4 border-t border-surface-800">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-surface-200 hover:bg-red-900/20 hover:text-red-400 transition-all duration-200"
                    >
                        <span className="text-lg">🚪</span>
                        Logout
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-y-auto bg-surface-950">
                <div className="max-w-6xl mx-auto p-8">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
