import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { getAdminSession } from '@/lib/serverAuth';
import {
  loadMultiDriveState,
  normalizeValidWebhook,
  PublicDriveSummary,
} from '@/lib/serverDrive';

export const dynamic = 'force-dynamic';

function isMissingMultiDriveColumnError(error: any): boolean {
  const msg = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    msg.includes('active_drive_id') ||
    msg.includes('gdrive_drives')
  );
}

/**
 * GET /api/admin/config
 * Admin-only: Returns safe multi-drive summary (NEVER exposes secret webhook URLs or Folder IDs).
 */
export async function GET(req: NextRequest) {
  if (!getAdminSession(req)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Admin sign-in required.' },
      { status: 401 }
    );
  }

  const client = getSupabaseClient();
  const state = await loadMultiDriveState(client);

  const drives: PublicDriveSummary[] = state.drives.map((d) => ({
    id: d.id,
    name: d.name,
    source: d.source,
    hasCustomFolder: Boolean(d.folderId),
    isActive: d.id === state.activeDriveId,
  }));

  return NextResponse.json({
    success: true,
    configured: drives.length > 0,
    activeDriveId: state.activeDriveId,
    drives,
    nextEnvSlotNumber: state.nextEnvSlotNumber,
    schemaNeedsMigration: state.schemaNeedsMigration,
  });
}

/**
 * POST /api/admin/config
 * Admin-only: Switch active upload drive, add a new drive to server vault, or remove a DB drive.
 */
export async function POST(req: NextRequest) {
  const adminSession = getAdminSession(req);
  if (!adminSession) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Admin sign-in required.' },
      { status: 401 }
    );
  }

  const client = getSupabaseClient();
  if (!client) {
    return NextResponse.json(
      { success: false, error: 'Supabase database is not configured.' },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const action = String(body?.action || '').trim();
    const state = await loadMultiDriveState(client);

    // 1. Switch which Drive receives all new uploads
    if (action === 'set-active') {
      const driveId = String(body?.driveId || '').trim();
      const target = state.drives.find((d) => d.id === driveId);
      if (!target) {
        return NextResponse.json(
          { success: false, error: 'Selected Drive was not found on server.' },
          { status: 404 }
        );
      }

      const { error } = await client
        .from('admin_credentials')
        .update({
          active_drive_id: target.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', adminSession.id || 'admin');

      if (error) {
        if (isMissingMultiDriveColumnError(error)) {
          return NextResponse.json(
            {
              success: false,
              schemaNeedsMigration: true,
              error: 'Run the Multi-Drive SQL update in Supabase SQL Editor first to switch active drives.',
            },
            { status: 400 }
          );
        }
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        activeDriveId: target.id,
        activeDriveName: target.name,
      });
    }

    // 2. Add a new Google Drive directly into server database (hidden from browser inspect)
    if (action === 'add-drive') {
      const name = String(body?.name || '').trim();
      const validUrl = normalizeValidWebhook(body?.webhookUrl);
      const folderId = String(body?.folderId || '').trim();
      const setActive = body?.setActive !== false;

      if (!name) {
        return NextResponse.json(
          { success: false, error: 'Please enter a Drive Name (e.g. Drive 2).' },
          { status: 400 }
        );
      }
      if (!validUrl) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Invalid Google Apps Script Web App URL. Make sure it starts with https://script.google.com/ and ends with /exec.',
          },
          { status: 400 }
        );
      }

      const existingDbDrives = state.drives
        .filter((d) => d.source === 'database' && d.id !== 'drive_1')
        .map((d) => ({
          id: d.id,
          name: d.name,
          webhookUrl: d.webhookUrl,
          folderId: d.folderId || null,
        }));

      const newId = `custom_${Date.now()}`;
      const nextDbDrives = [
        ...existingDbDrives,
        {
          id: newId,
          name,
          webhookUrl: validUrl,
          folderId: folderId || null,
        },
      ];

      const updatePayload: Record<string, any> = {
        gdrive_drives: nextDbDrives,
        updated_at: new Date().toISOString(),
      };
      if (setActive) {
        updatePayload.active_drive_id = newId;
      }

      const { error } = await client
        .from('admin_credentials')
        .update(updatePayload)
        .eq('id', adminSession.id || 'admin');

      if (error) {
        if (isMissingMultiDriveColumnError(error)) {
          return NextResponse.json(
            {
              success: false,
              schemaNeedsMigration: true,
              error: 'Run the Multi-Drive SQL update in Supabase SQL Editor first to save additional drives.',
            },
            { status: 400 }
          );
        }
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        addedDriveId: newId,
        activeDriveId: setActive ? newId : state.activeDriveId,
      });
    }

    // 3. Remove a database-stored extra Drive (Env drives are managed on Vercel)
    if (action === 'remove-drive') {
      const driveId = String(body?.driveId || '').trim();
      const target = state.drives.find((d) => d.id === driveId);
      if (!target) {
        return NextResponse.json({ success: false, error: 'Drive not found.' }, { status: 404 });
      }
      if (target.source === 'env') {
        return NextResponse.json(
          {
            success: false,
            error: 'Vercel Environment Variable drives can only be removed from Vercel Project Settings.',
          },
          { status: 400 }
        );
      }

      const remainingDbDrives = state.drives
        .filter((d) => d.source === 'database' && d.id !== 'drive_1' && d.id !== driveId)
        .map((d) => ({
          id: d.id,
          name: d.name,
          webhookUrl: d.webhookUrl,
          folderId: d.folderId || null,
        }));

      const remainingAll = state.drives.filter((d) => d.id !== driveId);
      const nextActiveId =
        state.activeDriveId === driveId ? remainingAll[0]?.id || null : state.activeDriveId;

      const updatePayload: Record<string, any> = {
        gdrive_drives: remainingDbDrives,
        active_drive_id: nextActiveId,
        updated_at: new Date().toISOString(),
      };
      if (driveId === 'drive_1') {
        updatePayload.gdrive_webhook = null;
        updatePayload.gdrive_folder_id = null;
      }

      const { error } = await client
        .from('admin_credentials')
        .update(updatePayload)
        .eq('id', adminSession.id || 'admin');

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        activeDriveId: nextActiveId,
      });
    }

    return NextResponse.json({ success: false, error: 'Unknown config action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to update admin config.' },
      { status: 500 }
    );
  }
}
