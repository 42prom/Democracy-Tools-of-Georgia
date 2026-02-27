import { Outlet, Link, useLocation } from 'react-router-dom';
import { MapPin, Shield, Coins, ShieldCheck, Bell, Globe } from 'lucide-react';
import { clsx } from 'clsx';

const settingsTabs = [
  { path: '/settings/blockchain', label: 'Blockchain', icon: Coins },
  { path: '/settings/regions', label: 'Regions', icon: MapPin },
  { path: '/settings/verification-providers', label: 'Verification Providers', icon: Shield },
  { path: '/settings/security', label: 'Security Policies', icon: ShieldCheck },
  { path: '/settings/geo-blocking', label: 'Geo-Blocking', icon: Globe },
  { path: '/settings/notifications', label: 'Notifications', icon: Bell },
];

export default function SettingsLayout() {
  const location = useLocation();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage system configuration and settings</p>
      </div>

      {/* Settings Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {settingsTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = location.pathname === tab.path;

            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={clsx(
                  'flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                  isActive
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                )}
              >
                <Icon className="w-5 h-5 mr-2" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Settings Content */}
      <Outlet />
    </div>
  );
}
