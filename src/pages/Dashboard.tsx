import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Lock,
  ArrowRight,
  Activity,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { getFlagshipMaterial, formatNaira, MaterialWithStatus } from '../lib/materialService';
import {
  FALLBACK_MATERIAL_DESCRIPTION,
  FALLBACK_MATERIAL_TITLE,
} from '../lib/materialDefaults';

export interface DashboardProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ currentPath, onNavigate }) => {
  const { user } = useAuth();
  const { profile, loading: profileLoading, error: profileError } = useProfile();

  const [material, setMaterial] = useState<MaterialWithStatus | null>(null);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  // Reading progress is written while the student reads in another tab/view;
  // refresh the card as soon as a row changes so the percentage is live.
  useRealtimeRefresh(['reading_progress', 'user_material_progress'], () =>
    setRefreshTick((tick) => tick + 1),
  );

  useEffect(() => {
    async function fetchMaterialData() {
      if (!user) {
        setLoadingMaterials(false);
        return;
      }
      setLoadingMaterials(true);
      const { material: fetchedMaterial } = await getFlagshipMaterial(user.id);

      if (fetchedMaterial) {
        setMaterial(fetchedMaterial);
        setLoadingMaterials(false);
        return;
      }

      // An entitled student must NEVER see "The material is not available at
      // the moment." If the catalogue read failed (permissions, schema lag,
      // network), resolve the book they actually own directly from
      // `entitlements` and open it.
      const { data: ent } = await supabase
        .from('entitlements')
        .select('material_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('granted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ent?.material_id) {
        const { data: row } = await supabase
          .from('materials_public')
          .select('id, title, description, subject, category, price')
          .eq('id', ent.material_id)
          .maybeSingle();

        setMaterial({
          id: ent.material_id,
          title: row?.title || FALLBACK_MATERIAL_TITLE,
          description: row?.description || FALLBACK_MATERIAL_DESCRIPTION,
          subject: row?.subject ?? null,
          category: row?.category ?? null,
          estimated_reading_minutes: null,
          is_published: true,
          price: row?.price ?? 1500,
          preview_images: [],
          isLocked: false,
          progress: 0,
        });
      } else {
        setMaterial(null);
      }

      setLoadingMaterials(false);
    }
    fetchMaterialData();
  }, [user, refreshTick]);

  const materialsAvailable = material ? 1 : 0;
  const materialsCompleted = material?.progress === 100 ? 1 : 0;
  const averageProgress = material?.progress || 0;

  const displayName =
    profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Student';
  const displayEmail = profile?.email || user?.email || 'student@eduvault.app';
  const price = formatNaira(material?.price);

  const stats = [
    { label: 'Material available', value: materialsAvailable, icon: BookOpen },
    { label: 'Chapters completed', value: materialsCompleted, icon: CheckCircle2 },
    { label: 'Reading progress', value: `${averageProgress}%`, icon: Clock },
  ];

  return (
    <DashboardLayout currentPath={currentPath} onNavigate={onNavigate}>
      <div className="space-y-8">

        {/* Page header */}
        <div className="flex flex-col justify-between gap-4 border-b border-line-strong pb-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold text-ink">
                {profileLoading ? 'Loading…' : `Welcome back, ${displayName}`}
              </h1>
              <Badge variant="green" size="sm">Active</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              Signed in as <span className="font-medium text-ink-soft">{displayEmail}</span>
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => onNavigate('/material')}
            rightIcon={<ArrowRight className="w-4 h-4" />}
            className="shrink-0"
          >
            Open reader
          </Button>
        </div>

        {profileError && (
          <div className="flex items-center gap-2.5 rounded-md border border-danger/30 bg-danger/10 p-4">
            <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
            <span className="text-sm text-danger">{profileError}</span>
          </div>
        )}

        {/* Stat tiles */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} padding="sm" className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line-strong bg-canvas">
                  <Icon className="h-5 w-5 text-gold" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-ink-muted">{stat.label}</div>
                  <div className="mt-0.5 text-2xl font-semibold tabular-nums text-ink">
                    {stat.value}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Account security */}
        <div className="flex flex-col justify-between gap-4 rounded-lg border border-line-strong bg-surface p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gold/10">
              <ShieldCheck className="h-5 w-5 text-gold" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-ink">Your account is protected</h4>
              <p className="mt-0.5 text-sm text-ink-muted">
                Encrypted sessions with single-device authorization.
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => onNavigate('/settings')} className="shrink-0">
            Account settings
          </Button>
        </div>

        {/* Material */}
        <div className="space-y-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-base font-semibold text-ink">Your material</h2>
              <p className="text-sm text-ink-muted">
                The complete flagship guide, delivered through the secure reader.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => onNavigate('/material')}>
              View material
            </Button>
          </div>

          {loadingMaterials ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="h-5 w-5 animate-spin text-gold" />
              <p className="text-sm text-ink-muted">Loading your material...</p>
            </div>
          ) : !material ? (
            <div className="rounded-lg border border-line-strong bg-surface py-16 text-center">
              <p className="text-sm text-ink-muted">The material is not available at the moment.</p>
            </div>
          ) : (
            <Card className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={material.isLocked ? 'red' : 'green'} size="sm">
                  {material.isLocked ? <Lock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                  {material.isLocked ? 'Locked' : 'Unlocked'}
                </Badge>
                <Badge variant="neutral" size="sm">
                  {material.category || material.subject || 'General'}
                </Badge>
                {material.estimated_reading_minutes ? (
                  <span className="text-xs text-ink-muted">
                    Est. {material.estimated_reading_minutes} min read
                  </span>
                ) : null}
              </div>

              <div>
                <h3 className="text-base font-semibold text-ink">
                  {material.title || FALLBACK_MATERIAL_TITLE}
                </h3>
                <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
                  {material.description || FALLBACK_MATERIAL_DESCRIPTION}
                </p>
              </div>

              {!material.isLocked && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-ink-muted">
                    <span>
                      {material.progress}% Completed
                      {material.currentPage && material.totalPages
                        ? ` (Page ${material.currentPage} of ${material.totalPages})`
                        : ''}
                    </span>
                    <span className="font-medium tabular-nums text-ink">{material.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-overlay-strong">
                    <div
                      className="h-full rounded-full bg-gold"
                      style={{ width: `${material.progress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-strong pt-4">
                {material.isLocked ? (
                  <>
                    <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                      Purchase required to unlock full access
                    </p>
                    <Button variant="primary" size="sm" onClick={() => onNavigate('/material')}>
                      Unlock for {price}
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-ink-muted">{material.subject || 'EduVault'}</span>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onNavigate(`/material/${material.id}/read`)}
                    >
                      {material.progress > 0 && material.progress < 100 ? 'Continue reading' : 'Read material'}
                    </Button>
                  </>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Recent activity */}
        <div className="rounded-lg border border-line-strong bg-surface p-6">
          <div className="flex items-center gap-2.5">
            <Activity className="h-4 w-4 text-gold" />
            <h3 className="text-base font-semibold text-ink">Recent activity</h3>
          </div>
          <p className="py-6 text-center text-sm text-ink-muted">No recent activity.</p>
        </div>

      </div>
    </DashboardLayout>
  );
};
