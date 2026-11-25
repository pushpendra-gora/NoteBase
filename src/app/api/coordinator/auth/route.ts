import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function isBranchMatch(coordBranch: string, targetBranch: string): boolean {
  if (!coordBranch || !targetBranch) return false;
  const cleanCoord = coordBranch.trim().toLowerCase();
  const cleanTarget = targetBranch.trim().toLowerCase();
  if (cleanCoord === cleanTarget) return true;

  // CSE(AI&ML) variations
  if (
    (cleanCoord.includes('ai') && cleanCoord.includes('ml')) &&
    (cleanTarget.includes('ai') && cleanTarget.includes('ml'))
  ) {
    return true;
  }
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { year, branch, password } = body;

    if (!year || !branch) {
      return NextResponse.json(
        { success: false, error: 'Please select both Year and Branch.' },
        { status: 400 }
      );
    }

    if (!password || !password.trim()) {
      return NextResponse.json(
        { success: false, error: 'Please enter Coordinator Password.' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Database service is currently unreachable.' },
        { status: 503 }
      );
    }

    // Query coordinator records for this year from Supabase securely on server
    const { data, error } = await client
      .from('coordinators')
      .select('id, name, branch, year, initials, status, password')
      .eq('year', year);

    if (error || !data || data.length === 0) {
      return NextResponse.json(
        { success: false, error: `No coordinator account found for ${year} - ${branch}. Please ask Admin to register you first.` },
        { status: 404 }
      );
    }

    // Find coordinator matching branch
    const matchingCoord = data.find((c) => isBranchMatch(c.branch, branch));

    if (!matchingCoord) {
      return NextResponse.json(
        { success: false, error: `No coordinator account found for ${year} - ${branch}. Please ask Admin to register you first.` },
        { status: 404 }
      );
    }

    if (matchingCoord.status === 'Inactive') {
      return NextResponse.json(
        { success: false, error: 'Your coordinator account is currently set to Inactive. Please contact Admin.' },
        { status: 403 }
      );
    }

    const inputPassword = password.trim();
    const correctPassword = (matchingCoord.password || '').trim();

    if (!correctPassword || inputPassword !== correctPassword) {
      return NextResponse.json(
        { success: false, error: 'Incorrect password! Please enter the valid coordinator password assigned by Admin.' },
        { status: 401 }
      );
    }

    // Success: Return coordinator info WITHOUT password
    return NextResponse.json({
      success: true,
      coordinator: {
        id: matchingCoord.id,
        name: matchingCoord.name,
        branch: matchingCoord.branch,
        year: matchingCoord.year,
        initials: matchingCoord.initials,
      },
    });
  } catch (error: any) {
    console.error('Coordinator Auth Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error.' },
      { status: 500 }
    );
  }
}
