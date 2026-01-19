import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateUserRequest {
  action: 'create';
  email: string;
  password: string;
  fullName: string;
  role: 'admin' | 'employee';
}

interface DeleteUserRequest {
  action: 'delete';
  userId: string;
}

type RequestBody = CreateUserRequest | DeleteUserRequest;

// Helper to return generic error messages to clients
function errorResponse(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    if (!serviceRoleKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is not configured');
      return errorResponse('Service not properly configured', 500);
    }

    // Verify the calling user is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Unauthorized', 401);
    }

    // Create a client with the user's token to verify their identity
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('Auth error:', claimsError);
      return errorResponse('Invalid authentication', 401);
    }

    const callingUserId = claimsData.claims.sub;

    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if calling user is admin
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callingUserId)
      .maybeSingle();

    if (roleError || roleData?.role !== 'admin') {
      console.error('Not admin or role check failed:', roleError);
      return errorResponse('Admin access required', 403);
    }

    const body: RequestBody = await req.json();
    console.log('Request body:', { ...body, password: body.action === 'create' ? '[REDACTED]' : undefined });

    if (body.action === 'create') {
      // Create a new user
      const { email, password, fullName, role } = body;

      // Validate required fields
      if (!email || !password || !fullName) {
        return errorResponse('Email, password, and full name are required', 400);
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return errorResponse('Invalid email format', 400);
      }

      // Validate password strength
      if (password.length < 6) {
        return errorResponse('Password must be at least 6 characters', 400);
      }

      // Validate name length
      if (fullName.length > 100) {
        return errorResponse('Full name is too long', 400);
      }

      // Validate role
      if (role && !['admin', 'employee'].includes(role)) {
        return errorResponse('Invalid role', 400);
      }

      // Create user in auth.users
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError) {
        console.error('Error creating user:', createError);
        // Return user-friendly message for common errors
        if (createError.message.includes('already') || createError.message.includes('duplicate')) {
          return errorResponse('A user with this email already exists', 400);
        }
        return errorResponse('Failed to create user', 400);
      }

      console.log('User created in auth:', newUser.user.id);

      // Create profile
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          user_id: newUser.user.id,
          email: email,
          full_name: fullName,
        });

      if (profileError) {
        console.error('Error creating profile:', profileError);
        // Rollback: delete the auth user
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
        return errorResponse('Failed to create user profile', 500);
      }

      console.log('Profile created');

      // Create user role
      const { error: roleInsertError } = await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: newUser.user.id,
          role: role || 'employee',
        });

      if (roleInsertError) {
        console.error('Error creating role:', roleInsertError);
        // Rollback
        await supabaseAdmin.from('profiles').delete().eq('user_id', newUser.user.id);
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
        return errorResponse('Failed to assign user role', 500);
      }

      console.log('Role assigned:', role || 'employee');

      return new Response(
        JSON.stringify({ 
          success: true, 
          user: { 
            id: newUser.user.id, 
            email, 
            fullName,
            role: role || 'employee'
          } 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (body.action === 'delete') {
      const { userId } = body;

      if (!userId) {
        return errorResponse('User ID is required', 400);
      }

      // Validate userId format (UUID)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        return errorResponse('Invalid user ID format', 400);
      }

      // Prevent self-deletion
      if (userId === callingUserId) {
        return errorResponse('Cannot delete your own account', 400);
      }

      console.log('Deleting user:', userId);

      // Delete employee assignments
      await supabaseAdmin
        .from('employee_assignments')
        .delete()
        .eq('user_id', userId);

      // Delete task completions
      await supabaseAdmin
        .from('task_completions')
        .delete()
        .eq('user_id', userId);

      // Delete notifications
      await supabaseAdmin
        .from('notifications')
        .delete()
        .eq('user_id', userId);

      // Delete user role
      await supabaseAdmin
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      // Delete profile
      await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('user_id', userId);

      // Delete from auth.users
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

      if (deleteError) {
        console.error('Error deleting auth user:', deleteError);
        return errorResponse('Failed to delete user', 500);
      }

      console.log('User deleted successfully');

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return errorResponse('Invalid action', 400);

  } catch (error) {
    console.error('Unexpected error:', error);
    return errorResponse('An unexpected error occurred', 500);
  }
});
