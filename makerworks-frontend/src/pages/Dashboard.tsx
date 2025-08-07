// src/pages/Dashboard.tsx
import { useEffect } from 'react';
import PageLayout from '@/components/layout/PageLayout';
import DashboardCard from '@/components/ui/DashboardCard';
import UserDashboardCard from '@/components/ui/UserDashboardCard';
import PageHeader from '@/components/ui/PageHeader';
import { useUser } from '@/hooks/useUser';
import { Star, Upload, Shield, LayoutDashboard } from 'lucide-react';

const Dashboard: React.FC = () => {
  const { user, isAdmin, loading, resolved, refresh, getRecentUploads } = useUser();

  useEffect(() => {
    console.debug('[Dashboard] user state before refresh:', {
      user,
      isAdmin,
      loading,
      resolved,
    });

    // 🔷 Always refresh user on mount to get latest avatar & state
    refresh?.().then((u) => {
      console.debug('[Dashboard] user state after refresh:', u);
    });
  }, []);

  if (loading || !resolved) {
    return (
      <PageLayout>
        <div className="text-center text-zinc-500 dark:text-zinc-400 py-8">
          Loading your dashboard…
        </div>
      </PageLayout>
    );
  }

  if (!user) {
    return (
      <PageLayout>
        <div className="text-center text-red-600 dark:text-red-400 py-8">
          🚫 Please sign in to access your dashboard.
        </div>
      </PageLayout>
    );
  }

  const uploads = getRecentUploads();

  return (
    <PageLayout>
      <div className="space-y-6">
        <PageHeader icon={<LayoutDashboard className="w-8 h-8 text-zinc-400" />} title="Dashboard" />

        <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <UserDashboardCard />

          <div className="p-4 rounded-xl glass-card shadow backdrop-blur">
            <div className="flex items-center gap-2 mb-2">
              <Upload />
              <h2 className="text-lg font-semibold">Your Recent Uploads</h2>
            </div>
            {uploads.length > 0 ? (
              <ul className="text-sm text-zinc-700 dark:text-zinc-300 space-y-1">
                {uploads.map((model) => (
                  <li key={model.id} className="truncate">
                    <a
                      href={`/models/${model.id}`}
                      className="hover:underline text-brand-highlight"
                    >
                      📄 {model.name}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-zinc-500">
                You haven’t uploaded any models yet.
              </div>
            )}
          </div>

          <DashboardCard
            title="Favorites"
            description="See models you&apos;ve bookmarked."
            icon={<Star />}
            to="/favorites"
          />

          {isAdmin && (
            <DashboardCard
              title="Admin Panel"
              description="Manage users, models, and pricing."
              icon={<Shield />}
              to="/admin"
              className="text-red-500"
            />
          )}
        </div>
      </div>
    </PageLayout>
  );
};

export default Dashboard;
