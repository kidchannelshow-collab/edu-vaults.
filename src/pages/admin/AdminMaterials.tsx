import React, { useState, useEffect } from 'react';
import { AdminLayout } from './AdminLayout';
import {
  BookOpen,
  Search,
  Globe,
  EyeOff,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Plus,
  Edit2,
  Eye,
  CheckCircle2,
  FileText,
  RefreshCcw,
  Trash2,
  Image as ImageIcon
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { supabase } from '../../lib/supabase';
import { DbMaterial, resolvePreviewUrl } from '../../lib/materialService';
import { updateMaterialPublishStatus, createMaterial, updateMaterial, deleteMaterial, setPreviewSlot, uploadMaterialPdf } from '../../lib/adminService';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { LiveIndicator } from '../../components/ui/LiveIndicator';

interface AdminPageProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

/**
 * One explicit picker per preview page.
 *
 * Deliberately not a multi-select: the two slots are independent, so replacing
 * page 2 must not disturb page 1. A local object URL previews the pending file
 * before it is uploaded.
 */
const PreviewSlotPicker: React.FC<{
  slot: 1 | 2;
  file: File | null;
  existingUrl?: string | null;
  disabled?: boolean;
  onPick: (file: File | null) => void;
}> = ({ slot, file, existingUrl, disabled = false, onPick }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  // Source resolution is the only thing that actually decides preview sharpness.
  // No CSS property restores detail a file never had, so warn at upload time
  // rather than shipping a soft sample page and wondering why it looks blurred.
  const [resolutionWarning, setResolutionWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setObjectUrl(null);
      setResolutionWarning(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);

    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (cancelled) return;
      // The storefront and the pre-purchase landing render previews at up to
      // roughly 900px wide, so anything narrower is upscaled and reads as soft.
      const MIN_WIDTH = 900;
      setResolutionWarning(
        probe.naturalWidth < MIN_WIDTH
          ? `Only ${probe.naturalWidth}px wide — it renders at up to ~900px, so it will look soft. Re-export the page at 2x for a crisp result.`
          : null,
      );
    };
    probe.onerror = () => {
      if (!cancelled) setResolutionWarning(null);
    };
    probe.src = url;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const preview = objectUrl || existingUrl || null;
  const inputId = `preview-slot-${slot}`;

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-xs font-semibold text-ink">
        Preview Photo {slot}
        <span className="ml-1.5 font-normal text-ink-faint">page {slot} · free sample</span>
      </label>

      <div className="flex items-start gap-3">
        <div className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line-strong bg-surface-deep">
          {/* object-contain, not cover: the 20x24 thumbnail box is a different
              aspect ratio from a letter-size page, so `cover` crops away the
              edges you are checking when verifying an upload. */}
          {preview ? (
            <img src={preview} alt={`Preview page ${slot}`} className="h-full w-full object-contain" />
          ) : (
            <ImageIcon className="h-5 w-5 text-ink-faint" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <input
            id={inputId}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={disabled}
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) onPick(picked);
              e.target.value = '';
            }}
            className="w-full cursor-pointer rounded-md border border-line-strong bg-surface-deep p-2 text-sm text-ink-soft file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:bg-overlay file:text-ink hover:file:bg-overlay-strong disabled:opacity-50"
          />
          <div className="flex items-center gap-3">
            <span className="truncate text-xs text-ink-muted">
              {file ? file.name : existingUrl ? 'Published' : 'No photo yet'}
            </span>
            {(file || existingUrl) && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(null)}
                className="shrink-0 text-xs font-medium text-danger hover:underline disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline"
              >
                {file ? 'Discard' : 'Remove'}
              </button>
            )}
          </div>
          {resolutionWarning && (
            <p className="text-xs leading-relaxed text-info">{resolutionWarning}</p>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Supabase puts the actionable half of a rejected write in `details`/`hint`, not
 * `message`. A bare "new row violates row-level security policy" tells you nothing;
 * the details name the table and the policy that refused it. Compose all three so
 * the modal banner is genuinely diagnosable rather than a riddle.
 */
function describeWriteError(err: any, fallback: string): string {
  if (!err) return fallback;
  const parts = [err.message, err.details, err.hint].filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0
  );
  return parts.length > 0 ? parts.join(' — ') : fallback;
}

export const AdminMaterials: React.FC<AdminPageProps> = ({ currentPath, onNavigate }) => {
  const [materials, setMaterials] = useState<DbMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [publishFilter, setPublishFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [totalCount, setTotalCount] = useState(0);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editMaterial, setEditMaterial] = useState<DbMaterial | null>(null);
  const [viewMaterial, setViewMaterial] = useState<DbMaterial | null>(null);
  const [confirmPublishMaterial, setConfirmPublishMaterial] = useState<DbMaterial | null>(null);
  const [confirmDeleteMaterial, setConfirmDeleteMaterial] = useState<DbMaterial | null>(null);

  // Standalone preview-image uploader, opened from the header so an admin can
  // attach the two free-sample pages without going through the edit form.
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [uploaderMaterialId, setUploaderMaterialId] = useState<string | null>(null);
  const [uploaderSaving, setUploaderSaving] = useState(false);

  // Form states
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formReadingTime, setFormReadingTime] = useState('');
  const [formPrice, setFormPrice] = useState('1500');
  const [formCreateFile, setFormCreateFile] = useState<File | null>(null);
  const [formPreviewSlots, setFormPreviewSlots] = useState<[File | null, File | null]>([null, null]);
  const [editPdfUploading, setEditPdfUploading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadMaterials = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('materials')
        .select('*', { count: 'exact' });

      if (searchQuery.trim()) {
        query = query.or(`title.ilike.%${searchQuery}%,subject.ilike.%${searchQuery}%,category.ilike.%${searchQuery}%`);
      }
      if (categoryFilter !== 'all') {
        query = query.or(`category.eq.${categoryFilter},subject.eq.${categoryFilter}`);
      }
      if (publishFilter === 'published') {
        query = query.eq('is_published', true);
      } else if (publishFilter === 'unpublished') {
        query = query.eq('is_published', false);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, count, error: fetchErr } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (fetchErr) {
        setError(fetchErr.message);
      } else {
        setMaterials(data || []);
        setTotalCount(count || 0);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load materials');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMaterials();
  }, [page, categoryFilter, publishFilter, searchQuery]);

  // Live materials list. The previous subscription closed over the first
  // render's `loadMaterials`, so an incoming change would reload with stale
  // filters; the hook keeps the callback fresh and coalesces bursts.
  const realtimeStatus = useRealtimeRefresh(['materials'], () => loadMaterials(false));

  // Attach or replace the protected PDF on an EXISTING material.
  //
  // uploadMaterialPdf() was exported but never called from anywhere, so a
  // material created without a PDF could never acquire one — it stayed
  // "PDF: Not uploaded" forever and was permanently unpublishable.
  const handleEditPdfUpload = async (file: File) => {
    if (!editMaterial) return;

    setEditPdfUploading(true);
    setFormError(null);

    const isReplacement = Boolean(editMaterial.file_path);
    const { success, filePath, error: pdfErr } = await uploadMaterialPdf(
      editMaterial.id,
      file,
      isReplacement
    );

    setEditPdfUploading(false);

    if (!success) {
      setFormError(pdfErr?.message || 'Failed to upload the PDF.');
      return;
    }

    // Reflect the new path locally so the badge flips without a full reload.
    setEditMaterial({ ...editMaterial, file_path: filePath || editMaterial.file_path });
    setSuccessMessage(isReplacement ? 'PDF replaced.' : 'PDF uploaded.');
    setTimeout(() => setSuccessMessage(null), 4000);
    loadMaterials(false);
  };

  const handleOpenUploader = () => {
    setFormError(null);
    setUploaderMaterialId(null);
    setUploaderOpen(true);
  };

  // Same uploader, but focused on one row — so previews are reachable from the
  // material itself instead of only via the toolbar button.
  const handleOpenUploaderFor = (materialId: string) => {
    setFormError(null);
    setUploaderMaterialId(materialId);
    setUploaderOpen(true);
  };

  // Uploads one slot for the material chosen in the uploader, then refreshes
  // the paginated list in place so the table's thumbnails stay in step.
  const handleUploaderPick = async (slot: 1 | 2, file: File | null) => {
    if (!uploaderMaterialId) return;
    setUploaderSaving(true);
    setFormError(null);

    const { success, error: slotErr } = await setPreviewSlot(uploaderMaterialId, slot, file);

    setUploaderSaving(false);

    if (!success) {
      setFormError(slotErr?.message || 'Failed to update the preview image.');
      return;
    }

    loadMaterials(false);
  };

  // Single source of truth for the create-form blank state — called when the modal
  // opens and again after a confirmed save, so the two can never drift apart.
  const resetCreateForm = () => {
    setFormTitle('');
    setFormDescription('');
    setFormSubject('General');
    setFormCategory('General');
    setFormReadingTime('15');
    setFormPrice('1500');
    setFormCreateFile(null);
    setFormPreviewSlots([null, null]);
    setFormError(null);
  };

  const handleOpenCreate = () => {
    resetCreateForm();
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (m: DbMaterial) => {
    setEditMaterial(m);
    setFormTitle(m.title || '');
    setFormDescription(m.description || '');
    setFormSubject(m.subject || '');
    // Fall back to a real option — the old 'Computer Science' default is no
    // longer in the list, which would leave the select on a value it cannot show.
    setFormCategory(m.category === 'JUPEB' ? 'JUPEB' : 'General');
    setFormReadingTime(m.estimated_reading_minutes ? String(m.estimated_reading_minutes) : '10');
    setFormError(null);
  };



  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formTitle.trim()) {
      setFormError('Title is required.');
      return;
    }
    if (!formSubject.trim()) {
      setFormSubject('General');
    }
    if (!formCategory.trim()) {
      setFormCategory('General');
    }

    const priceNum = Number(formPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      setFormError('Price must be a valid non-negative number (NGN).');
      return;
    }

    let readingMinutes: number | undefined = undefined;
    if (formReadingTime.trim()) {
      const parsed = Number(formReadingTime);
      if (isNaN(parsed) || parsed <= 0) {
        setFormError('Estimated reading time must be a valid positive number.');
        return;
      }
      readingMinutes = parsed;
    }

    if (!formCreateFile) {
      setFormError('Please select a PDF file to upload.');
      return;
    }

    setFormLoading(true);
    try {
      const payload = {
        title: formTitle,
        description: formDescription,
        subject: formSubject,
        category: formCategory,
        estimated_reading_minutes: readingMinutes,
        // Always published on save — the form no longer offers a draft control.
        // A material can still be unpublished from the table afterwards.
        is_published: true,
        price: priceNum,
        file: formCreateFile,
        // Previews are uploaded after creation via the dedicated uploader, so this
        // pair is always empty now. Kept positional: index 0 is Page 1, index 1
        // is Page 2 — filtering empties out here is what used to slide Page 2
        // into the Page 1 slot.
        previewFiles: formPreviewSlots,
      };

      const { data: created, success, error: createErr } = await createMaterial(payload);

      if (createErr) {
        console.error('SUPABASE CREATE ERROR:', {
          message: createErr.message,
          details: createErr.details,
          hint: createErr.hint,
          code: createErr.code,
        });
      }

      // Treat "succeeded but returned no row" as a failure: closing the modal on
      // an unconfirmed write is exactly how a material goes missing from the list.
      if (!success || !created) {
        setFormError(describeWriteError(createErr, 'Failed to create material and upload PDF.'));
        return;
      }

      // Merge the confirmed row in on this tick so it appears immediately, rather
      // than waiting on a refetch that the active filter or page could hide.
      setMaterials((prev) => [created as DbMaterial, ...prev]);
      setTotalCount((c) => c + 1);

      setIsCreateOpen(false);
      // Capture these BEFORE the reset wipes the slots. createMaterial treats a
      // preview upload failure as non-fatal, so without this check the material
      // saves looking healthy while its sample pages silently went missing —
      // which is exactly the "preview being prepared" symptom.
      const previewsRequested = formPreviewSlots.some(Boolean);
      const previewsStored = ((created as DbMaterial).preview_images || []).length;
      // Reset only after the DB confirmed — a failed save leaves every keystroke
      // and the chosen file exactly where the user left them.
      resetCreateForm();
      setSuccessMessage(
        previewsRequested && previewsStored === 0
          ? 'Material saved — but the preview photos did not upload. Re-add them from the row "Previews" button.'
          : 'Material saved successfully!'
      );
      setTimeout(() => setSuccessMessage(null), 6000);
      // Reconcile against server truth in the background — no spinner, no flicker.
      loadMaterials(false);
    } catch (err: any) {
      setFormError(describeWriteError(err, 'Failed to create material and upload PDF.'));
    } finally {
      // Always dismiss the spinner, whichever path we leave by.
      setFormLoading(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMaterial) return;
    setFormError(null);

    if (!formTitle.trim()) {
      setFormError('Title is required.');
      return;
    }

    let readingMinutes: number | undefined = undefined;
    if (formReadingTime.trim()) {
      const parsed = Number(formReadingTime);
      if (isNaN(parsed) || parsed <= 0) {
        setFormError('Estimated reading time must be a valid positive number.');
        return;
      }
      readingMinutes = parsed;
    }

    setFormLoading(true);
    try {
      const { success, error: updateErr } = await updateMaterial(editMaterial.id, {
        title: formTitle,
        description: formDescription,
        subject: formSubject,
        category: formCategory,
        estimated_reading_minutes: readingMinutes,
      });

      if (!success) {
        setFormError(describeWriteError(updateErr, 'Failed to update material.'));
        return;
      }

      // updateMaterial returns only a status, so merge exactly the fields it was
      // handed. The row updates in place without a round-trip.
      setMaterials((prev) =>
        prev.map((m) =>
          m.id === editMaterial.id
            ? {
                ...m,
                title: formTitle,
                description: formDescription,
                subject: formSubject,
                category: formCategory,
                estimated_reading_minutes:
                  readingMinutes ?? m.estimated_reading_minutes,
              }
            : m
        )
      );

      setEditMaterial(null);
      setSuccessMessage('Material updated successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
      // Reconcile against server truth in the background.
      loadMaterials(false);
    } catch (err: any) {
      setFormError(describeWriteError(err, 'Failed to update material.'));
    } finally {
      setFormLoading(false);
    }
  };



  const handleTogglePublish = async () => {
    if (!confirmPublishMaterial) return;
    setFormLoading(true);
    setFormError(null);

    const newStatus = !confirmPublishMaterial.is_published;
    const { success, error: updateErr } = await updateMaterialPublishStatus(confirmPublishMaterial.id, newStatus);

    setFormLoading(false);

    if (!success) {
      setFormError(updateErr?.message || 'Failed to update publication status.');
    } else {
      setConfirmPublishMaterial(null);
      setSuccessMessage(newStatus ? 'Material published successfully.' : 'Material unpublished successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
      loadMaterials();
    }
  };

  const handleDeleteMaterial = async () => {
    if (!confirmDeleteMaterial) return;
    setFormLoading(true);
    setFormError(null);

    const { success, message, error: delErr } = await deleteMaterial(confirmDeleteMaterial.id);

    setFormLoading(false);

    if (!success) {
      setFormError(message || delErr?.message || 'Failed to delete material.');
    } else {
      // Drop the row from local state immediately. Waiting on the refetch is
      // what left a deleted material visible as a phantom until a manual
      // refresh; the refetch below then reconciles with the server.
      const deletedId = confirmDeleteMaterial.id;
      setMaterials((prev) => prev.filter((m) => m.id !== deletedId));
      setTotalCount((prev) => Math.max(0, prev - 1));

      setConfirmDeleteMaterial(null);
      setSuccessMessage(message || 'Material deleted successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
      loadMaterials(false);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const selectedUploaderMaterial = materials.find((m) => m.id === uploaderMaterialId) || null;

  return (
    <AdminLayout currentPath={currentPath} onNavigate={onNavigate}>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line-strong pb-5 mb-6">
          <div>
            <h1 className="text-xl font-semibold text-ink flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-gold" /> Curriculum Materials Management
            </h1>
            <p className="text-sm text-ink-muted mt-1">
              Create, curate, publish, and manage secure private PDF curriculum study notes.
            </p>
          </div>
          {/* flex-wrap: four controls in one row overflow a phone otherwise. */}
          <div className="flex flex-wrap items-center gap-3">
            <LiveIndicator status={realtimeStatus} />
            {/* Secondary, not primary: "Create Material" owns the single primary
                action on this view, and two identical gold buttons side by side
                leaves no visual answer to "what is the main action here?". */}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleOpenUploader}
              leftIcon={<ImageIcon className="h-4 w-4" />}
            >
              Preview Image Uploader
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadMaterials()}
              leftIcon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenCreate}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Create Material
            </Button>
          </div>
        </div>

        {successMessage && (
          <div className="bg-success/10 border border-success/30 rounded-lg p-4 flex items-center gap-3 text-success text-sm">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 flex items-center gap-3 text-danger text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Search & Filters */}
        <div className="rounded-lg border border-line-strong bg-surface p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
            <input
              type="text"
              placeholder="Search by title, subject, or category..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-md border border-line-strong bg-surface-deep pl-10 pr-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25 transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-ink-muted">Category:</span>
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border border-line-strong bg-surface-deep px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
              >
                <option value="all">All Categories</option>
                <option value="General">General</option>
                <option value="JUPEB">JUPEB</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-ink-muted">Status:</span>
              <select
                value={publishFilter}
                onChange={(e) => {
                  setPublishFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border border-line-strong bg-surface-deep px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
              >
                <option value="all">All Statuses</option>
                <option value="published">Published</option>
                <option value="unpublished">Draft / Unpublished</option>
              </select>
            </div>
          </div>
        </div>

        {/* Materials Table */}
        <div className="rounded-lg border border-line-strong bg-surface overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-sm text-ink-muted">Loading materials from Supabase...</div>
          ) : materials.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <BookOpen className="w-10 h-10 text-ink-faint mx-auto" />
              <p className="text-sm text-ink-muted">
                {searchQuery || categoryFilter !== 'all' || publishFilter !== 'all'
                  ? 'No materials found.'
                  : 'No materials have been created yet.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-deep border-b border-line-strong">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Title & Subject</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted">PDF Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-ink-muted">Reading Time</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-ink-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m) => {
                    const isPub = m.is_published;
                    const hasPdf = !!m.file_path && m.file_path.trim() !== '';
                    return (
                      <tr key={m.id} className="border-b border-line last:border-0 hover:bg-overlay transition-colors">
                        <td className="px-4 py-4">
                          <div
                            className="font-medium text-ink hover:text-gold cursor-pointer truncate max-w-xs transition-colors"
                            onClick={() => setViewMaterial(m)}
                          >
                            {m.title}
                          </div>
                          <div className="text-xs text-ink-muted">{m.subject || 'General'}</div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-line-strong bg-overlay text-xs font-medium text-ink-soft">
                            {m.category || 'General'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium ${
                            isPub
                              ? 'bg-success/10 text-success border-success/30'
                              : 'bg-overlay text-ink-muted border-line-strong'
                          }`}>
                            {isPub ? <Globe className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                            {isPub ? 'Published' : 'Draft'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${hasPdf ? 'text-success' : 'text-ink-faint'}`}>
                            <FileText className="w-3 h-3" />
                            {hasPdf ? 'PDF: Uploaded' : 'PDF: Not uploaded'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right text-ink-muted tabular-nums">
                          {m.estimated_reading_minutes ? `${m.estimated_reading_minutes} min` : 'N/A'}
                        </td>
                        <td className="px-4 py-4 text-right space-x-2 whitespace-nowrap">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setViewMaterial(m)}
                            leftIcon={<Eye className="w-3.5 h-3.5" />}
                            title="View Details"
                          >
                            View
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenUploaderFor(m.id)}
                            leftIcon={<ImageIcon className="w-3.5 h-3.5" />}
                            title="Upload Preview Photos"
                          >
                            Previews
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenEdit(m)}
                            leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                            title="Edit Metadata"
                          >
                            Edit
                          </Button>
                          <Button
                            variant={isPub ? 'secondary' : 'primary'}
                            size="sm"
                            onClick={() => setConfirmPublishMaterial(m)}
                          >
                            {isPub ? 'Unpublish' : 'Publish'}
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setConfirmDeleteMaterial(m)}
                            leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                            title="Delete Material"
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="p-4 bg-surface-deep border-t border-line-strong flex items-center justify-between text-sm text-ink-muted">
            <span>Showing page {page} of {totalPages} ({totalCount} total materials)</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
              >
                Next
              </Button>
            </div>
          </div>
        </div>

      </div>

      {/* CREATE MATERIAL MODAL */}
      {isCreateOpen && (
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Create New Curriculum Material"
          footer={
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateSubmit}
                disabled={formLoading}
              >
                {formLoading ? 'Saving...' : 'Save Material'}
              </Button>
            </div>
          }
        >
          <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
            {formError && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Title *</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g., Advanced Distributed Systems Architecture"
                className="w-full rounded-md border border-line-strong bg-surface-deep px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Description</label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Comprehensive overview of topics covered..."
                rows={3}
                className="w-full rounded-md border border-line-strong bg-surface-deep px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Subject *</label>
                <input
                  type="text"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  placeholder="e.g., General"
                  className="w-full rounded-md border border-line-strong bg-surface-deep px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Category *</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full rounded-md border border-line-strong bg-surface-deep px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
                >
                  <option value="General">General</option>
                  <option value="JUPEB">JUPEB</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Estimated Reading Time (minutes)</label>
              <input
                type="number"
                min="1"
                value={formReadingTime}
                onChange={(e) => setFormReadingTime(e.target.value)}
                placeholder="15"
                className="w-full rounded-md border border-line-strong bg-surface-deep px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Price / Amount (NGN)</label>
              <input
                type="number"
                value={formPrice}
                readOnly
                className="w-full rounded-md border border-line-strong bg-canvas px-3 py-2.5 text-sm text-ink-muted placeholder-ink-faint cursor-not-allowed focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25 tabular-nums"
              />
              <p className="text-xs text-ink-muted mt-1">
                Fixed at ₦1,500 — the platform sells a single flagship material. Enforced by a database
                constraint (<span className="font-mono">materials_flagship_price_check</span>).
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-ink">Upload PDF File (*.pdf, max 50 MB) *</label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 50 * 1024 * 1024) {
                      setFormError('PDF is too large. Maximum file size is 50 MB.');
                      setFormCreateFile(null);
                      return;
                    }
                    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                      setFormError('Invalid file type. Only PDF files are allowed.');
                      setFormCreateFile(null);
                      return;
                    }
                    setFormError(null);
                    setFormCreateFile(file);
                  }
                }}
                className="w-full rounded-md border border-line-strong bg-surface-deep p-2 text-sm text-ink-soft file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-gold file:text-on-gold hover:file:bg-gold-strong cursor-pointer"
              />
              {formCreateFile && (
                <p className="text-success text-xs">
                  Selected file: {formCreateFile.name} ({(formCreateFile.size / (1024 * 1024)).toFixed(2)} MB)
                </p>
              )}
            </div>

            {/* The two free sample pages. These upload in the same call as the PDF,
                so a material is never created without its previews. The row
                "Previews" button edits them later, one slot at a time. */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink">
                  Preview Photos — the two free sample pages
                </label>
                <p className="text-xs text-ink-muted">
                  Shown publicly as a free sample. Never upload the protected PDF here.
                </p>
              </div>

              <PreviewSlotPicker
                slot={1}
                file={formPreviewSlots[0]}
                onPick={(f) => setFormPreviewSlots([f, formPreviewSlots[1]])}
              />
              <PreviewSlotPicker
                slot={2}
                file={formPreviewSlots[1]}
                onPick={(f) => setFormPreviewSlots([formPreviewSlots[0], f])}
              />
            </div>

            <p className="pt-2 text-xs text-ink-muted">
              Saved as published — this material appears in the public library immediately.
            </p>
          </form>
        </Modal>
      )}

      {/* EDIT MATERIAL MODAL */}
      {editMaterial && (
        <Modal
          isOpen={!!editMaterial}
          onClose={() => setEditMaterial(null)}
          title={`Edit Material: ${editMaterial.title}`}
          footer={
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditMaterial(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleEditSubmit}
                disabled={formLoading}
              >
                {formLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          }
        >
          <form onSubmit={handleEditSubmit} className="space-y-4 py-2">
            {formError && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Title *</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full rounded-md border border-line-strong bg-surface-deep px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Description</label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-line-strong bg-surface-deep px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Subject</label>
                <input
                  type="text"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  className="w-full rounded-md border border-line-strong bg-surface-deep px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full rounded-md border border-line-strong bg-surface-deep px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
                >
                  <option value="General">General</option>
                  <option value="JUPEB">JUPEB</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Estimated Reading Time (minutes)</label>
              <input
                type="number"
                min="1"
                value={formReadingTime}
                onChange={(e) => setFormReadingTime(e.target.value)}
                className="w-full rounded-md border border-line-strong bg-surface-deep px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/25"
              />
            </div>

            <div className="space-y-3 pt-2 border-t border-line-strong">
              <div>
                <label className="block text-sm font-medium text-ink">
                  Protected PDF — the paid document
                </label>
                <p className="text-xs text-ink-muted">
                  Stored privately and served only through a short-lived signed link. Never public.
                </p>
              </div>

              <div className="flex items-center gap-3 rounded-md border border-line-strong bg-surface-deep p-3">
                {editMaterial.file_path ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
                )}
                <span
                  className={`text-xs font-medium ${editMaterial.file_path ? 'text-success' : 'text-danger'}`}
                >
                  {editMaterial.file_path
                    ? 'PDF uploaded'
                    : 'No PDF uploaded — this material cannot be published'}
                </span>
              </div>

              <input
                type="file"
                accept="application/pdf"
                disabled={editPdfUploading}
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) handleEditPdfUpload(picked);
                  e.target.value = '';
                }}
                className="w-full cursor-pointer rounded-md border border-line-strong bg-surface-deep p-2 text-sm text-ink-soft file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:bg-overlay file:text-ink hover:file:bg-overlay-strong disabled:opacity-50"
              />

              {editPdfUploading && <p className="text-xs text-ink-muted">Uploading PDF…</p>}
            </div>

            {/* Preview photos live in the dedicated uploader, not here — see the
                note in the create form above. Metadata-only edits keep this form
                focused. */}
          </form>
        </Modal>
      )}

      {/* PREVIEW IMAGE UPLOADER MODAL — pick a material, then fill its two slots */}
      {uploaderOpen && (
        <Modal
          isOpen={uploaderOpen}
          onClose={() => setUploaderOpen(false)}
          title="Preview Image Uploader"
          footer={
            <div className="flex items-center justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setUploaderOpen(false)}
              >
                Done
              </Button>
            </div>
          }
        >
          <div className="space-y-4 py-2 text-sm text-ink-soft">
            {formError && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {uploaderMaterialId === null ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-ink">Choose a material</label>
                  <p className="text-xs text-ink-muted">
                    Pick the material these two free-sample preview images belong to.
                  </p>
                </div>

                {materials.length === 0 ? (
                  <p className="text-sm text-ink-muted">No materials loaded on this page yet.</p>
                ) : (
                  <div className="max-h-72 space-y-2 overflow-y-auto">
                    {materials.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setUploaderMaterialId(m.id)}
                        className="w-full rounded-lg border border-line-strong bg-surface-deep p-3 text-left transition-colors hover:border-gold"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-medium text-ink">{m.title}</span>
                          <Badge variant={m.is_published ? 'success' : 'neutral'} size="sm">
                            {m.is_published ? 'Published' : 'Draft'}
                          </Badge>
                        </div>
                        <span className="mt-0.5 block text-xs text-ink-muted">{m.subject || 'General'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-ink">
                    {selectedUploaderMaterial?.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setUploaderMaterialId(null)}
                    className="shrink-0 text-xs font-medium text-info hover:underline"
                  >
                    Change material
                  </button>
                </div>

                <div className="rounded-lg border border-line-strong bg-surface-deep p-4 space-y-3">
                  <div>
                    <span className="block text-sm font-semibold text-ink">Box 1 — Page 1 Preview Image</span>
                    <span className="block text-xs text-ink-muted">High-quality crisp rendering</span>
                  </div>
                  <PreviewSlotPicker
                    slot={1}
                    file={null}
                    existingUrl={
                      selectedUploaderMaterial?.preview_images?.[0]
                        ? resolvePreviewUrl(selectedUploaderMaterial.preview_images[0])
                        : null
                    }
                    disabled={uploaderSaving}
                    onPick={(f) => handleUploaderPick(1, f)}
                  />
                </div>

                <div className="rounded-lg border border-line-strong bg-surface-deep p-4 space-y-3">
                  <div>
                    <span className="block text-sm font-semibold text-ink">Box 2 — Page 2 Preview Image</span>
                    <span className="block text-xs text-ink-muted">High-quality crisp rendering</span>
                  </div>
                  <PreviewSlotPicker
                    slot={2}
                    file={null}
                    existingUrl={
                      selectedUploaderMaterial?.preview_images?.[1]
                        ? resolvePreviewUrl(selectedUploaderMaterial.preview_images[1])
                        : null
                    }
                    disabled={uploaderSaving}
                    onPick={(f) => handleUploaderPick(2, f)}
                  />
                </div>

                {uploaderSaving && (
                  <p className="text-xs text-ink-muted">Saving preview image…</p>
                )}
              </>
            )}
          </div>
        </Modal>
      )}



      {/* VIEW MATERIAL DETAILS MODAL */}
      {viewMaterial && (
        <Modal
          isOpen={!!viewMaterial}
          onClose={() => setViewMaterial(null)}
          title="Material Details & Status"
          footer={
            <div className="flex items-center justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMaterial(null)}
              >
                Close
              </Button>
            </div>
          }
        >
          <div className="space-y-4 py-2 text-sm text-ink-soft">
            <div className="rounded-lg border border-line-strong bg-surface-deep p-4 space-y-3">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Title</span>
                <p className="text-sm font-semibold text-ink mt-0.5">{viewMaterial.title}</p>
              </div>

              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Description</span>
                <p className="text-ink-soft mt-0.5 leading-relaxed">{viewMaterial.description || 'No description provided.'}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-line-strong">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Subject</span>
                  <p className="font-medium text-ink">{viewMaterial.subject || 'General'}</p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Category</span>
                  <p className="font-medium text-ink">{viewMaterial.category || 'General'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-line-strong">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Reading Time</span>
                  <p className="font-medium text-ink tabular-nums">{viewMaterial.estimated_reading_minutes ? `${viewMaterial.estimated_reading_minutes} minutes` : 'N/A'}</p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Publication Status</span>
                  <p className={`font-semibold ${viewMaterial.is_published ? 'text-success' : 'text-ink-muted'}`}>
                    {viewMaterial.is_published ? 'Published' : 'Draft'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-line-strong">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">PDF Status</span>
                  <p className={`font-medium ${viewMaterial.file_path ? 'text-success' : 'text-ink-faint'}`}>
                    {viewMaterial.file_path ? 'PDF: Uploaded' : 'PDF: Not uploaded'}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Created Date</span>
                  <p className="font-medium text-ink-soft tabular-nums">
                    {viewMaterial.created_at ? new Date(viewMaterial.created_at).toLocaleString() : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-overlay border border-line-strong text-ink-muted text-xs flex items-center gap-2">
              <FileText className="w-4 h-4 text-ink-faint shrink-0" />
              <span>Private storage file paths and download URLs are fully secured and hidden from public inspection.</span>
            </div>
          </div>
        </Modal>
      )}

      {/* CONFIRM PUBLISH / UNPUBLISH MODAL */}
      {confirmPublishMaterial && (
        <Modal
          isOpen={!!confirmPublishMaterial}
          onClose={() => {
            setConfirmPublishMaterial(null);
            setFormError(null);
          }}
          title={confirmPublishMaterial.is_published ? 'Unpublish Material?' : 'Publish Material?'}
          footer={
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirmPublishMaterial(null);
                  setFormError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant={confirmPublishMaterial.is_published ? 'secondary' : 'primary'}
                size="sm"
                onClick={handleTogglePublish}
                disabled={formLoading}
              >
                {formLoading ? 'Processing...' : confirmPublishMaterial.is_published ? 'Confirm Unpublish' : 'Confirm Publish'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4 py-2 text-sm text-ink-soft">
            {formError && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
            <p>
              Are you sure you want to {confirmPublishMaterial.is_published ? 'unpublish' : 'publish'} <strong className="text-ink">{confirmPublishMaterial.title}</strong>?
            </p>
            {!confirmPublishMaterial.is_published && (!confirmPublishMaterial.file_path || confirmPublishMaterial.file_path.trim() === '') && (
              <div className="p-3 rounded-lg bg-overlay border border-line-strong text-ink-soft space-y-1">
                <p className="font-semibold">Upload a PDF before publishing this material.</p>
                <p className="text-xs text-ink-muted">Materials without a valid private PDF file path cannot be published.</p>
              </div>
            )}
            {confirmPublishMaterial.is_published ? (
              <p className="text-ink-muted">
                Unpublished materials will become Drafts and immediately disappear from normal user views.
              </p>
            ) : (
              <p className="text-ink-muted">
                Publishing makes this curriculum material available to normal users with entitlements.
              </p>
            )}
          </div>
        </Modal>
      )}

      {/* CONFIRM DELETE MODAL */}
      {confirmDeleteMaterial && (
        <Modal
          isOpen={!!confirmDeleteMaterial}
          onClose={() => {
            setConfirmDeleteMaterial(null);
            setFormError(null);
          }}
          title="Delete Material Permanently?"
          footer={
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirmDeleteMaterial(null);
                  setFormError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDeleteMaterial}
                disabled={formLoading}
              >
                {formLoading ? 'Deleting...' : 'Delete permanently'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4 py-2 text-sm text-ink-soft">
            {formError && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
            <p>
              Are you sure you want to delete <strong className="text-ink">{confirmDeleteMaterial.title}</strong>?
            </p>
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 space-y-1">
              <p className="font-semibold text-danger">Warning:</p>
              <p className="text-xs text-ink-soft">
                Deleting this material will permanently remove the material and its PDF from storage. Users who previously purchased it will no longer be able to access the material. (If the material has active financial payment records, it will be automatically archived/unpublished to protect financial records).
              </p>
            </div>
          </div>
        </Modal>
      )}

    </AdminLayout>
  );
};
