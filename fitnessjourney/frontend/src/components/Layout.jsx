import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';

const navItems = [
    { to: '/', label: 'Dashboard', icon: '📊' },
    { to: `/log/${format(new Date(), 'yyyy-MM-dd')}`, label: 'Today\'s Log', icon: '📝' },
    { to: '/meals/add', label: 'Add Meal', icon: '🍽️' },
    { to: '/workouts', label: 'Workouts', icon: '💪' },
    { to: '/records', label: 'Records', icon: '🏆' },
    { to: '/progress', label: 'Progress', icon: '📈' },
    { to: '/sleep', label: 'Sleep', icon: '😴' },
    { to: '/import', label: 'Import', icon: '📥' },
    { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Layout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const closeSidebar = () => setSidebarOpen(false);

    const sidebarContent = (
        <>
            {/* Logo */}
            <div className="p-6 border-b border-surface-800">
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">
                    Fitness Journey
                </h1>
                <p className="text-surface-200 text-sm mt-1">Welcome, {user?.name}</p>
            </div>

            {/* Nav */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {navItems.map(item => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        onClick={closeSidebar}
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
        </>
    );

    return (
        <div className="flex h-screen overflow-hidden">
            {/* Mobile top bar */}
            <div className="fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 py-3 bg-surface-900 border-b border-surface-800 lg:hidden">
                <button
                    onClick={() => setSidebarOpen(true)}
                    className="p-2 rounded-lg text-surface-200 hover:bg-surface-800 hover:text-white transition-colors"
                    aria-label="Open menu"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
                <h1 className="text-lg font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">
                    Fitness Journey
                </h1>
            </div>

            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
                    onClick={closeSidebar}
                />
            )}

            {/* Sidebar — desktop: always visible, mobile: slide-in */}
            <aside
                className={`
                    fixed inset-y-0 left-0 z-50 w-64 bg-surface-900 border-r border-surface-800 flex flex-col shrink-0
                    transform transition-transform duration-300 ease-in-out
                    lg:relative lg:translate-x-0
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                `}
            >
                {/* Mobile close button */}
                <button
                    onClick={closeSidebar}
                    className="absolute top-4 right-4 p-1 rounded-lg text-surface-400 hover:text-white hover:bg-surface-800 transition-colors lg:hidden"
                    aria-label="Close menu"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {sidebarContent}
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-y-auto bg-surface-950 pt-14 lg:pt-0">
                <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
