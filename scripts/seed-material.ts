/**
 * Seed one material — PDF, metadata, and both preview pages — through the same
 * Supabase calls the admin UI makes.
 *
 * WHY THIS EXISTS
 * ---------------
 * The admin UI's create path is verified correct, but exercising it needs a
 * browser, an admin login, and manual file picking. This runs the identical
 * sequence headlessly so a failure reports the raw Supabase error instead of a
 * red banner you have to screenshot.
 *
 * WHY IT MIRRORS RATHER THAN IMPORTS `adminService`
 * -------------------------------------------------
 * `src/lib/supabase.ts` reads Vite's `import.meta.env`, which does not exist under
 * a plain Node runner — importing the services here would throw before the first
 * line ran. Mirroring keeps this script runnable with the already-installed `tsx`
 * and touches no application source. Every step below cites the function it
 * mirrors; if you change one of them, change this too.
 *
 * USAGE
 *   cp .env.example .env.seed    # then fill it in (never commit real credentials)
 *   npx tsx scripts/seed-material.ts
 *
 * Required env (reads .env first, then .env.seed, then the real environment):
 *   ADMIN_EMAIL, ADMIN_PASSWORD      an active admin account
 *   PDF_PATH                         path to the material PDF
 * Optional:
 *   PREVIEW1_PATH, PREVIEW2_PATH     page 1 / page 2 images (png, jpeg, webp)
 *   MATERIAL_TITLE, MATERIAL_DESCRIPTION, MATERIAL_CATEGORY (General|JUPEB)
 *   MATERIAL_PRICE (default 1500), MATERIAL_PUBLISHED (default true)
 */

import { createClient } from '@supabase/supabase-js';
import { File } from 'node:buffer';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

dotenv.config(); // .env
dotenv.config({ path: '.env.seed' }); // optional overrides

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const PDF_BUCKET = 'educational-materials'; // private, mirrors adminService.ts:431
const PREVIEW_BUCKET = 'material-previews'; // public, mirrors materialService.ts:132
const MAX_PDF = 50 * 1024 * 1024; // mirrors adminService.ts:398
const MAX_PREVIEW = 5 * 1024 * 1024; // mirrors adminService.ts:693
const PREVIEW_TYPES = ['image/png', 'image/jpeg', 'image/webp']; // mirrors :692

/** Supabase hides the useful half of a failure in details/hint. Print all of it. */
function describe(err: any): string {
  if (!err) return 'unknown error';
  return [err.message, err.details, err.hint, err.code && `code=${err.code}`]
    .filter(Boolean)
    .join(' | ');
}

function fail(step: string, err: any): never {
  console.error(`\n✗ FAILED at ${step}\n  ${describe(err)}\n`);
  process.exit(1);
}

/** Build a File from disk the way the browser's <input type="file"> would. */
function fileFrom(p: string, fallbackType: string): File {
  const abs = resolve(p);
  if (!existsSync(abs)) fail(`reading ${p}`, { message: `No such file: ${abs}` });
  const buf = readFileSync(abs);
  const name = abs.split(/[\\/]/).pop() || 'file';
  return new File([buf], name, { type: fallbackType });
}

function typeFor(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'application/octet-stream';
}

async function main() {
  // ---- Validate inputs -----------------------------------------------------
  const missing: string[] = [];
  if (!URL) missing.push('VITE_SUPABASE_URL');
  if (!ANON) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!process.env.ADMIN_EMAIL) missing.push('ADMIN_EMAIL');
  if (!process.env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
  if (!process.env.PDF_PATH) missing.push('PDF_PATH');
  if (missing.length) {
    console.error(`\nMissing required config: ${missing.join(', ')}\nSee the header of this file for usage.\n`);
    process.exit(1);
  }

  const supabase = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- 1. Sign in as admin (mirrors adminService.ts:377) -------------------
  console.log('→ Signing in as', process.env.ADMIN_EMAIL);
  const { data: auth, error: signInErr } = await supabase.auth.signInWithPassword({
    email: process.env.ADMIN_EMAIL!,
    password: process.env.ADMIN_PASSWORD!,
  });
  if (signInErr || !auth.user) fail('sign-in', signInErr);
  const userId = auth.user.id;
  console.log('  ✓ authenticated as', userId);

  // ---- 2. Confirm admin (mirrors adminService.ts:383) ---------------------
  const { data: profile, error: profErr } = await supabase
    .from('profiles').select('role, status').eq('id', userId).single();
  if (profErr) fail('reading profile', profErr);
  if (!profile || profile.role !== 'admin' || profile.status !== 'active') {
    fail('admin check', {
      message: `This account is not an active admin (role=${profile?.role}, status=${profile?.status}).`,
    });
  }
  console.log('  ✓ admin verified');

  // ---- 3. Read + validate the PDF (mirrors adminService.ts:393-402) --------
  const pdf = fileFrom(process.env.PDF_PATH!, 'application/pdf');
  if (!pdf.name.toLowerCase().endsWith('.pdf') && pdf.type !== 'application/pdf') {
    fail('PDF type check', { message: `Not a PDF: ${pdf.name} (${pdf.type})` });
  }
  if (pdf.size > MAX_PDF) {
    fail('PDF size check', { message: `${(pdf.size / 1048576).toFixed(1)} MB exceeds the 50 MB limit.` });
  }
  console.log(`  ✓ PDF ${pdf.name} (${(pdf.size / 1024).toFixed(0)} KB)`);

  const isPublished = (process.env.MATERIAL_PUBLISHED ?? 'true').toLowerCase() !== 'false';

  // The table enforces `materials_flagship_price_check CHECK (price = 1500)`, so
  // any other value dies at INSERT with an opaque constraint error. Fail fast,
  // with a message that says which value and why.
  const rawPrice = process.env.MATERIAL_PRICE ?? '1500';
  const price = Number(rawPrice);
  if (!Number.isFinite(price) || price !== 1500) {
    fail('price check', {
      message:
        `MATERIAL_PRICE must be exactly 1500 (got "${rawPrice}"). ` +
        `The database enforces materials_flagship_price_check.`,
    });
  }

  // ---- 4. Insert the material row (mirrors adminService.ts:404-423) --------
  const insertPayload = {
    title: (process.env.MATERIAL_TITLE || 'EduVault Flagship Study Guide').trim(),
    description: (process.env.MATERIAL_DESCRIPTION || '').trim() || null,
    subject: 'General',
    category: (process.env.MATERIAL_CATEGORY || 'General').trim(),
    file_path: null, // set in step 5, once the upload confirms
    estimated_reading_minutes: Number(process.env.MATERIAL_READING_MINUTES ?? '15'),
    is_published: isPublished,
    price,
  };
  console.log('→ Inserting material row', { ...insertPayload, title: insertPayload.title });
  const { data: mat, error: insertErr } = await supabase
    .from('materials').insert(insertPayload).select().single();
  if (insertErr || !mat) fail('INSERT into materials', insertErr);
  console.log('  ✓ material id', mat.id);

  // ---- 5. Upload the PDF + link file_path (mirrors adminService.ts:426-463) -
  const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.pdf`;
  const storagePath = `materials/${mat.id}/${uniqueFileName}`;
  console.log('→ Uploading PDF to', `${PDF_BUCKET}/${storagePath}`);
  const { error: upErr } = await supabase.storage
    .from(PDF_BUCKET).upload(storagePath, pdf, { cacheControl: '3600', upsert: false });
  if (upErr) {
    await supabase.from('materials').delete().eq('id', mat.id); // rollback, mirrors :439
    fail('upload to ' + PDF_BUCKET, upErr);
  }

  // .select() is not optional: without it a blocked UPDATE reports success and
  // leaves file_path NULL while the PDF sits orphaned in storage (mirrors :443).
  const { data: pathRows, error: pathErr } = await supabase
    .from('materials').update({ file_path: storagePath }).eq('id', mat.id).select('id');
  if (pathErr || !pathRows || pathRows.length === 0) {
    await supabase.storage.from(PDF_BUCKET).remove([storagePath]);
    await supabase.from('materials').delete().eq('id', mat.id);
    fail('linking file_path (UPDATE returned no row)', pathErr);
  }
  console.log('  ✓ file_path =', storagePath);

  // ---- 6. Upload each preview slot (mirrors setPreviewSlot, :691-757) ------
  const previewPaths = [process.env.PREVIEW1_PATH, process.env.PREVIEW2_PATH];
  const next: string[] = ['', ''];

  for (let i = 0; i < previewPaths.length; i++) {
    const p = previewPaths[i];
    const slot = (i + 1) as 1 | 2;
    if (!p) continue;

    const img = fileFrom(p, typeFor(p));
    if (!PREVIEW_TYPES.includes(img.type)) {
      fail(`preview ${slot} type`, { message: `${img.type} is not PNG/JPEG/WebP.` });
    }
    if (img.size > MAX_PREVIEW) {
      fail(`preview ${slot} size`, { message: `${(img.size / 1048576).toFixed(1)} MB exceeds 5 MB.` });
    }

    const ext = (img.name.split('.').pop() || 'png').toLowerCase();
    const path = `previews/${mat.id}/page-${slot}-${Date.now()}.${ext}`;
    console.log(`→ Uploading preview ${slot} to ${PREVIEW_BUCKET}/${path}`);

    const { error: imgErr } = await supabase.storage
      .from(PREVIEW_BUCKET).upload(path, img, { cacheControl: '3600', upsert: true });
    if (imgErr) fail(`upload preview ${slot}`, imgErr);

    const { data: pub } = supabase.storage.from(PREVIEW_BUCKET).getPublicUrl(path);
    next[slot - 1] = pub.publicUrl;
    console.log(`  ✓ page ${slot} → ${pub.publicUrl}`);
  }

  if (next.some(Boolean)) {
    // Trim only TRAILING empties — index 0 must stay Page 1, index 1 Page 2.
    // Compacting with .filter(Boolean) is what used to slide page 2 into slot 1.
    const finalUrls = [...next];
    while (finalUrls.length > 0 && !finalUrls[finalUrls.length - 1]) finalUrls.pop();

    const { error: prevErr } = await supabase
      .from('materials').update({ preview_images: finalUrls }).eq('id', mat.id);
    if (prevErr) fail('writing preview_images', prevErr);
    console.log('  ✓ preview_images =', finalUrls.length, 'entr(ies)');
  } else {
    console.log('  · no preview images supplied — add them later via the row "Previews" button');
  }

  // ---- 7. Audit row (mirrors adminService.ts:479) --------------------------
  // Non-fatal: a failure here must not invalidate a material that saved fine.
  const { error: logErr } = await supabase.from('access_logs').insert({
    user_id: userId,
    material_id: mat.id,
    event_type: 'material_created',
    metadata: { title: mat.title, is_published: mat.is_published, price: mat.price, seeded: true },
  });
  if (logErr) console.warn('  · audit log skipped:', describe(logErr));

  // ---- Done ----------------------------------------------------------------
  console.log('\n✓ Material created');
  console.log('  id           ', mat.id);
  console.log('  title        ', mat.title);
  console.log('  published    ', mat.is_published);
  console.log('  price        ', mat.price);
  console.log('  file_path    ', storagePath);
  console.log('  previews     ', next.filter(Boolean).length);
  if (!isPublished) {
    console.log('\n  NOTE: saved as a DRAFT — the homepage hero reads published materials only.');
  }
  console.log('\n  Check it at: /material\n');
}

main().catch((err) => fail('unexpected', err));
